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
from fastapi import Depends
from app.database import get_db
from app.routes.auth import get_current_user
from app.routes.leaves import _list_custom_leave_policies_impl
from app.models.user import User

@app.get("/leaves/custom-policies/list")
@app.get("/leaves/custom-policies")
async def list_custom_policies_backup(
    for_apply: bool = False,
    db=Depends(get_db),
    current_user: User=Depends(get_current_user),
):
    """Backup routes for listing custom leave policies (same as leaves router)."""
    return await _list_custom_leave_policies_impl(for_apply, db, current_user)

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

@app.on_event("startup")
async def startup():
    # Ensure all models are registered (including custom_leave_policies)
    from app.models import leave, custom_leave_policy  # noqa: F401
    async with engine.begin() as conn:
        # Create tables (includes new: attendance, attendance_update_requests, leave_requests, holidays, custom_leave_policies)
        await conn.run_sync(Base.metadata.create_all)
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
        # Add 'custom'/'CUSTOM' to leavetype enum if missing (required for custom leave policies)
        for _val in ("custom", "CUSTOM"):
            try:
                await conn.execute(text(f"ALTER TYPE leavetype ADD VALUE IF NOT EXISTS '{_val}'"))
            except Exception:
                try:
                    await conn.execute(text(f"ALTER TYPE leavetype ADD VALUE '{_val}'"))
                except Exception:
                    pass

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

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    from fastapi import Response
    return Response(status_code=204)

