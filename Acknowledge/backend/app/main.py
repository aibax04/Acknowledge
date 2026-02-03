from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routes import auth, tasks, concerns, policies, dashboard, senior_dashboard, reports, notifications, ventures, uploads
from app.database import engine, Base
from app.config import settings
from pathlib import Path
from sqlalchemy import text

app = FastAPI(title="Acknowledge API", strict_slashes=False)

# Setup CORS
origins = settings.ALLOWED_ORIGINS.split(",")

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

# Includes
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

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        # Create tables
        await conn.run_sync(Base.metadata.create_all)
        # Minimal forward-compatible schema patch (non-destructive)
        # create_all won't add new columns to existing tables.
        try:
            await conn.execute(
                text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ")
            )
        except Exception:
            # Don't block startup if permissions/db differ; routes will error and logs will show why.
            pass

@app.get("/")
async def root():
    return {"message": "Welcome to Acknowledge API"}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    from fastapi import Response
    return Response(status_code=204)

