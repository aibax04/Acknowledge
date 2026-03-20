import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_, func, extract
from app.database import get_db
from app.models.user import User, UserRole
from app.models.leave import LeaveRequest, LeaveType, LeaveStatus, LeaveBalanceAdjustment
from app.models.custom_leave_policy import CustomLeavePolicy
from app.routes.auth import get_current_user
from app.schemas.leave_schema import (
    LeaveApplyRequest, LeaveResponse, LeaveReviewRequest, LeaveBalanceResponse,
    CustomLeavePolicyCreate, CustomLeavePolicyUpdate, CustomLeavePolicyResponse,
    LeaveAdjustmentCreate, LeaveAdjustmentResponse
)
from datetime import datetime, date, timezone, timedelta
from typing import List, Optional

router = APIRouter(prefix="/leaves", tags=["leaves"])


def count_working_days(start: date, end: date, office: str) -> float:
    """Count working days between two dates (excluding weekends based on office)."""
    days = 0
    d = start
    while d <= end:
        weekday = d.weekday()
        if office == "panscience":
            if weekday not in (5, 6):  # Not Saturday/Sunday
                days += 1
        elif office == "eigen":
            if weekday != 6:  # Not Sunday
                days += 1
        else:
            if weekday != 6:
                days += 1
        d += timedelta(days=1)
    return float(days)


def _working_days_in_month(range_start: date, range_end: date, year: int, month: int, office: str) -> float:
    """Working days of the range that fall in the given (year, month)."""
    first = date(year, month, 1)
    if month == 12:
        last = date(year, 12, 31)
    else:
        last = date(year, month + 1, 1) - timedelta(days=1)
    s = max(range_start, first)
    e = min(range_end, last)
    if s > e:
        return 0.0
    return count_working_days(s, e, office)


def _working_days_in_year(range_start: date, range_end: date, year: int, office: str) -> float:
    """Working days of the range that fall in the given year."""
    first = date(year, 1, 1)
    last = date(year, 12, 31)
    s = max(range_start, first)
    e = min(range_end, last)
    if s > e:
        return 0.0
    return count_working_days(s, e, office)


async def _compute_wallet_for_policy(
    db: AsyncSession,
    user_id: int,
    policy: "CustomLeavePolicy",
    year: int,
    office: str = "eigen",
    policy_ids_in_group: Optional[List[int]] = None,
) -> Optional[float]:
    """
    Compute leave wallet (balance) when policy has monthly_allowance.
    Wallet = (monthly_allowance * months_elapsed_this_year) - used_this_year + adjustments.
    Unused days from previous months carry over (accrued each month).
    """
    monthly_allowance = getattr(policy, "monthly_allowance", None)
    if monthly_allowance is None or float(monthly_allowance) <= 0:
        return None
    today = date.today()
    if year != today.year:
        months_elapsed = 12
    else:
        months_elapsed = today.month
    accrued = monthly_allowance * months_elapsed
    ids = list(policy_ids_in_group) if policy_ids_in_group else [policy.id]
    year_first = date(year, 1, 1)
    year_last = date(year, 12, 31)
    result = await db.execute(
        select(LeaveRequest).filter(
            LeaveRequest.user_id == user_id,
            LeaveRequest.custom_policy_id.in_(ids),
            LeaveRequest.status.in_([LeaveStatus.APPROVED, LeaveStatus.PENDING]),
            LeaveRequest.start_date <= year_last,
            LeaveRequest.end_date >= year_first,
        )
    )
    leaves = result.scalars().all()
    used = sum(
        _working_days_in_year(l.start_date, l.end_date, year, office)
        for l in leaves
    )
    adjustments = await _get_adjustments_for_user_year(db, user_id, year)
    adj_sum = sum(a.adjustment_days for a in adjustments if a.custom_policy_id is not None and a.custom_policy_id in ids)
    wallet = accrued - used + adj_sum
    return max(0.0, round(wallet, 2))


def compute_leave_balance(user: User, approved_leaves: list, current_year: int):
    """Compute leave balance for a user."""
    today = date.today()
    joining = getattr(user, "joining_date", None)
    if joining is None or not isinstance(joining, date):
        try:
            joining = user.created_at.date() if getattr(user, "created_at", None) else date(current_year, 1, 1)
        except (AttributeError, TypeError):
            joining = date(current_year, 1, 1)
    if not isinstance(joining, date):
        joining = date(current_year, 1, 1)
    year_start = date(current_year, 1, 1)
    effective_start = max(joining, year_start)

    # Months elapsed from effective start to today (in current year)
    if effective_start.year < current_year:
        months_elapsed = today.month
    else:
        months_elapsed = today.month - effective_start.month + 1
    months_elapsed = max(0, min(months_elapsed, 12))

    # EL: 1.25 per month, max 15 per year
    el_accrued = round(min(months_elapsed * 1.25, 15.0), 2)
    el_used = sum(
        getattr(l, "num_days", 0) or 0 for l in approved_leaves
        if getattr(l, "leave_type", None) == LeaveType.EARNED_LEAVE
        and getattr(l, "start_date", None) and getattr(l.start_date, "year", None) == current_year
    )

    # CSL: 1 per month, max 12 per year (no carry forward) — shared by casual + sick (+ legacy casual_sick)
    csl_accrued = round(min(months_elapsed * 1.0, 12.0), 2)
    csl_used = sum(
        getattr(l, "num_days", 0) or 0 for l in approved_leaves
        if getattr(l, "leave_type", None) in (LeaveType.CASUAL_SICK_LEAVE, LeaveType.CASUAL_LEAVE, LeaveType.SICK_LEAVE)
        and getattr(l, "start_date", None) and getattr(l.start_date, "year", None) == current_year
    )

    is_on_probation = user.is_on_probation or False
    can_use_el = not is_on_probation

    return {
        "earned_leave_accrued": el_accrued,
        "earned_leave_used": el_used,
        "earned_leave_balance": max(0, el_accrued - el_used),
        "casual_sick_leave_accrued": csl_accrued,
        "casual_sick_leave_used": csl_used,
        "casual_sick_leave_balance": max(0, csl_accrued - csl_used),
        "is_on_probation": is_on_probation,
        "can_use_earned_leave": can_use_el,
        "joining_date": joining.isoformat() if joining else None
    }


async def _get_adjustments_for_user_year(db: AsyncSession, user_id: int, year: int):
    """Fetch all leave balance adjustments for a user in a given year."""
    result = await db.execute(
        select(LeaveBalanceAdjustment).filter(
            LeaveBalanceAdjustment.user_id == user_id,
            LeaveBalanceAdjustment.year == year
        ).order_by(LeaveBalanceAdjustment.created_at.desc())
    )
    return result.scalars().all()


@router.get("/balance")
async def get_leave_balance(
    user_id: Optional[int] = Query(None, description="Target user ID (directors only)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get leave balance. Without user_id returns current user's; with user_id only directors can query another user."""
    target_user_id = current_user.id
    target_user = current_user
    if user_id is not None:
        if current_user.role != UserRole.SENIOR:
            raise HTTPException(status_code=403, detail="Only directors can view another user's balance")
        target_user = await db.get(User, user_id)
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
        target_user_id = user_id

    if target_user.role == UserRole.INTERN:
        current_year = date.today().year
        adjustments = await _get_adjustments_for_user_year(db, target_user_id, current_year)
        return {
            "earned_leave_accrued": 0,
            "earned_leave_used": 0,
            "earned_leave_balance": 0,
            "casual_sick_leave_accrued": 0,
            "casual_sick_leave_used": 0,
            "casual_sick_leave_balance": 0,
            "is_on_probation": False,
            "can_use_earned_leave": False,
            "joining_date": None,
            "is_intern": True,
            "message": "Interns are eligible for unpaid leave only.",
            "adjustments": [
                {"leave_type": a.leave_type, "custom_policy_id": a.custom_policy_id, "adjustment_days": a.adjustment_days, "reason": a.reason}
                for a in adjustments
            ]
        }

    current_year = date.today().year
    result = await db.execute(
        select(LeaveRequest).filter(
            LeaveRequest.user_id == target_user_id,
            LeaveRequest.status == LeaveStatus.APPROVED
        )
    )
    approved_leaves = result.scalars().all()

    balance = compute_leave_balance(target_user, approved_leaves, current_year)

    # Apply adjustments for standard leave types
    adjustments = await _get_adjustments_for_user_year(db, target_user_id, current_year)
    el_adj = sum(a.adjustment_days for a in adjustments if a.leave_type == "earned_leave")
    csl_adj = sum(a.adjustment_days for a in adjustments if a.leave_type == "casual_sick_leave")
    balance["earned_leave_balance"] = max(0, balance["earned_leave_balance"] + el_adj)
    balance["casual_sick_leave_balance"] = max(0, balance["casual_sick_leave_balance"] + csl_adj)
    balance["adjustments"] = [
        {"leave_type": a.leave_type, "custom_policy_id": a.custom_policy_id, "adjustment_days": a.adjustment_days, "reason": a.reason}
        for a in adjustments
    ]
    return balance


@router.get("/adjustments", response_model=List[LeaveAdjustmentResponse])
async def list_leave_adjustments(
    user_id: int = Query(..., description="User whose adjustments to list"),
    year: int = Query(..., description="Year (e.g. 2025)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List leave balance adjustments for a user in a year. Directors can pass any user_id; others only their own."""
    if current_user.role != UserRole.SENIOR and user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only view your own adjustments")
    adjustments = await _get_adjustments_for_user_year(db, user_id, year)
    return [
        LeaveAdjustmentResponse(
            id=a.id, user_id=a.user_id, year=a.year, leave_type=a.leave_type,
            custom_policy_id=a.custom_policy_id, adjustment_days=a.adjustment_days,
            reason=a.reason, created_by_id=a.created_by_id, created_at=a.created_at
        )
        for a in adjustments
    ]


@router.post("/adjustments", response_model=LeaveAdjustmentResponse)
async def create_leave_adjustment(
    body: LeaveAdjustmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a leave balance adjustment. Directors only. Exactly one of leave_type or custom_policy_id must be set."""
    if current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="Only directors can adjust leave balances")
    if (body.leave_type is None) == (body.custom_policy_id is None):
        raise HTTPException(
            status_code=400,
            detail="Exactly one of leave_type (earned_leave or casual_sick_leave) or custom_policy_id must be set"
        )
    if body.leave_type is not None and body.leave_type not in ("earned_leave", "casual_sick_leave"):
        raise HTTPException(status_code=400, detail="leave_type must be earned_leave or casual_sick_leave")
    target = await db.get(User, body.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if body.custom_policy_id is not None:
        policy = await db.get(CustomLeavePolicy, body.custom_policy_id)
        if not policy:
            raise HTTPException(status_code=404, detail="Custom leave policy not found")
    adj = LeaveBalanceAdjustment(
        user_id=body.user_id,
        year=body.year,
        leave_type=body.leave_type,
        custom_policy_id=body.custom_policy_id,
        adjustment_days=body.adjustment_days,
        reason=(body.reason or "").strip() or "Adjusted by director",
        created_by_id=current_user.id,
    )
    db.add(adj)
    await db.commit()
    await db.refresh(adj)
    return LeaveAdjustmentResponse(
        id=adj.id, user_id=adj.user_id, year=adj.year, leave_type=adj.leave_type,
        custom_policy_id=adj.custom_policy_id, adjustment_days=adj.adjustment_days,
        reason=adj.reason, created_by_id=adj.created_by_id, created_at=adj.created_at
    )


@router.post("/apply")
async def apply_leave(
    req: LeaveApplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Apply for leave.

    Leave policy:
    - Casual/Sick Leave (CSL): Can be applied anytime; 1 day/month, max 12/year (shared pool).
    - Earned Leave (EL): 7 calendar days in advance; 1.25 days/month, max 15/year; not during probation.
    - Unpaid Leave: Available to all; interns are eligible for unpaid leave only.
    """
    try:
        return await _apply_leave_impl(req, db, current_user)
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Leave apply failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to submit leave. Please try again or contact support.")


async def _apply_leave_impl(req: LeaveApplyRequest, db: AsyncSession, current_user: User):
    today = date.today()

    # Validate dates
    if req.start_date > req.end_date:
        raise HTTPException(status_code=400, detail="Start date must be before or equal to end date")
    if req.start_date < today:
        raise HTTPException(status_code=400, detail="Cannot apply for past dates")

    leave_type = LeaveType(req.leave_type)

    if leave_type != LeaveType.CUSTOM:
        raise HTTPException(
            status_code=400,
            detail="Only leave types created by the director are available. Please select a leave policy from the dropdown."
        )

    if leave_type == LeaveType.CUSTOM:
        if not req.custom_policy_id:
            raise HTTPException(status_code=400, detail="Custom policy is required when applying for custom leave")
        policy_result = await db.execute(
            select(CustomLeavePolicy).filter(CustomLeavePolicy.id == req.custom_policy_id)
        )
        policy = policy_result.scalars().first()
        if not policy:
            raise HTTPException(status_code=404, detail="Custom leave policy not found")
        if not policy.created_by_id:
            raise HTTPException(status_code=400, detail="This leave policy is invalid; only policies created by a director can be used")
        creator = await db.get(User, policy.created_by_id)
        if not creator or creator.role != UserRole.SENIOR:
            raise HTTPException(status_code=400, detail="Only leaves under policies created by a director are allowed")
        allowed_roles_str = getattr(policy, "allowed_roles", None) or ""
        allowed = [r.strip().lower() for r in allowed_roles_str.split(",") if r.strip()]
        role_obj = getattr(current_user, "role", None)
        role_val = getattr(role_obj, "value", None) if role_obj is not None else None
        if role_val not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"This leave type is not available for your role. It is for: {', '.join(allowed)}"
            )
        # Probation check for custom leave policies
        is_user_on_probation = getattr(current_user, "is_on_probation", False) or False
        policy_allows_probation = getattr(policy, "allowed_on_probation", True)
        if policy_allows_probation is None:
            policy_allows_probation = True
        if is_user_on_probation and not policy_allows_probation:
            raise HTTPException(
                status_code=403,
                detail="This leave type is not available for employees on probation period."
            )
        days_advance = (req.start_date - today).days
        if days_advance < policy.prior_days:
            raise HTTPException(
                status_code=400,
                detail=f"This leave requires applying at least {policy.prior_days} calendar days in advance"
            )
        _office = str(getattr(current_user, "office", None) or "").strip().lower()
        office_for_policy = "eigen" if _office == "igen" else ("panscience" if _office == "panscience" else "eigen")

        # Wallet check: when policy has monthly_allowance, user can only apply up to wallet (accrued - used + adjustments)
        if getattr(policy, "monthly_allowance", None) is not None and float(policy.monthly_allowance) > 0:
            requested_days = count_working_days(req.start_date, req.end_date, office_for_policy)
            if requested_days > 0:
                policy_ids_for_wallet = [policy.id]
                if getattr(policy, "policy_group_key", None):
                    group_result = await db.execute(
                        select(CustomLeavePolicy.id).filter(
                            CustomLeavePolicy.policy_group_key == policy.policy_group_key
                        )
                    )
                    policy_ids_for_wallet = [row[0] for row in group_result.all()]
                wallet = await _compute_wallet_for_policy(
                    db, current_user.id, policy, req.start_date.year, office_for_policy, policy_ids_for_wallet
                )
                if wallet is not None and requested_days > wallet:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Leave wallet balance is {wallet} days. You cannot apply for more than your available balance (unused days carry over each month)."
                    )

        # Enforce max days per month if set
        if getattr(policy, "max_days_per_month", None) is not None:
            month_start = req.start_date
            while month_start <= req.end_date:
                y, m = month_start.year, month_start.month
                new_in_month = _working_days_in_month(req.start_date, req.end_date, y, m, office_for_policy)
                if new_in_month > 0:
                    existing_result = await db.execute(
                        select(LeaveRequest).filter(
                            LeaveRequest.user_id == current_user.id,
                            LeaveRequest.custom_policy_id == policy.id,
                            LeaveRequest.status.in_([LeaveStatus.PENDING, LeaveStatus.APPROVED]),
                            LeaveRequest.start_date <= (date(y, m + 1, 1) - timedelta(days=1) if m < 12 else date(y, 12, 31)),
                            LeaveRequest.end_date >= date(y, m, 1)
                        )
                    )
                    existing_leaves = existing_result.scalars().all()
                    existing_in_month = sum(
                        _working_days_in_month(l.start_date, l.end_date, y, m, office_for_policy)
                        for l in existing_leaves
                    )
                    if existing_in_month + new_in_month > policy.max_days_per_month:
                        raise HTTPException(
                            status_code=400,
                            detail=f"This policy allows at most {policy.max_days_per_month} days per month. In {y}-{m:02d} you would have {existing_in_month + new_in_month:.1f} days (existing + requested)."
                        )
                if m == 12:
                    month_start = date(y + 1, 1, 1)
                else:
                    month_start = date(y, m + 1, 1)

        # Enforce shared annual pool across grouped sub-types (if configured).
        if getattr(policy, "policy_group_key", None) and getattr(policy, "shared_annual_limit", None):
            group_result = await db.execute(
                select(CustomLeavePolicy.id).filter(
                    CustomLeavePolicy.policy_group_key == policy.policy_group_key
                )
            )
            group_policy_ids = [row[0] for row in group_result.all()]
            if group_policy_ids:
                start_year = req.start_date.year
                end_year = req.end_date.year
                for y in range(start_year, end_year + 1):
                    new_in_year = _working_days_in_year(req.start_date, req.end_date, y, office_for_policy)
                    if new_in_year <= 0:
                        continue
                    year_first = date(y, 1, 1)
                    year_last = date(y, 12, 31)
                    existing_result = await db.execute(
                        select(LeaveRequest).filter(
                            LeaveRequest.user_id == current_user.id,
                            LeaveRequest.leave_type == LeaveType.CUSTOM,
                            LeaveRequest.custom_policy_id.in_(group_policy_ids),
                            LeaveRequest.status.in_([LeaveStatus.PENDING, LeaveStatus.APPROVED]),
                            LeaveRequest.start_date <= year_last,
                            LeaveRequest.end_date >= year_first
                        )
                    )
                    existing_group_leaves = existing_result.scalars().all()
                    existing_in_year = sum(
                        _working_days_in_year(l.start_date, l.end_date, y, office_for_policy)
                        for l in existing_group_leaves
                    )
                    proposed = existing_in_year + new_in_year
                    if proposed > policy.shared_annual_limit:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"Shared annual limit exceeded for this leave family. "
                                f"Limit: {policy.shared_annual_limit} days/year, "
                                f"Year {y}: existing {existing_in_year:.1f} + requested {new_in_year:.1f} = {proposed:.1f}."
                            )
                        )

    # Interns can only take unpaid leave (for standard types; custom is allowed if policy permits)
    if current_user.role == UserRole.INTERN and leave_type != LeaveType.CUSTOM:
        if leave_type != LeaveType.UNPAID_LEAVE:
            raise HTTPException(status_code=400, detail="Interns are eligible for unpaid leave only")

    _office = (getattr(current_user, "office", None) or "")
    _office = str(_office).strip().lower() if _office else "eigen"
    office = "eigen" if _office == "igen" else ("panscience" if _office == "panscience" else "eigen")
    num_days = count_working_days(req.start_date, req.end_date, office)
    if num_days <= 0:
        raise HTTPException(status_code=400, detail="No working days in the selected range")

    # EL specific validations: 7 days in advance
    if leave_type == LeaveType.EARNED_LEAVE:
        days_advance = (req.start_date - today).days
        if days_advance < 7:
            raise HTTPException(
                status_code=400,
                detail="Earned Leave must be applied at least 7 calendar days in advance"
            )
        if getattr(current_user, "is_on_probation", False):
            raise HTTPException(
                status_code=400,
                detail="Earned Leave cannot be availed during the probation period. It will accrue and be available after confirmation."
            )
        result = await db.execute(
            select(LeaveRequest).filter(
                LeaveRequest.user_id == current_user.id,
                LeaveRequest.status == LeaveStatus.APPROVED
            )
        )
        approved_leaves = result.scalars().all()
        balance = compute_leave_balance(current_user, approved_leaves, today.year)
        if num_days > balance["earned_leave_balance"]:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient EL balance. Available: {balance['earned_leave_balance']} days, Requested: {num_days} days"
            )

    # Casual/Sick leave: can apply anytime, same pool (1/month, max 12/year)
    if leave_type == LeaveType.CASUAL_SICK_LEAVE:
        result = await db.execute(
            select(LeaveRequest).filter(
                LeaveRequest.user_id == current_user.id,
                LeaveRequest.status == LeaveStatus.APPROVED
            )
        )
        approved_leaves = result.scalars().all()
        balance = compute_leave_balance(current_user, approved_leaves, today.year)
        if num_days > balance["casual_sick_leave_balance"]:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient CSL balance. Available: {balance['casual_sick_leave_balance']} days, Requested: {num_days} days"
            )

    # Check for overlapping leave requests
    result = await db.execute(
        select(LeaveRequest).filter(
            LeaveRequest.user_id == current_user.id,
            LeaveRequest.status.in_([LeaveStatus.PENDING, LeaveStatus.APPROVED]),
            LeaveRequest.start_date <= req.end_date,
            LeaveRequest.end_date >= req.start_date
        )
    )
    overlapping = result.scalars().first()
    if overlapping:
        raise HTTPException(
            status_code=400,
            detail=f"You already have a {overlapping.status.value} leave request for overlapping dates"
        )

    reason_text = (getattr(req, "reason", None) or "").strip() or "—"
    num_days_val = float(num_days) if num_days is not None else 0.0
    leave = LeaveRequest(
        user_id=current_user.id,
        leave_type=leave_type,
        custom_policy_id=req.custom_policy_id if leave_type == LeaveType.CUSTOM else None,
        start_date=req.start_date,
        end_date=req.end_date,
        num_days=num_days_val,
        reason=reason_text,
        status=LeaveStatus.PENDING
    )
    db.add(leave)
    try:
        await db.commit()
        await db.refresh(leave)
    except Exception as db_err:
        await db.rollback()
        logging.exception("Leave apply db error: %s", db_err)
        raise HTTPException(
            status_code=500,
            detail="Failed to save leave request. Please try again or contact support."
        )

    return {"message": "Leave request submitted successfully", "id": leave.id, "num_days": num_days_val}


# --- Custom Leave Policies (directors create; applications approved by director) - routes first to avoid path conflicts ---
def _policy_to_response(p: CustomLeavePolicy, created_by_name: str = None) -> dict:
    roles = [r.strip() for r in p.allowed_roles.split(",") if r.strip()]
    return {
        "id": p.id,
        "title": p.title,
        "prior_days": p.prior_days,
        "max_days_per_month": getattr(p, "max_days_per_month", None),
        "monthly_allowance": getattr(p, "monthly_allowance", None),
        "policy_group_key": getattr(p, "policy_group_key", None),
        "sub_type_name": getattr(p, "sub_type_name", None),
        "shared_annual_limit": getattr(p, "shared_annual_limit", None),
        "allowed_roles": roles,
        "allowed_on_probation": getattr(p, "allowed_on_probation", True),
        "created_by_id": p.created_by_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "created_by_name": created_by_name,
    }


async def _list_custom_leave_policies_impl(for_apply: bool, db: AsyncSession, current_user: User):
    """List custom leave policies. Only includes policies created by a director (SENIOR)."""
    result = await db.execute(select(CustomLeavePolicy).order_by(CustomLeavePolicy.created_at.desc()))
    policies = result.scalars().all()
    out = []
    role_val = current_user.role.value
    for p in policies:
        creator = None
        if p.created_by_id:
            u = await db.get(User, p.created_by_id)
            if not u or u.role != UserRole.SENIOR:
                continue
            creator = u.full_name
        if for_apply:
            allowed = [r.strip().lower() for r in p.allowed_roles.split(",") if r.strip()]
            if role_val not in allowed:
                continue
        out.append(_policy_to_response(p, creator))
    return out


@router.get("/custom-policies", response_model=List[CustomLeavePolicyResponse])
@router.get("/custom-policies/list", response_model=List[CustomLeavePolicyResponse])
async def list_custom_leave_policies(
    for_apply: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List custom leave policies. If for_apply=true, only returns policies available for current user's role."""
    return await _list_custom_leave_policies_impl(for_apply, db, current_user)

@router.get("/user-policies/{user_id}", response_model=List[CustomLeavePolicyResponse])
async def list_user_policies(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List policies available to a specific user. Intended for Managers/Directors."""
    if current_user.role not in (UserRole.MANAGER, UserRole.SENIOR):
        raise HTTPException(status_code=403, detail="Not authorized")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return await _list_custom_leave_policies_impl(True, db, user)


@router.post("/custom-policies/create", response_model=dict)
async def create_custom_leave_policy(
    body: CustomLeavePolicyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a custom leave policy. Only directors (seniors) can create."""
    if current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="Only directors can create custom leave policies")
    if not body.title or not body.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    valid_roles = {"employee", "intern", "manager"}
    roles = [r.strip().lower() for r in body.allowed_roles if r and r.strip().lower() in valid_roles]
    if not roles:
        raise HTTPException(status_code=400, detail="At least one allowed role (employee, intern, manager) is required")
    max_per_month = body.max_days_per_month
    if max_per_month is not None and float(max_per_month) <= 0:
        raise HTTPException(status_code=400, detail="Max days per month must be greater than 0 if set")
    monthly_allowance = getattr(body, "monthly_allowance", None)
    if monthly_allowance is not None and float(monthly_allowance) <= 0:
        raise HTTPException(status_code=400, detail="Monthly allowance must be greater than 0 if set")
    allowed_roles_str = ",".join(roles)
    title = body.title.strip()
    prior_days = max(0, body.prior_days)
    enable_sub_types = bool(getattr(body, "enable_sub_types", False))

    if not enable_sub_types:
        policy = CustomLeavePolicy(
            title=title,
            prior_days=prior_days,
            max_days_per_month=max_per_month,
            monthly_allowance=monthly_allowance,
            allowed_roles=allowed_roles_str,
            allowed_on_probation=bool(getattr(body, "allowed_on_probation", True)),
            created_by_id=current_user.id,
        )
        db.add(policy)
        await db.commit()
        await db.refresh(policy)
        return {
            "message": "Custom leave policy created",
            "created": [_policy_to_response(policy, current_user.full_name)],
        }

    sub_types_raw = getattr(body, "sub_types", None) or []
    cleaned_sub_types = []
    for s in sub_types_raw:
        name = (s or "").strip()
        if not name:
            continue
        if name.lower() not in [x.lower() for x in cleaned_sub_types]:
            cleaned_sub_types.append(name)
    if len(cleaned_sub_types) < 2:
        raise HTTPException(status_code=400, detail="Provide at least 2 distinct sub leave categories")

    shared_annual_limit = getattr(body, "shared_annual_limit", None)
    if shared_annual_limit is None or float(shared_annual_limit) <= 0:
        raise HTTPException(status_code=400, detail="Shared annual limit is required and must be greater than 0 for sub leave categories")

    from datetime import datetime as _dt
    group_key = f"{current_user.id}:{int(_dt.utcnow().timestamp())}:{title.lower().replace(' ', '-')[:50]}"

    sub_type_prior_map = getattr(body, "sub_type_prior_days", None) or {}

    created = []
    for sub in cleaned_sub_types:
        # Per-sub-type prior days: use map value if provided, else fall back to global prior_days
        sub_prior = sub_type_prior_map.get(sub, prior_days)
        sub_prior = max(0, sub_prior)

        policy = CustomLeavePolicy(
            title=f"{title} - {sub}",
            prior_days=sub_prior,
            max_days_per_month=max_per_month,
            policy_group_key=group_key,
            sub_type_name=sub,
            shared_annual_limit=shared_annual_limit,
            allowed_roles=allowed_roles_str,
            allowed_on_probation=bool(getattr(body, "allowed_on_probation", True)),
            created_by_id=current_user.id,
        )
        db.add(policy)
        created.append(policy)

    await db.commit()
    for policy in created:
        await db.refresh(policy)
    return {
        "message": "Grouped leave policy created",
        "policy_group_key": group_key,
        "shared_annual_limit": shared_annual_limit,
        "created": [_policy_to_response(p, current_user.full_name) for p in created],
    }


@router.put("/custom-policies/{policy_id}", response_model=dict)
async def update_custom_leave_policy(
    policy_id: int,
    body: CustomLeavePolicyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a custom leave policy. Only directors can update; only policies they created."""
    if current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="Only directors can edit custom leave policies")
    result = await db.execute(select(CustomLeavePolicy).filter(CustomLeavePolicy.id == policy_id))
    policy = result.scalars().first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    if policy.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit policies you created")

    if body.title is not None:
        if not str(body.title).strip():
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        policy.title = body.title.strip()
    if body.prior_days is not None:
        policy.prior_days = max(0, body.prior_days)
    if body.max_days_per_month is not None:
        policy.max_days_per_month = body.max_days_per_month if float(body.max_days_per_month) > 0 else None
    if body.monthly_allowance is not None:
        policy.monthly_allowance = body.monthly_allowance if float(body.monthly_allowance) > 0 else None
    if body.allowed_roles is not None:
        valid_roles = {"employee", "intern", "manager"}
        roles = [r.strip().lower() for r in body.allowed_roles if r and str(r).strip().lower() in valid_roles]
        if not roles:
            raise HTTPException(status_code=400, detail="At least one allowed role is required")
        policy.allowed_roles = ",".join(roles)
    if body.allowed_on_probation is not None:
        policy.allowed_on_probation = body.allowed_on_probation

    if body.shared_annual_limit is not None:
        val = body.shared_annual_limit if float(body.shared_annual_limit) > 0 else None
        if policy.policy_group_key:
            result_group = await db.execute(
                select(CustomLeavePolicy).filter(CustomLeavePolicy.policy_group_key == policy.policy_group_key)
            )
            for p in result_group.scalars().all():
                p.shared_annual_limit = val
        else:
            policy.shared_annual_limit = val

    await db.commit()
    await db.refresh(policy)
    creator_name = current_user.full_name
    if policy.created_by_id != current_user.id:
        creator = await db.get(User, policy.created_by_id)
        creator_name = creator.full_name if creator else None
    return {
        "message": "Policy updated",
        "updated": _policy_to_response(policy, creator_name),
    }


@router.delete("/custom-policies/{policy_id}")
async def delete_custom_leave_policy(
    policy_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a custom leave policy. Only directors can delete."""
    if current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="Only directors can delete custom leave policies")
    result = await db.execute(select(CustomLeavePolicy).filter(CustomLeavePolicy.id == policy_id))
    policy = result.scalars().first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    # Detach any leave requests referencing this policy so FK doesn't block deletion
    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(LeaveRequest)
        .where(LeaveRequest.custom_policy_id == policy_id)
        .values(custom_policy_id=None)
    )
    await db.delete(policy)
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logging.exception("Failed to delete custom leave policy %s: %s", policy_id, e)
        raise HTTPException(status_code=500, detail="Failed to delete policy. Please try again.")
    return {"message": "Custom leave policy deleted"}


def _leave_overlaps_month(leave: LeaveRequest, year: int, month: int) -> bool:
    first = date(year, month, 1)
    if month == 12:
        last = date(year, 12, 31)
    else:
        last = date(year, month + 1, 1) - timedelta(days=1)
    return leave.start_date <= last and leave.end_date >= first


def _leave_overlaps_year(leave: LeaveRequest, year: int) -> bool:
    first = date(year, 1, 1)
    last = date(year, 12, 31)
    return leave.start_date <= last and leave.end_date >= first


async def _is_leave_under_director_policy(l: LeaveRequest, db: AsyncSession) -> bool:
    """True only for custom leaves created under a director-created policy."""
    if l.leave_type != LeaveType.CUSTOM:
        return False
    if not l.custom_policy_id:
        return False
    pol = await db.get(CustomLeavePolicy, l.custom_policy_id)
    if not pol or not pol.created_by_id:
        return False
    creator = await db.get(User, pol.created_by_id)
    return creator is not None and creator.role == UserRole.SENIOR


@router.get("/my-leaves")
async def get_my_leaves(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's leave requests. Optionally filter by month (1-12) and year, or by year only."""
    result = await db.execute(
        select(LeaveRequest).filter(
            LeaveRequest.user_id == current_user.id
        ).order_by(LeaveRequest.applied_at.desc())
    )
    leaves = result.scalars().all()
    if month is not None and year is not None and 1 <= month <= 12:
        leaves = [l for l in leaves if _leave_overlaps_month(l, year, month)]
    elif year is not None and month is None:
        leaves = [l for l in leaves if _leave_overlaps_year(l, year)]
    # Only show leaves under director-created policies (standard types always; custom only if policy creator is SENIOR)
    filtered = []
    for l in leaves:
        if await _is_leave_under_director_policy(l, db):
            filtered.append(l)
    leaves = filtered

    response = []
    for l in leaves:
        approved_by_name = None
        if l.approved_by_id:
            approver_result = await db.execute(select(User).filter(User.id == l.approved_by_id))
            approver = approver_result.scalars().first()
            approved_by_name = approver.full_name if approver else None
        custom_policy_title = None
        if l.leave_type == LeaveType.CUSTOM and l.custom_policy_id:
            pol = await db.get(CustomLeavePolicy, l.custom_policy_id)
            custom_policy_title = pol.title if pol else None

        response.append({
            "id": l.id,
            "leave_type": l.leave_type.value,
            "custom_policy_id": l.custom_policy_id,
            "custom_policy_title": custom_policy_title,
            "start_date": l.start_date.isoformat(),
            "end_date": l.end_date.isoformat(),
            "num_days": l.num_days,
            "reason": l.reason,
            "status": l.status.value,
            "approved_by_name": approved_by_name,
            "reviewer_notes": l.reviewer_notes,
            "applied_at": l.applied_at.isoformat() if l.applied_at else None,
            "reviewed_at": l.reviewed_at.isoformat() if l.reviewed_at else None
        })

    return response


@router.get("/all")
async def get_all_leaves(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all leave requests. Intended for Managers to track team leaves."""
    if current_user.role not in (UserRole.MANAGER, UserRole.SENIOR):
        raise HTTPException(status_code=403, detail="Only managers and directors can view all leaves")

    result = await db.execute(
        select(LeaveRequest).order_by(LeaveRequest.applied_at.desc())
    )
    leaves = result.scalars().all()
    
    # Optional: Only show director-created policy leaves
    filtered = []
    for l in leaves:
        if await _is_leave_under_director_policy(l, db):
            filtered.append(l)
    leaves = filtered

    response = []
    for l in leaves:
        user_result = await db.execute(select(User).filter(User.id == l.user_id))
        user = user_result.scalars().first()
        custom_policy_title = None
        if l.leave_type == LeaveType.CUSTOM and l.custom_policy_id:
            pol = await db.get(CustomLeavePolicy, l.custom_policy_id)
            custom_policy_title = pol.title if pol else None

        response.append({
            "id": l.id,
            "user_id": l.user_id,
            "user_name": user.full_name if user else "Unknown",
            "user_role": user.role.value if user else None,
            "leave_type": l.leave_type.value,
            "custom_policy_id": l.custom_policy_id,
            "custom_policy_title": custom_policy_title,
            "start_date": l.start_date.isoformat(),
            "end_date": l.end_date.isoformat(),
            "num_days": l.num_days,
            "reason": l.reason,
            "status": l.status.value,
            "applied_at": l.applied_at.isoformat() if l.applied_at else None
        })

    return response


@router.get("/pending")
async def get_pending_leaves(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all pending leave requests. Only directors (seniors) can approve. Optionally filter by month (1-12) and year, or by year only."""
    if current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="Only directors can view pending leave requests")

    result = await db.execute(
        select(LeaveRequest).filter(
            LeaveRequest.status == LeaveStatus.PENDING
        ).order_by(LeaveRequest.applied_at.desc())
    )
    leaves = result.scalars().all()
    if month is not None and year is not None and 1 <= month <= 12:
        leaves = [l for l in leaves if _leave_overlaps_month(l, year, month)]
    elif year is not None and month is None:
        leaves = [l for l in leaves if _leave_overlaps_year(l, year)]
    # Only show leaves under director-created policies (standard types always; custom only if policy creator is SENIOR)
    filtered = []
    for l in leaves:
        if await _is_leave_under_director_policy(l, db):
            filtered.append(l)
    leaves = filtered

    response = []
    for l in leaves:
        user_result = await db.execute(select(User).filter(User.id == l.user_id))
        user = user_result.scalars().first()
        custom_policy_title = None
        if l.leave_type == LeaveType.CUSTOM and l.custom_policy_id:
            pol = await db.get(CustomLeavePolicy, l.custom_policy_id)
            custom_policy_title = pol.title if pol else None
        response.append({
            "id": l.id,
            "user_id": l.user_id,
            "user_name": user.full_name if user else "Unknown",
            "user_role": user.role.value if user else None,
            "leave_type": l.leave_type.value,
            "custom_policy_id": l.custom_policy_id,
            "custom_policy_title": custom_policy_title,
            "start_date": l.start_date.isoformat(),
            "end_date": l.end_date.isoformat(),
            "num_days": l.num_days,
            "reason": l.reason,
            "status": l.status.value,
            "applied_at": l.applied_at.isoformat() if l.applied_at else None
        })

    return response


@router.put("/{leave_id}/review")
async def review_leave(
    leave_id: int,
    review: LeaveReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Approve or reject a leave request. Only directors can do this."""
    if current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="Only directors can approve/reject leave requests")

    result = await db.execute(
        select(LeaveRequest).filter(LeaveRequest.id == leave_id)
    )
    leave = result.scalars().first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if leave.status != LeaveStatus.PENDING:
        raise HTTPException(status_code=400, detail="This leave request has already been reviewed")

    if review.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'rejected'")

    leave.status = LeaveStatus(review.status)
    leave.approved_by_id = current_user.id
    leave.reviewer_notes = review.reviewer_notes
    leave.reviewed_at = datetime.now(timezone.utc)

    await db.commit()
    return {"message": f"Leave request {review.status} successfully"}


@router.delete("/{leave_id}")
async def cancel_leave(
    leave_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cancel a pending leave request."""
    result = await db.execute(
        select(LeaveRequest).filter(
            LeaveRequest.id == leave_id,
            LeaveRequest.user_id == current_user.id
        )
    )
    leave = result.scalars().first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if leave.status != LeaveStatus.PENDING:
        raise HTTPException(status_code=400, detail="Only pending leave requests can be cancelled")

    leave.status = LeaveStatus.CANCELLED
    await db.commit()
    return {"message": "Leave request cancelled"}
