import asyncio
from datetime import datetime, timedelta
from app.database import SessionLocal, engine, Base
from app.models.user import User, UserRole
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.concern import Concern, ConcernStatus
from app.models.policy import Policy
from app.utils.hashing import get_password_hash
from sqlalchemy import select, func

async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        # 1. Users
        users = {
            "employee": (await db.execute(select(User).filter(User.email == "employee@acknowledge.com"))).scalars().first(),
            "manager": (await db.execute(select(User).filter(User.email == "manager@acknowledge.com"))).scalars().first(),
            "senior": (await db.execute(select(User).filter(User.email == "senior@acknowledge.com"))).scalars().first(),
        }

        if not users["employee"]:
            print("Creating Employee...")
            users["employee"] = User(email="employee@acknowledge.com", full_name="John Doe", hashed_password=get_password_hash("password123"), role=UserRole.EMPLOYEE)
            db.add(users["employee"])
        
        if not users["manager"]:
            print("Creating Manager...")
            users["manager"] = User(email="manager@acknowledge.com", full_name="Sarah Miller", hashed_password=get_password_hash("password123"), role=UserRole.MANAGER)
            db.add(users["manager"])

        if not users["senior"]:
            print("Creating Senior...")
            users["senior"] = User(email="senior@acknowledge.com", full_name="Elena Davis", hashed_password=get_password_hash("password123"), role=UserRole.SENIOR)
            db.add(users["senior"])
        
        await db.commit()
        
        # Refresh to get IDs
        for u in users.values():
            await db.refresh(u)

        # 2. Tasks
        task_count = await db.scalar(select(func.count(Task.id)))
        if task_count == 0:
            print("Seeding Tasks...")
            tasks = [
                Task(title="Q1 Financial Report", description="Compile data for Q1", priority=TaskPriority.HIGH, status=TaskStatus.IN_PROGRESS, deadline=datetime.utcnow() + timedelta(days=5), assigned_to_id=users["employee"].id, created_by_id=users["manager"].id),
                Task(title="Update Website Assets", description="Replace old logos", priority=TaskPriority.MEDIUM, status=TaskStatus.PENDING, deadline=datetime.utcnow() + timedelta(days=10), assigned_to_id=users["employee"].id, created_by_id=users["manager"].id),
                Task(title="Client Onboarding", description="Draft contracts", priority=TaskPriority.LOW, status=TaskStatus.COMPLETED, deadline=datetime.utcnow() - timedelta(days=2), assigned_to_id=users["employee"].id, created_by_id=users["manager"].id),
            ]
            db.add_all(tasks)

        # 3. Policies
        policy_count = await db.scalar(select(func.count(Policy.id)))
        if policy_count == 0:
            print("Seeding Policies...")
            policies = [
                Policy(title="Data Security 2026", content="All data must be encrypted...", is_active=True),
                Policy(title="Remote Work Guidelines", content="Work from home allowed on Fridays...", is_active=True),
                Policy(title="Legacy Code Standards", content="Old standards...", is_active=False),
            ]
            db.add_all(policies)

        # 4. Concerns
        concern_count = await db.scalar(select(func.count(Concern.id)))
        if concern_count == 0:
            print("Seeding Concerns...")
            concerns = [
                Concern(subject="Laptop Issue", description="My battery is dying too fast", status=ConcernStatus.OPEN, raised_by_id=users["employee"].id),
                Concern(subject="Access Denied", description="Cannot access JIRA", status=ConcernStatus.RESOLVED, raised_by_id=users["employee"].id, resolved_at=datetime.utcnow()),
            ]
            db.add_all(concerns)

        await db.commit()
        print("Database seeded successfully with Users, Tasks, Policies, and Concerns!")

if __name__ == "__main__":
    asyncio.run(seed())
