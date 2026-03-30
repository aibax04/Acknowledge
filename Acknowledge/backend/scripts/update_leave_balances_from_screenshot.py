import os
import asyncio
from datetime import date

from dotenv import load_dotenv
import sqlalchemy as sa
from sqlalchemy.future import select
import re

# Ensure app imports work when running from repo root
import sys

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(THIS_DIR, ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.leave import LeaveRequest, LeaveStatus, LeaveType, LeaveBalanceAdjustment  # noqa: E402
from app.routes.leaves import compute_leave_balance, _compute_wallet_for_policy  # noqa: E402
from app.models.custom_leave_policy import CustomLeavePolicy  # noqa: E402
from app.utils.hashing import get_password_hash  # noqa: E402


# Screenshot mapping:
# - If a value is "N.A." in the screenshot, set it as None here.
# - The last two numeric columns align with standard leave balances:
#   earned_leave_balance and casual_sick_leave_balance.
TARGETS = {
    "Amisha Tanya": {"earned_leave_balance": 2.5, "casual_sick_leave_balance": 1.0},
    "Anurag Singh": {"earned_leave_balance": 10.25, "casual_sick_leave_balance": 2.0},
    "Ashutosh Bisht": {"earned_leave_balance": 7.25, "casual_sick_leave_balance": 2.0},
    "Bhavay Garg": {"earned_leave_balance": 6.75, "casual_sick_leave_balance": 1.0},
    "Debosmita Bhattacharya": {"earned_leave_balance": 2.5, "casual_sick_leave_balance": 0.0},
    "Hemalatha Shanmugam": {"earned_leave_balance": 9.75, "casual_sick_leave_balance": 1.0},
    "Kinjal Gupta": {"earned_leave_balance": 9.75, "casual_sick_leave_balance": 1.0},
    "Kunal Eknath Charde": {"earned_leave_balance": 4.75, "casual_sick_leave_balance": 0.5},
    "Mansi Rawat": {"earned_leave_balance": 2.75, "casual_sick_leave_balance": 0.5},
    "Priyansh Negi": {"earned_leave_balance": 4.75, "casual_sick_leave_balance": 0.0},
    "Riddhima -": {"earned_leave_balance": 3.25, "casual_sick_leave_balance": 0.0},
    "Rituraj Singh": {"earned_leave_balance": 8.75, "casual_sick_leave_balance": 1.0},
    "Sneha Verma": {"earned_leave_balance": 9.75, "casual_sick_leave_balance": 0.0},
    "Suryanshu Singh": {"earned_leave_balance": 3.25, "casual_sick_leave_balance": 1.0},
    "Tanisha Singh": {"earned_leave_balance": 28.75, "casual_sick_leave_balance": 2.0},
    "Urvashi Gusain": {"earned_leave_balance": 2.75, "casual_sick_leave_balance": 0.0},
    "Vinamra Sharma": {"earned_leave_balance": 10.25, "casual_sick_leave_balance": 2.0},
    "Yash Sharma": {"earned_leave_balance": 5.25, "casual_sick_leave_balance": 0.0},
}

# Custom policies powering the frontend "Earned Leave" + "Sick/Casual Leave" cards.
# These IDs exist in this DB (queried): Earned Leave=32, Sick/Casual Leave=36.
STANDARD_CUSTOM_POLICY_IDS = {
    "earned_leave": 32,
    "casual_sick_leave": 36,
}

# For any duplicate/ambiguous full names in DB, pin the intended user_id here.
# This repo currently has two "Tanisha Singh" users; screenshot target is pinned to id=27.
USER_ID_OVERRIDES = {
    "Tanisha Singh": 27,
    # Screenshot has full middle name but DB user is stored without it.
    "Kunal Eknath Charde": 35,
}

def _norm_name(s: str) -> str:
    """Normalize a name for matching: lowercase, strip punctuation, collapse spaces."""
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = " ".join(s.split())
    return s


async def _current_standard_balance(db, user: User, year: int) -> dict:
    result = await db.execute(
        select(LeaveRequest).filter(
            LeaveRequest.user_id == user.id,
            LeaveRequest.status == LeaveStatus.APPROVED,
        )
    )
    approved = result.scalars().all()
    base = compute_leave_balance(user, approved, year)

    # Apply adjustments like GET /leaves/balance does.
    adj_res = await db.execute(
        select(LeaveBalanceAdjustment).filter(
            LeaveBalanceAdjustment.user_id == user.id,
            LeaveBalanceAdjustment.year == year,
        )
    )
    adjs = adj_res.scalars().all()
    el_adj = sum(a.adjustment_days for a in adjs if a.leave_type == LeaveType.EARNED_LEAVE.value)
    csl_adj = sum(a.adjustment_days for a in adjs if a.leave_type == LeaveType.CASUAL_SICK_LEAVE.value)
    base["earned_leave_balance"] = max(0, base["earned_leave_balance"] + el_adj)
    base["casual_sick_leave_balance"] = max(0, base["casual_sick_leave_balance"] + csl_adj)
    return base


async def main() -> int:
    load_dotenv(os.path.join(os.path.dirname(BACKEND_DIR), ".env"))
    year = date.today().year
    dry_run = os.environ.get("DRY_RUN", "1").strip() not in ("0", "false", "False")
    allow_create_users = os.environ.get("ALLOW_CREATE_USERS", "1").strip() not in ("0", "false", "False")

    async with SessionLocal() as db:
        # Resolve users by normalized name (handles double spaces, punctuation, shortened middle name).
        users_res = await db.execute(select(User))
        all_users = users_res.scalars().all()
        users_by_norm = {}
        collisions = {}
        for u in all_users:
            k = _norm_name(u.full_name)
            if not k:
                continue
            if k in users_by_norm and users_by_norm[k].id != u.id:
                collisions.setdefault(k, []).append(u)
                continue
            users_by_norm[k] = u

        # Apply explicit overrides to resolve collisions safely.
        if collisions:
            for norm_k in list(collisions.keys()):
                # see if any target name maps to this collision and has an override
                target_names = [n for n in TARGETS.keys() if _norm_name(n) == norm_k]
                resolved = False
                for tn in target_names:
                    uid = USER_ID_OVERRIDES.get(tn)
                    if uid is None:
                        continue
                    chosen = next((u for u in all_users if u.id == uid), None)
                    if chosen is None:
                        print(f"Override user_id {uid} for {tn} not found in DB.")
                        return 2
                    users_by_norm[norm_k] = chosen
                    resolved = True
                if resolved:
                    collisions.pop(norm_k, None)

        if collisions:
            print("Ambiguous user full_name collisions after normalization (no override found):")
            for k, extra in collisions.items():
                base = users_by_norm.get(k)
                print(" -", repr(k))
                if base:
                    print("    ", base.id, repr(base.full_name))
                for e in extra:
                    print("    ", e.id, repr(e.full_name))
            print("Aborting due to ambiguity. Add USER_ID_OVERRIDES entries to proceed.")
            return 2

        unresolved = []
        users_by_target = {}
        for target_name in TARGETS.keys():
            # Explicit user_id override takes precedence over name matching.
            if target_name in USER_ID_OVERRIDES:
                uid = USER_ID_OVERRIDES[target_name]
                u = next((x for x in all_users if x.id == uid), None)
                if not u:
                    print(f"Override user_id {uid} for {target_name} not found in DB.")
                    return 2
                users_by_target[target_name] = u
                continue

            k = _norm_name(target_name)
            u = users_by_norm.get(k)
            if not u:
                unresolved.append(target_name)
            else:
                users_by_target[target_name] = u

        if unresolved:
            if not allow_create_users:
                print("Missing users (no normalized match in users table):")
                for n in unresolved:
                    print(" -", n, "->", repr(_norm_name(n)))
                print("Set ALLOW_CREATE_USERS=1 to auto-create these users.")
                return 2

            print("Creating missing users (ALLOW_CREATE_USERS=1):")
            for n in unresolved:
                norm = _norm_name(n)
                email_local = norm.replace(" ", ".") if norm else "user"
                # Use a real-looking domain so email-validator accepts it in API responses.
                email = f"{email_local}@seed.example"
                # Ensure uniqueness if rerun
                i = 0
                while True:
                    candidate = email if i == 0 else f"{email_local}{i}@seed.example"
                    exists = await db.execute(select(User).filter(User.email == candidate))
                    if exists.scalars().first() is None:
                        email = candidate
                        break
                    i += 1

                u = User(
                    email=email,
                    full_name=n,
                    hashed_password=get_password_hash("TempPass123!"),
                    role="EMPLOYEE",
                    is_active=True,
                )
                if not dry_run:
                    db.add(u)
                    await db.flush()
                # For dry-run, we still need an object; fake id won't work for adjustments.
                # So in dry-run we abort after listing creations required.
                print(" -", n, "->", email)

            if dry_run:
                print("\\nDRY_RUN=1 and user creation is required. Re-run with DRY_RUN=0 to create users, then run again.")
                return 0

            await db.commit()
            # Reload all users after creation
            users_res = await db.execute(select(User))
            all_users = users_res.scalars().all()
            users_by_norm = {(_norm_name(u.full_name)): u for u in all_users if _norm_name(u.full_name)}
            for target_name in unresolved:
                users_by_target[target_name] = users_by_norm[_norm_name(target_name)]

        # Create adjustments that shift the CURRENT balances to the TARGET balances.
        # This is additive: it does not delete existing adjustments.
        to_create = []
        for name, tgt in TARGETS.items():
            user = users_by_target[name]
            cur = await _current_standard_balance(db, user, year)

            desired_el = float(tgt["earned_leave_balance"])
            desired_csl = float(tgt["casual_sick_leave_balance"])

            cur_el = float(cur.get("earned_leave_balance") or 0)
            cur_csl = float(cur.get("casual_sick_leave_balance") or 0)

            delta_el = round(desired_el - cur_el, 2)
            delta_csl = round(desired_csl - cur_csl, 2)

            print(f"{name}: EL {cur_el} -> {desired_el} (Δ {delta_el}); CSL {cur_csl} -> {desired_csl} (Δ {delta_csl})")

            if abs(delta_el) > 0:
                to_create.append(
                    LeaveBalanceAdjustment(
                        user_id=user.id,
                        year=year,
                        leave_type=LeaveType.EARNED_LEAVE.value,
                        custom_policy_id=None,
                        adjustment_days=delta_el,
                        reason="Manual set from screenshot (bulk sync)",
                        created_by_id=user.id,  # fallback: self; change if you want a specific director id
                    )
                )
            if abs(delta_csl) > 0:
                to_create.append(
                    LeaveBalanceAdjustment(
                        user_id=user.id,
                        year=year,
                        leave_type=LeaveType.CASUAL_SICK_LEAVE.value,
                        custom_policy_id=None,
                        adjustment_days=delta_csl,
                        reason="Manual set from screenshot (bulk sync)",
                        created_by_id=user.id,  # fallback: self; change if you want a specific director id
                    )
                )

            # --- Also sync the frontend custom-policy cards (policy_id based) ---
            # The frontend Team Leave Tracker displays balances using custom policies (custom_policy_id),
            # so we apply policy-scoped adjustments too.
            earned_pol = await db.get(CustomLeavePolicy, STANDARD_CUSTOM_POLICY_IDS["earned_leave"])
            csl_pol = await db.get(CustomLeavePolicy, STANDARD_CUSTOM_POLICY_IDS["casual_sick_leave"])
            if earned_pol is not None:
                cur_wallet = await _compute_wallet_for_policy(db, user.id, earned_pol, year, office=(user.office or "eigen"))
                cur_wallet = float(cur_wallet or 0.0)
                desired = float(tgt["earned_leave_balance"])
                delta = round(desired - cur_wallet, 2)
                if abs(delta) > 0:
                    to_create.append(
                        LeaveBalanceAdjustment(
                            user_id=user.id,
                            year=year,
                            leave_type=None,
                            custom_policy_id=earned_pol.id,
                            adjustment_days=delta,
                            reason="Manual set from screenshot (bulk sync)",
                            created_by_id=user.id,
                        )
                    )
            if csl_pol is not None:
                cur_wallet = await _compute_wallet_for_policy(db, user.id, csl_pol, year, office=(user.office or "eigen"))
                cur_wallet = float(cur_wallet or 0.0)
                desired = float(tgt["casual_sick_leave_balance"])
                delta = round(desired - cur_wallet, 2)
                if abs(delta) > 0:
                    to_create.append(
                        LeaveBalanceAdjustment(
                            user_id=user.id,
                            year=year,
                            leave_type=None,
                            custom_policy_id=csl_pol.id,
                            adjustment_days=delta,
                            reason="Manual set from screenshot (bulk sync)",
                            created_by_id=user.id,
                        )
                    )

        if dry_run:
            print(f"\nDRY_RUN=1 -> would create {len(to_create)} adjustment rows. No changes written.")
            return 0

        if to_create:
            db.add_all(to_create)
            await db.commit()
        print(f"\nCommitted {len(to_create)} adjustment rows.")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

