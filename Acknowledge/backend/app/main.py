import asyncio
import logging
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from app.routes import auth, tasks, concerns, policies, dashboard, senior_dashboard, reports, notifications, ventures, uploads
from app.routes import attendance, leaves, holidays
from app.database import engine, Base
from app.config import settings
from pathlib import Path
from sqlalchemy import text

app = FastAPI(title="Acknowledge API", strict_slashes=False)


def _is_db_connection_error(exc: Exception) -> bool:
    """True if the exception is a database connection failure."""
    if exc is None:
        return False
    if isinstance(exc, ConnectionRefusedError):
        return True
    err = str(exc).lower()
    if "connection refused" in err or "could not connect" in err:
        return True
    if "connection" in err and ("database" in err or "refused" in err):
        return True
    return False


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Return 503 with a clear message when the failure is due to database connectivity."""
    if _is_db_connection_error(exc):
        return JSONResponse(
            status_code=503,
            content={"detail": "Connection to database failure. Please try again or contact support."},
        )
    raise exc

# Setup CORS (strip whitespace so https://postflow.panscience.ai works)
origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for uploads
UPLOAD_DIR = Path("/app/static/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# --- Custom leave policies list: backup routes at app level so they always exist (fixes 404/405 on some deployments) ---
from fastapi import Depends, Query
from app.database import get_db
from app.routes.auth import get_current_user
from app.routes.leaves import (
    _list_custom_leave_policies_impl,
    list_leave_adjustments,
    create_leave_adjustment,
    create_custom_leave_policy,
    update_custom_leave_policy,
    delete_custom_leave_policy,
)
from app.models.user import User
from app.schemas.leave_schema import LeaveAdjustmentCreate, CustomLeavePolicyCreate, CustomLeavePolicyUpdate

@app.get("/leaves/custom-policies/list")
@app.get("/leaves/custom-policies")
async def list_custom_policies_backup(
    for_apply: bool = False,
    db=Depends(get_db),
    current_user: User=Depends(get_current_user),
):
    """Backup routes for listing custom leave policies (same as leaves router)."""
    return await _list_custom_leave_policies_impl(for_apply, db, current_user)

@app.post("/leaves/custom-policies/create")
async def create_custom_policy_backup(
    body: CustomLeavePolicyCreate,
    db=Depends(get_db),
    current_user: User=Depends(get_current_user),
):
    return await create_custom_leave_policy(body=body, db=db, current_user=current_user)

@app.put("/leaves/custom-policies/{policy_id}")
async def update_custom_policy_backup(
    policy_id: int,
    body: CustomLeavePolicyUpdate,
    db=Depends(get_db),
    current_user: User=Depends(get_current_user),
):
    return await update_custom_leave_policy(policy_id=policy_id, body=body, db=db, current_user=current_user)

@app.delete("/leaves/custom-policies/{policy_id}")
async def delete_custom_policy_backup(
    policy_id: int,
    db=Depends(get_db),
    current_user: User=Depends(get_current_user),
):
    return await delete_custom_leave_policy(policy_id=policy_id, db=db, current_user=current_user)

@app.get("/leaves/adjustments")
async def list_adjustments_backup(
    user_id: int = Query(...),
    year: int = Query(...),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Backup route so GET /leaves/adjustments is always available."""
    return await list_leave_adjustments(user_id=user_id, year=year, db=db, current_user=current_user)


@app.post("/leaves/adjustments")
async def create_adjustment_backup(
    body: LeaveAdjustmentCreate,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Backup route so POST /leaves/adjustments is always available (fixes 405 on some deployments)."""
    return await create_leave_adjustment(body=body, db=db, current_user=current_user)


@app.post("/leaves/admin/adjustments")
async def create_adjustment_alt(
    body: LeaveAdjustmentCreate,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alternate path for admin leave adjustment (avoids 405 when primary path is blocked)."""
    return await create_leave_adjustment(body=body, db=db, current_user=current_user)


# Includes (no /api prefix: nginx strips /api and forwards /leaves/..., so backend serves at /leaves/..., /auth/..., etc.)
app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(concerns.router)
app.include_router(policies.router)
app.include_router(dashboard.router)
app.include_router(senior_dashboard.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(ventures.router)
app.include_router(uploads.router)
app.include_router(attendance.router)
app.include_router(leaves.router)
app.include_router(holidays.router)

async def _auto_absent_scheduler():
    """Background task: runs daily at 23:45 IST (18:15 UTC).
    Anyone who has a clock_in but no clock_out for yesterday is marked absent."""
    log = logging.getLogger(__name__)
    while True:
        now = datetime.now(timezone.utc)
        # Target: 18:15 UTC = 23:45 IST
        target = now.replace(hour=18, minute=15, second=0, microsecond=0)
        if now >= target:
            target += timedelta(days=1)
        await asyncio.sleep((target - now).total_seconds())
        try:
            from app.database import SessionLocal as AsyncSessionLocal
            from app.models.attendance import Attendance, AttendanceStatus
            from sqlalchemy import select as sa_select
            from datetime import date as date_cls
            yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date()
            async with AsyncSessionLocal() as db:
                # Find records where clock_in exists but clock_out is NULL for yesterday
                result = await db.execute(
                    sa_select(Attendance).filter(
                        Attendance.date == yesterday,
                        Attendance.clock_in.isnot(None),
                        Attendance.clock_out.is_(None),
                    )
                )
                records = result.scalars().all()
                for rec in records:
                    rec.status = AttendanceStatus.ABSENT
                    rec.clock_in = None  # clear the incomplete clock-in
                if records:
                    await db.commit()
                    log.info("Auto-absent: marked %d records absent for %s (no clock-out)", len(records), yesterday)
        except Exception as exc:
            log.error("Auto-absent scheduler failed: %s", exc)


async def _monthly_credit_scheduler():
    """Background task: run leave credits daily; on the 1st of the month it will insert new rows."""
    while True:
        try:
            from app.services.leave_credit_service import run_monthly_leave_credits
            await run_monthly_leave_credits()
        except Exception as exc:
            logging.getLogger(__name__).error("Monthly leave credit run failed: %s", exc)
        # Sleep until next midnight UTC
        now = datetime.now(timezone.utc)
        tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        await asyncio.sleep((tomorrow - now).total_seconds())


@app.on_event("startup")
async def startup():
    # Ensure all models are registered (including custom_leave_policies)
    from app.models import leave, custom_leave_policy  # noqa: F401
    from app.models.attendance import ClockLocation, OfficeLocation  # noqa: F401
    async with engine.begin() as conn:
        # Create tables — wrapped in try/except because multiple gunicorn workers can race here;
        # the unique constraint violation on pg_class is harmless (table already exists).
        try:
            await conn.run_sync(Base.metadata.create_all)
        except Exception as _create_err:
            logging.getLogger(__name__).warning("create_all skipped (likely concurrent worker): %s", _create_err)
        # Minimal forward-compatible schema patch (non-destructive)
        # create_all won't add new columns to existing tables.
        try:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ"))
        except Exception:
            pass
        # Add new columns to users table for attendance/leave features
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS office VARCHAR"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS joining_date DATE"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_on_probation BOOLEAN DEFAULT FALSE"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS custom_policy_id INTEGER REFERENCES custom_leave_policies(id)"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE custom_leave_policies ADD COLUMN IF NOT EXISTS max_days_per_month INTEGER"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE custom_leave_policies ADD COLUMN IF NOT EXISTS policy_group_key VARCHAR(120)"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE custom_leave_policies ADD COLUMN IF NOT EXISTS sub_type_name VARCHAR(120)"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE custom_leave_policies ADD COLUMN IF NOT EXISTS shared_annual_limit INTEGER"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE custom_leave_policies ADD COLUMN IF NOT EXISTS monthly_allowance INTEGER"))
        except Exception:
            pass
        # Upgrade policy numeric columns to support decimals (e.g. 1.5 days / month)
        for _col in ("max_days_per_month", "monthly_allowance", "shared_annual_limit"):
            try:
                await conn.execute(
                    text(
                        f"ALTER TABLE custom_leave_policies ALTER COLUMN {_col} TYPE double precision "
                        f"USING {_col}::double precision"
                    )
                )
            except Exception:
                pass
        # Half-day leave columns
        try:
            await conn.execute(text("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS is_half_day BOOLEAN NOT NULL DEFAULT FALSE"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS half_day_period VARCHAR(16)"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_pending_approval BOOLEAN NOT NULL DEFAULT FALSE"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS office_location_id INTEGER REFERENCES office_locations(id) ON DELETE SET NULL"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_remote BOOLEAN NOT NULL DEFAULT FALSE"))
        except Exception:
            pass
        # User profile extension columns (position, department, contact info)
        for _col_def in (
            "position VARCHAR",
            "department VARCHAR",
            "phone VARCHAR",
            "emergency_contact_name VARCHAR",
            "emergency_contact_number VARCHAR",
            "address VARCHAR",
        ):
            try:
                await conn.execute(text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {_col_def}"))
            except Exception:
                pass
        # Add 'custom'/'CUSTOM' to leavetype enum if missing (required for custom leave policies)
        for _val in ("custom", "CUSTOM"):
            try:
                await conn.execute(text(f"ALTER TYPE leavetype ADD VALUE IF NOT EXISTS '{_val}'"))
            except Exception:
                try:
                    await conn.execute(text(f"ALTER TYPE leavetype ADD VALUE '{_val}'"))
                except Exception:
                    pass

        # Unique index on leave_monthly_credits (handles NULL columns via COALESCE)
        try:
            await conn.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS uix_leave_monthly_credits
                ON leave_monthly_credits (user_id, year, month, COALESCE(leave_type,''), COALESCE(custom_policy_id,0))
            """))
        except Exception:
            pass

    # Run monthly leave credit backfill (idempotent — safe every startup)
    try:
        from app.services.leave_credit_service import run_monthly_leave_credits
        await run_monthly_leave_credits()
        logging.getLogger(__name__).info("Monthly leave credit backfill complete.")
    except Exception as exc:
        logging.getLogger(__name__).error("Leave credit backfill failed at startup: %s", exc)

    # Start background scheduler (runs daily, credits on the 1st of each month)
    asyncio.create_task(_monthly_credit_scheduler())
    # Start auto-absent scheduler (marks absent anyone who clocked in but never clocked out)
    asyncio.create_task(_auto_absent_scheduler())


@app.get("/")
async def root():
    return {"message": "Welcome to Acknowledge API"}


@app.get("/health")
async def health():
    """Use this to verify the deployed backend is up and has custom-policies support."""
    return {
        "status": "ok",
        "custom_policies_list": True,
        "message": "Backend has GET /leaves/custom-policies/list",
    }


@app.get("/health/db")
async def health_db():
    """Verify PostgreSQL is reachable (use after tunnels/VPN or when debugging disconnects)."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "database": "connected",
            "message": "PostgreSQL accepted a connection and responded to SELECT 1.",
        }
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "database": "unreachable",
                "detail": str(e)[:500],
                "hint": "Check DATABASE_URL, VPN/SSH tunnel, and that Postgres is running. "
                "Tunnels that close idle connections require pool_pre_ping (enabled in app.database).",
            },
        )

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    from fastapi import Response
    return Response(status_code=204)

