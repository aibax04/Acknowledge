from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_, func, extract
from app.database import get_db
from app.models.user import User, UserRole
from app.models.leave import LeaveRequest, LeaveType, LeaveStatus
from app.models.custom_leave_policy import CustomLeavePolicy
from app.routes.auth import get_current_user
from app.schemas.leave_schema import (
    LeaveApplyRequest, LeaveResponse, LeaveReviewRequest, LeaveBalanceResponse,
    CustomLeavePolicyCreate, CustomLeavePolicyResponse
)
from datetime import datetime, date, timezone, timedelta
from typing import List

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


def compute_leave_balance(user: User, approved_leaves: list, current_year: int):
    """Compute leave balance for a user."""
    today = date.today()
    joining = user.joining_date or (user.created_at.date() if user.created_at else date(current_year, 1, 1))
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
        l.num_days for l in approved_leaves
        if l.leave_type == LeaveType.EARNED_LEAVE
        and l.start_date.year == current_year
    )

    # CSL: 1 per month, max 12 per year (no carry forward) — shared by casual + sick (+ legacy casual_sick)
    csl_accrued = round(min(months_elapsed * 1.0, 12.0), 2)
    csl_used = sum(
        l.num_days for l in approved_leaves
        if l.leave_type in (LeaveType.CASUAL_SICK_LEAVE, LeaveType.CASUAL_LEAVE, LeaveType.SICK_LEAVE)
        and l.start_date.year == current_year
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


@router.get("/balance")
async def get_leave_balance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's leave balance."""
    if current_user.role == UserRole.INTERN:
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
            "message": "Interns are eligible for unpaid leave only."
        }

    current_year = date.today().year
    result = await db.execute(
        select(LeaveRequest).filter(
            LeaveRequest.user_id == current_user.id,
            LeaveRequest.status == LeaveStatus.APPROVED
        )
    )
    approved_leaves = result.scalars().all()

    balance = compute_leave_balance(current_user, approved_leaves, current_year)
    return balance


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
    today = date.today()

    # Validate dates
    if req.start_date > req.end_date:
        raise HTTPException(status_code=400, detail="Start date must be before or equal to end date")
    if req.start_date < today:
        raise HTTPException(status_code=400, detail="Cannot apply for past dates")

    # Leave type validated by schema (earned_leave, casual_leave, sick_leave, unpaid_leave only)
    leave_type = LeaveType(req.leave_type)

    # Custom leave: require custom_policy_id and validate policy + role + prior_days
    if leave_type == LeaveType.CUSTOM:
        if not req.custom_policy_id:
            raise HTTPException(status_code=400, detail="Custom policy is required when applying for custom leave")
        policy_result = await db.execute(
            select(CustomLeavePolicy).filter(CustomLeavePolicy.id == req.custom_policy_id)
        )
        policy = policy_result.scalars().first()
        if not policy:
            raise HTTPException(status_code=404, detail="Custom leave policy not found")
        allowed = [r.strip().lower() for r in policy.allowed_roles.split(",") if r.strip()]
        if current_user.role.value not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"This leave type is not available for your role. It is for: {', '.join(allowed)}"
            )
        days_advance = (req.start_date - today).days
        if days_advance < policy.prior_days:
            raise HTTPException(
                status_code=400,
                detail=f"This leave requires applying at least {policy.prior_days} calendar days in advance"
            )

    # Interns can only take unpaid leave (for standard types; custom is allowed if policy permits)
    if current_user.role == UserRole.INTERN and leave_type != LeaveType.CUSTOM:
        if leave_type != LeaveType.UNPAID_LEAVE:
            raise HTTPException(status_code=400, detail="Interns are eligible for unpaid leave only")

    _office = (current_user.office or "").strip().lower()
    office = "eigen" if _office == "igen" else (current_user.office or "eigen")
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
        if current_user.is_on_probation:
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

    leave = LeaveRequest(
        user_id=current_user.id,
        leave_type=leave_type,
        custom_policy_id=req.custom_policy_id if leave_type == LeaveType.CUSTOM else None,
        start_date=req.start_date,
        end_date=req.end_date,
        num_days=num_days,
        reason=req.reason,
        status=LeaveStatus.PENDING
    )
    db.add(leave)
    await db.commit()
    await db.refresh(leave)

    return {"message": "Leave request submitted successfully", "id": leave.id, "num_days": num_days}


# --- Custom Leave Policies (directors create; applications approved by director) - routes first to avoid path conflicts ---
def _policy_to_response(p: CustomLeavePolicy, created_by_name: str = None) -> dict:
    roles = [r.strip() for r in p.allowed_roles.split(",") if r.strip()]
    return {
        "id": p.id,
        "title": p.title,
        "prior_days": p.prior_days,
        "allowed_roles": roles,
        "created_by_id": p.created_by_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "created_by_name": created_by_name,
    }


async def _list_custom_leave_policies_impl(for_apply: bool, db: AsyncSession, current_user: User):
    """Shared impl for listing custom leave policies."""
    result = await db.execute(select(CustomLeavePolicy).order_by(CustomLeavePolicy.created_at.desc()))
    policies = result.scalars().all()
    out = []
    role_val = current_user.role.value
    for p in policies:
        if for_apply:
            allowed = [r.strip().lower() for r in p.allowed_roles.split(",") if r.strip()]
            if role_val not in allowed:
                continue
        creator = None
        if p.created_by_id:
            u = await db.get(User, p.created_by_id)
            creator = u.full_name if u else None
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


@router.post("/custom-policies/create", response_model=CustomLeavePolicyResponse)
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
    allowed_roles_str = ",".join(roles)
    policy = CustomLeavePolicy(
        title=body.title.strip(),
        prior_days=max(0, body.prior_days),
        allowed_roles=allowed_roles_str,
        created_by_id=current_user.id,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return _policy_to_response(policy, current_user.full_name)


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
    await db.delete(policy)
    await db.commit()
    return {"message": "Custom leave policy deleted"}


@router.get("/my-leaves")
async def get_my_leaves(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's leave requests."""
    result = await db.execute(
        select(LeaveRequest).filter(
            LeaveRequest.user_id == current_user.id
        ).order_by(LeaveRequest.applied_at.desc())
    )
    leaves = result.scalars().all()

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


@router.get("/pending")
async def get_pending_leaves(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all pending leave requests. Only directors (seniors) can approve."""
    if current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="Only directors can view pending leave requests")

    result = await db.execute(
        select(LeaveRequest).filter(
            LeaveRequest.status == LeaveStatus.PENDING
        ).order_by(LeaveRequest.applied_at.desc())
    )
    leaves = result.scalars().all()

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
