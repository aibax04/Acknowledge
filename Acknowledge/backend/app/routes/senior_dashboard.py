from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, and_, or_
from typing import List
from app.database import get_db
from app.models.user import User, UserRole
from app.models.task import Task, TaskStatus
from app.models.concern import Concern, ConcernStatus
from app.models.policy import Policy
from app.routes.auth import get_current_user
from datetime import datetime, timedelta

router = APIRouter(prefix="/dashboard/senior", tags=["senior-dashboard"])

# Middleware to ensure only seniors can access
async def require_senior(current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="Senior role required")
    return current_user

@router.get("/summary")
async def get_senior_summary(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_senior)):
    """Get organization-wide summary statistics"""
    
    # Total tasks
    total_tasks_result = await db.execute(select(func.count(Task.id)))
    total_tasks = total_tasks_result.scalar() or 0
    
    # Completed tasks
    completed_tasks_result = await db.execute(
        select(func.count(Task.id)).filter(Task.status == TaskStatus.COMPLETED)
    )
    completed_tasks = completed_tasks_result.scalar() or 0
    
    # Operational efficiency
    operational_efficiency = round((completed_tasks / total_tasks * 100) if total_tasks > 0 else 0, 1)
    
    # Calculate efficiency change (mock for now - compare with last period)
    efficiency_change = 5.2  # Positive trend
    
    # Compliance rate (policies acknowledged)
    from app.models.policy import policy_acknowledgments
    total_users_result = await db.execute(select(func.count(User.id)))
    total_users = total_users_result.scalar() or 1
    
    total_policies_result = await db.execute(select(func.count(Policy.id)))
    total_policies = total_policies_result.scalar() or 1
    
    total_acks_result = await db.execute(select(func.count()).select_from(policy_acknowledgments))
    total_acks = total_acks_result.scalar() or 0
    
    expected_acks = total_users * total_policies
    compliance_rate = round((total_acks / expected_acks * 100) if expected_acks > 0 else 0, 1)
    
    # Escalated concerns
    escalated_concerns_result = await db.execute(
        select(func.count(Concern.id)).filter(Concern.status == ConcernStatus.ESCALATED)
    )
    escalated_concerns = escalated_concerns_result.scalar() or 0
    
    return {
        "operational_efficiency_percentage": operational_efficiency,
        "efficiency_change_percentage": efficiency_change,
        "compliance_rate": compliance_rate,
        "escalated_concerns_count": escalated_concerns,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "total_employees": total_users
    }

@router.get("/teams")
async def get_team_performance(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_senior)):
    """Get performance metrics by team (simulated)"""
    
    # Include both Managers and Seniors in the performance list
    managers_result = await db.execute(
        select(User).filter(User.role.in_([UserRole.MANAGER, UserRole.SENIOR]))
    )
    managers = managers_result.scalars().all()
    
    teams = []
    for manager in managers:
        # Get tasks assigned by this manager
        tasks_result = await db.execute(
            select(Task).filter(Task.created_by_id == manager.id)
        )
        tasks = tasks_result.scalars().all()
        
        total = len(tasks)
        completed = len([t for t in tasks if t.status == TaskStatus.COMPLETED])
        
        completion_rate = round((completed / total * 100) if total > 0 else 0, 1)
        utilization = min(100, round((total / 10 * 100), 1))  # Mock utilization
        
        # Determine performance flag
        if completion_rate >= 80 and utilization < 90:
            flag = "high"
        elif completion_rate < 50 or utilization > 95:
            flag = "warning"
        else:
            flag = "normal"
        
        teams.append({
            "team_name": f"{manager.full_name}'s Team",
            "task_completion_percentage": completion_rate,
            "resource_utilization_percentage": utilization,
            "performance_flag": flag,
            "total_tasks": total,
            "completed_tasks": completed
        })
    
    return sorted(teams, key=lambda x: x["task_completion_percentage"], reverse=True)

@router.get("/workforce/overview")
async def get_workforce_overview(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_senior)):
    """Get workforce statistics"""
    
    # Total employees and managers
    emp_count = await db.scalar(select(func.count(User.id)).where(User.role == UserRole.EMPLOYEE))
    mgr_count = await db.scalar(select(func.count(User.id)).where(User.role == UserRole.MANAGER))
    
    # Active entities
    active_emp_count = await db.scalar(
        select(func.count(func.distinct(Task.assigned_to_id)))
        .join(User, Task.assigned_to_id == User.id)
        .where(User.role == UserRole.EMPLOYEE)
    )
    active_mgr_count = await db.scalar(
        select(func.count(func.distinct(Task.created_by_id)))
        .join(User, Task.created_by_id == User.id)
        .where(User.role == UserRole.MANAGER)
    )

    # Total interns and active interns
    intern_count = await db.scalar(select(func.count(User.id)).where(User.role == UserRole.INTERN))
    active_intern_count = await db.scalar(
        select(func.count(func.distinct(Task.assigned_to_id)))
        .join(User, Task.assigned_to_id == User.id)
        .where(User.role == UserRole.INTERN)
    )
    
    # Workload distribution (employees and interns) - Only count PENDING tasks
    workload_result = await db.execute(
        select(
            User.id, 
            User.full_name, 
            User.role,
            func.count(Task.id).filter(Task.status == TaskStatus.PENDING).label('task_count')
        )
        .join(Task, Task.assigned_to_id == User.id, isouter=True)
        .filter(User.role.in_([UserRole.EMPLOYEE, UserRole.INTERN]))
        .group_by(User.id, User.full_name, User.role)
    )
    workload_data = workload_result.all()
    
    # Calculate overutilized based on threshold of 3+ tasks
    task_counts = [row.task_count for row in workload_data]
    overutilized = len([count for count in task_counts if count >= 3])
    
    return {
        "total_employees": emp_count or 0,
        "active_employees": active_emp_count or 0,
        "total_managers": mgr_count or 0,
        "active_managers": active_mgr_count or 0,
        "total_interns": intern_count or 0,
        "active_interns": active_intern_count or 0,
        "overutilized_count": overutilized,
        "workload_distribution": [
            {
                "employee_id": row.id,
                "employee_name": row.full_name,
                "role": row.role,
                "task_count": row.task_count,
                "status": "overutilized" if row.task_count >= 3 else "normal"
            }
            for row in workload_data
        ]
    }
