from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, tasks, concerns, policies, dashboard, senior_dashboard, reports, notifications
from app.database import engine, Base

app = FastAPI(title="Acknowledge API")

# Setup CORS
origins = [
    "*" # Simplified for dev
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Includes
app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(concerns.router)
app.include_router(policies.router)
app.include_router(dashboard.router)
app.include_router(senior_dashboard.router)
app.include_router(reports.router)
app.include_router(notifications.router)

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        # Create tables
        await conn.run_sync(Base.metadata.create_all)

@app.get("/")
async def root():
    return {"message": "Welcome to Acknowledge API"}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    from fastapi import Response
    return Response(status_code=204)
