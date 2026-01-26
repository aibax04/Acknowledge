from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from app.database import get_db
from app.models.task import Task, TaskStatus
from app.models.concern import Concern, ConcernStatus
from app.models.user import User, UserRole
from app.models.policy import Policy, policy_acknowledgments
from app.routes.auth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    stats = {}
    
    if current_user.role == UserRole.EMPLOYEE:
        # Task stats for employee
        open_tasks = await db.scalar(
            select(func.count(Task.id))
            .where(Task.assigned_to_id == current_user.id)
            .where(Task.status.in_([TaskStatus.PENDING, TaskStatus.IN_PROGRESS]))
        )
        completed_tasks = await db.scalar(
            select(func.count(Task.id))
            .where(Task.assigned_to_id == current_user.id)
            .where(Task.status == TaskStatus.COMPLETED)
        )
        
        active_concerns = await db.scalar(
            select(func.count(Concern.id))
            .where(Concern.raised_by_id == current_user.id)
            .where(Concern.status == ConcernStatus.OPEN)
        )
        
        stats = {
            "open_tasks": open_tasks or 0,
            "completed_tasks": completed_tasks or 0,
            "active_concerns": active_concerns or 0
        }
    else:
        # Senior/Manager stats (Global)
        total_tasks = await db.scalar(select(func.count(Task.id)))
        pending_tasks = await db.scalar(
            select(func.count(Task.id))
            .where(Task.status == TaskStatus.PENDING)
        )
        
        total_concerns = await db.scalar(select(func.count(Concern.id)))
        open_concerns = await db.scalar(
            select(func.count(Concern.id))
            .where(Concern.status == ConcernStatus.OPEN)
        )
        
        # Calculate Team Workload (Pending / Total)
        team_workload = 0
        if total_tasks and total_tasks > 0:
            team_workload = int((pending_tasks / total_tasks) * 100)

        # Calculate Compliance Rate
        total_employees = await db.scalar(select(func.count(User.id)).where(User.role == UserRole.EMPLOYEE))
        total_policies = await db.scalar(select(func.count(Policy.id)).where(Policy.is_active == True))
        
        total_acknowledgments = await db.scalar(select(func.count()).select_from(policy_acknowledgments))
        
        compliance_rate = 0
        if total_employees > 0 and total_policies > 0:
            max_acks = total_employees * total_policies
            compliance_rate = int((total_acknowledgments / max_acks) * 100)
            
        stats = {
            "total_tasks": total_tasks or 0,
            "pending_tasks": pending_tasks or 0,
            "total_concerns": total_concerns or 0,
            "open_concerns": open_concerns or 0,
            "team_workload": f"{team_workload}%",
            "compliance_rate": f"{compliance_rate}%"
        }
        
    return stats
