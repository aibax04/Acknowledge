"""
Monthly leave credit service.

On the 1st of every month, this module:
- Credits standard leaves (EL: 1.25/month, CSL: 1.0/month) for all active non-senior users
- Credits custom leave policies (monthly_allowance) for all eligible users based on allowed_roles

Credits are stored in the `leave_monthly_credits` table, which has a unique constraint on
(user_id, year, month, leave_type, custom_policy_id). Inserts use ON CONFLICT DO NOTHING,
making this fully idempotent and safe across concurrent gunicorn workers.

A PostgreSQL advisory lock (key 987654321) prevents multiple workers from running the
backfill simultaneously at startup, avoiding spurious constraint errors in logs.
"""

import logging
from datetime import date
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text

from app.database import SessionLocal as AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.custom_leave_policy import CustomLeavePolicy

logger = logging.getLogger(__name__)

# Standard leave accrual rates
EL_MONTHLY = 1.25   # Earned Leave per month
CSL_MONTHLY = 1.0   # Casual/Sick Leave per month

# Roles that receive standard leave credits
STANDARD_LEAVE_ROLES = {UserRole.EMPLOYEE, UserRole.INTERN, UserRole.MANAGER}

# PostgreSQL advisory lock key — prevents concurrent startup runs
_ADVISORY_LOCK_KEY = 987654321


def _months_to_credit(joining: Optional[date], year: int, month: int) -> bool:
    """Return True if the user joined on or before the 1st of this month."""
    if joining is None:
        return True
    return joining <= date(year, month, 1)


async def credit_month(db: AsyncSession, year: int, month: int) -> dict:
    """
    Apply leave credits for a specific year+month for all eligible users.
    Uses INSERT ... ON CONFLICT DO NOTHING — fully idempotent.
    """
    today = date.today()
    if date(year, month, 1) > today:
        return {"skipped": "future month", "year": year, "month": month}

    # Load active, approved users
    result = await db.execute(
        select(User).filter(User.is_active == True, User.is_pending_approval == False)  # noqa: E712
    )
    users = result.scalars().all()

    # Load custom policies with monthly_allowance
    pol_result = await db.execute(
        select(CustomLeavePolicy).filter(CustomLeavePolicy.monthly_allowance.isnot(None))
    )
    policies = pol_result.scalars().all()

    el_credited = csl_credited = custom_credited = 0

    for user in users:
        joining = getattr(user, "joining_date", None)
        role = getattr(user, "role", None)
        is_probation = bool(getattr(user, "is_on_probation", False))

        if not _months_to_credit(joining, year, month):
            continue

        # Standard EL (non-probation employees/managers/interns)
        if role in STANDARD_LEAVE_ROLES and not is_probation:
            r = await db.execute(text("""
                INSERT INTO leave_monthly_credits
                    (user_id, year, month, leave_type, custom_policy_id, days_credited)
                VALUES
                    (:uid, :yr, :mo, 'earned_leave', NULL, :days)
                ON CONFLICT (user_id, year, month, COALESCE(leave_type,''), COALESCE(custom_policy_id,0)) DO NOTHING
            """), {"uid": user.id, "yr": year, "mo": month, "days": EL_MONTHLY})
            el_credited += r.rowcount

        # Standard CSL (all standard roles, including probation)
        if role in STANDARD_LEAVE_ROLES:
            r = await db.execute(text("""
                INSERT INTO leave_monthly_credits
                    (user_id, year, month, leave_type, custom_policy_id, days_credited)
                VALUES
                    (:uid, :yr, :mo, 'casual_sick_leave', NULL, :days)
                ON CONFLICT (user_id, year, month, COALESCE(leave_type,''), COALESCE(custom_policy_id,0)) DO NOTHING
            """), {"uid": user.id, "yr": year, "mo": month, "days": CSL_MONTHLY})
            csl_credited += r.rowcount

        # Custom policies with monthly_allowance
        for policy in policies:
            if not policy.monthly_allowance or float(policy.monthly_allowance) <= 0:
                continue
            allowed_roles = [x.strip().lower() for x in (policy.allowed_roles or "").split(",") if x.strip()]
            user_role_str = str(role.value if hasattr(role, "value") else role).lower()
            if user_role_str not in allowed_roles:
                continue
            if is_probation and not getattr(policy, "allowed_on_probation", True):
                continue

            r = await db.execute(text("""
                INSERT INTO leave_monthly_credits
                    (user_id, year, month, leave_type, custom_policy_id, days_credited)
                VALUES
                    (:uid, :yr, :mo, NULL, :pid, :days)
                ON CONFLICT (user_id, year, month, COALESCE(leave_type,''), COALESCE(custom_policy_id,0)) DO NOTHING
            """), {"uid": user.id, "yr": year, "mo": month, "pid": policy.id, "days": float(policy.monthly_allowance)})
            custom_credited += r.rowcount

    await db.commit()
    if el_credited or csl_credited or custom_credited:
        logger.info(
            "Leave credits %d-%02d: EL=%d, CSL=%d, Custom=%d",
            year, month, el_credited, csl_credited, custom_credited,
        )
    return {"year": year, "month": month, "el_credited": el_credited,
            "csl_credited": csl_credited, "custom_credited": custom_credited}


async def run_monthly_leave_credits(up_to: Optional[date] = None) -> list:
    """
    Backfill leave credits for all months from the earliest joining date up to `up_to` (default: today).
    Uses a PostgreSQL advisory lock so only one worker runs at a time.
    Idempotent — safe to call multiple times.
    """
    if up_to is None:
        up_to = date.today()

    results = []
    async with AsyncSessionLocal() as db:
        # Try to acquire advisory lock (non-blocking); skip if another worker holds it
        lock_result = await db.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": _ADVISORY_LOCK_KEY}
        )
        acquired = lock_result.scalar()
        if not acquired:
            logger.info("Leave credit backfill skipped — another worker is running it.")
            return results

        try:
            # Find earliest joining date
            earliest = await db.execute(
                select(User.joining_date)
                .filter(User.joining_date.isnot(None))
                .order_by(User.joining_date.asc())
                .limit(1)
            )
            earliest_date = earliest.scalars().first()
            start_year = earliest_date.year if earliest_date else 2024

            for year in range(start_year, up_to.year + 1):
                for month in range(1, 13):
                    if date(year, month, 1) > up_to:
                        break
                    summary = await credit_month(db, year, month)
                    results.append(summary)
        finally:
            await db.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _ADVISORY_LOCK_KEY})

    return results
