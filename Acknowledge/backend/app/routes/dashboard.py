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
    elif current_user.role == UserRole.MANAGER:
        # Manager stats (Scoped)
        from sqlalchemy import or_
        
        # Tasks: Created by me OR assigned to me
        task_filter = or_(
            Task.created_by_id == current_user.id,
            Task.assigned_to_id == current_user.id
        )
        
        total_tasks = await db.scalar(select(func.count(Task.id)).where(task_filter))
        
        pending_tasks = await db.scalar(
            select(func.count(Task.id))
            .where(task_filter)
            .where(Task.status == TaskStatus.PENDING)
        )
        
        in_progress_tasks = await db.scalar(
            select(func.count(Task.id))
            .where(task_filter)
            .where(Task.status == TaskStatus.IN_PROGRESS)
        )
        
        active_tasks = (pending_tasks or 0) + (in_progress_tasks or 0)
        
        # Concerns: Raised by me OR notified
        # Note: Complex join for count might be heavy, for now simplify to raised_by or notified
        from app.models.concern import concern_notified_users
        concern_query = select(func.count(Concern.id)).outerjoin(concern_notified_users).where(
            or_(
                Concern.raised_by_id == current_user.id,
                concern_notified_users.c.user_id == current_user.id
            )
        ).distinct()
        
        total_concerns = await db.scalar(concern_query)
        
        open_concern_query = concern_query.where(Concern.status == ConcernStatus.OPEN)
        open_concerns = await db.scalar(open_concern_query)
        
        # Workload
        team_workload = 0
        if total_tasks and total_tasks > 0:
            team_workload = int((active_tasks / total_tasks) * 100)
            
        # Compliance Rate (Keep global for now as managers oversee general compliance or 0 if strictly personal?)
        # Let's keep it global for now as "Team Compliance" is usually general.
        # But to be safe according to "data seen only within them", maybe better to show 0 or global?
        # User said "data in db of manager", arguably compliance is read-only global metric. 
        # I'll keep the global compliance calculation for simplicity as Manager manages "Employees".
        
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
            "in_progress_tasks": in_progress_tasks or 0,
            "active_tasks": active_tasks,
            "total_concerns": total_concerns or 0,
            "open_concerns": open_concerns or 0,
            "team_workload": f"{team_workload}%",
            "compliance_rate": f"{compliance_rate}%"
        }
    else:
        # Senior stats (Global)
        total_tasks = await db.scalar(select(func.count(Task.id)))
        pending_tasks = await db.scalar(
            select(func.count(Task.id))
            .where(Task.status == TaskStatus.PENDING)
        )
        
        in_progress_tasks = await db.scalar(
            select(func.count(Task.id))
            .where(Task.status == TaskStatus.IN_PROGRESS)
        )
        
        active_tasks = (pending_tasks or 0) + (in_progress_tasks or 0)
        
        total_concerns = await db.scalar(select(func.count(Concern.id)))
        open_concerns = await db.scalar(
            select(func.count(Concern.id))
            .where(Concern.status == ConcernStatus.OPEN)
        )
        
        # Calculate Team Workload (Active / Total)
        team_workload = 0
        if total_tasks and total_tasks > 0:
            team_workload = int((active_tasks / total_tasks) * 100)

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
            "in_progress_tasks": in_progress_tasks or 0,
            "active_tasks": active_tasks,
            "total_concerns": total_concerns or 0,
            "open_concerns": open_concerns or 0,
            "team_workload": f"{team_workload}%",
            "compliance_rate": f"{compliance_rate}%"
        }
        
    return stats
