from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, and_, or_
from sqlalchemy.orm import selectinload
from typing import List
from app.database import get_db
from app.models.user import User, UserRole
from app.models.task import Task, TaskStatus
from app.models.concern import Concern, ConcernStatus
from app.models.policy import Policy, policy_acknowledgments
from app.models.notification import Notification, notification_acknowledgments
from app.routes.auth import get_current_user
from app.schemas.user_schema import UserPromote, UserResponse
from datetime import datetime, timedelta, timezone

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

@router.get("/track")
async def get_tracking_data(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_senior)):
    """Get comprehensive tracking data for directors"""
    
    # 1. Task Assignments (who assigned tasks to whom)
    task_assignments_result = await db.execute(
        select(
            User.id.label('assigner_id'),
            User.full_name.label('assigner_name'),
            User.role.label('assigner_role'),
            func.count(Task.id).label('tasks_assigned')
        )
        .join(Task, Task.created_by_id == User.id)
        .group_by(User.id, User.full_name, User.role)
        .order_by(func.count(Task.id).desc())
    )
    task_assignments = [
        {
            "assigner_id": row.assigner_id,
            "assigner_name": row.assigner_name,
            "assigner_role": row.assigner_role,
            "tasks_assigned": row.tasks_assigned
        }
        for row in task_assignments_result.all()
    ]
    
    # Task assignments breakdown (who assigned to whom)
    # Need to use aliases for self-join
    from sqlalchemy.orm import aliased
    Assigner = aliased(User)
    Assignee = aliased(User)
    
    task_breakdown_result = await db.execute(
        select(
            Assigner.full_name.label('assigner_name'),
            Assignee.full_name.label('assignee_name'),
            Assignee.role.label('assignee_role'),
            func.count(Task.id).label('task_count')
        )
        .join(Task, Task.created_by_id == Assigner.id)
        .join(Assignee, Task.assigned_to_id == Assignee.id)
        .group_by(Assigner.full_name, Assignee.full_name, Assignee.role)
        .order_by(func.count(Task.id).desc())
    )
    task_breakdown = [
        {
            "assigner": row.assigner_name,
            "assignee": row.assignee_name,
            "assignee_role": row.assignee_role,
            "task_count": row.task_count
        }
        for row in task_breakdown_result.all()
    ]
    
    # 2. Notifications Issued (who created notifications)
    notifications_result = await db.execute(
        select(
            User.id.label('creator_id'),
            User.full_name.label('creator_name'),
            User.role.label('creator_role'),
            func.count(Notification.id).label('notifications_created')
        )
        .join(Notification, Notification.created_by_id == User.id)
        .group_by(User.id, User.full_name, User.role)
        .order_by(func.count(Notification.id).desc())
    )
    notifications_issued = [
        {
            "creator_id": row.creator_id,
            "creator_name": row.creator_name,
            "creator_role": row.creator_role,
            "notifications_created": row.notifications_created
        }
        for row in notifications_result.all()
    ]
    
    # 3. Acknowledgments - Policies
    # Get all policies and users
    all_policies = await db.execute(select(Policy))
    policies_list = all_policies.scalars().all()
    
    all_users = await db.execute(select(User))
    users_list = all_users.scalars().all()
    
    # Get policy acknowledgments
    policy_acks_result = await db.execute(
        select(
            policy_acknowledgments.c.user_id,
            policy_acknowledgments.c.policy_id,
            func.count().label('ack_count')
        )
        .group_by(policy_acknowledgments.c.user_id, policy_acknowledgments.c.policy_id)
    )
    policy_acks = {(row.user_id, row.policy_id): row.ack_count for row in policy_acks_result.all()}
    
    policy_acknowledgment_stats = []
    for user in users_list:
        total_policies = len(policies_list)
        acknowledged = sum(1 for policy in policies_list if (user.id, policy.id) in policy_acks)
        pending = total_policies - acknowledged
        ack_rate = round((acknowledged / total_policies * 100) if total_policies > 0 else 0, 1)
        
        policy_acknowledgment_stats.append({
            "user_id": user.id,
            "user_name": user.full_name,
            "user_role": user.role,
            "total_policies": total_policies,
            "acknowledged": acknowledged,
            "pending": pending,
            "acknowledgment_rate": ack_rate
        })
    
    # Notifications acknowledgments
    notif_acks_result = await db.execute(
        select(
            notification_acknowledgments.c.user_id,
            func.count(notification_acknowledgments.c.notification_id).label('ack_count')
        )
        .group_by(notification_acknowledgments.c.user_id)
    )
    notif_acks = {row.user_id: row.ack_count for row in notif_acks_result.all()}
    
    total_notifications = await db.scalar(select(func.count(Notification.id)))
    
    notification_ack_stats = []
    for user in users_list:
        ack_count = notif_acks.get(user.id, 0)
        notif_ack_rate = round((ack_count / total_notifications * 100) if total_notifications > 0 else 0, 1)
        
        notification_ack_stats.append({
            "user_id": user.id,
            "user_name": user.full_name,
            "user_role": user.role,
            "notifications_acknowledged": ack_count,
            "total_notifications": total_notifications or 0,
            "acknowledgment_rate": notif_ack_rate
        })
    
    # 4. Activity & Performance Metrics
    # Get tasks with deadlines and completion status
    tasks_with_deadlines = await db.execute(
        select(Task)
        .options(selectinload(Task.assigned_to))
        .filter(Task.deadline.isnot(None))
    )
    tasks_list = tasks_with_deadlines.scalars().all()
    
    activity_metrics = []
    for user in users_list:
        # Tasks assigned to this user
        user_tasks = [t for t in tasks_list if t.assigned_to_id == user.id]
        total_tasks = len(user_tasks)
        
        if total_tasks == 0:
            activity_metrics.append({
                "user_id": user.id,
                "user_name": user.full_name,
                "user_role": user.role,
                "total_tasks": 0,
                "completed_tasks": 0,
                "on_time_tasks": 0,
                "late_tasks": 0,
                "completion_rate": 0.0,
                "on_time_rate": 0.0,
                "activity_score": 0.0,
                "status": "inactive"
            })
            continue
        
        completed_tasks = [t for t in user_tasks if t.status == TaskStatus.COMPLETED]
        completed_count = len(completed_tasks)
        
        # Check on-time delivery (completed before or on deadline)
        # Use timezone-aware datetime for comparisons
        now = datetime.now(timezone.utc)
        on_time_tasks = [
            t for t in completed_tasks 
            if t.deadline and t.updated_at and t.updated_at <= t.deadline
        ]
        on_time_count = len(on_time_tasks)
        
        late_tasks = [
            t for t in completed_tasks 
            if t.deadline and t.updated_at and t.updated_at > t.deadline
        ]
        late_count = len(late_tasks)
        
        # Pending tasks past deadline
        pending_past_deadline = [
            t for t in user_tasks 
            if t.status != TaskStatus.COMPLETED and t.deadline and t.deadline < now
        ]
        late_count += len(pending_past_deadline)
        
        completion_rate = round((completed_count / total_tasks * 100), 1)
        on_time_rate = round((on_time_count / completed_count * 100) if completed_count > 0 else 0, 1)
        
        # Activity score: combination of completion rate and on-time rate
        activity_score = round((completion_rate * 0.6 + on_time_rate * 0.4), 1)
        
        # Determine status
        if activity_score >= 80 and total_tasks >= 3:
            status = "high_performer"
        elif activity_score < 50 or late_count > completed_count * 0.3:
            status = "needs_attention"
        elif total_tasks == 0:
            status = "inactive"
        else:
            status = "normal"
        
        activity_metrics.append({
            "user_id": user.id,
            "user_name": user.full_name,
            "user_role": user.role,
            "total_tasks": total_tasks,
            "completed_tasks": completed_count,
            "on_time_tasks": on_time_count,
            "late_tasks": late_count,
            "completion_rate": completion_rate,
            "on_time_rate": on_time_rate,
            "activity_score": activity_score,
            "status": status
        })
    
    # Sort by activity score
    activity_metrics.sort(key=lambda x: x["activity_score"], reverse=True)
    
    return {
        "task_assignments": task_assignments,
        "task_breakdown": task_breakdown,
        "notifications_issued": notifications_issued,
        "policy_acknowledgments": sorted(policy_acknowledgment_stats, key=lambda x: x["acknowledgment_rate"], reverse=True),
        "notification_acknowledgments": sorted(notification_ack_stats, key=lambda x: x["acknowledgment_rate"], reverse=True),
        "activity_metrics": activity_metrics
    }

@router.put("/users/{user_id}/promote", response_model=UserResponse)
async def promote_user(
    user_id: int,
    promote_data: UserPromote,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_senior)
):
    """Promote a user to a new role. Only directors (seniors) can do this.
    
    This endpoint preserves all user authentication credentials including:
    - Email (used for Microsoft/Google OAuth lookup)
    - Password hash
    - User ID
    
    Users created via Microsoft authentication will remain linked to their Microsoft account
    after promotion, as authentication is based on email lookup which remains unchanged.
    """
    
    # Get the user to promote
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent promoting to senior role (should use signup key)
    if promote_data.new_role == UserRole.SENIOR:
        raise HTTPException(status_code=400, detail="Cannot promote to senior role. Use signup process instead.")
    
    # Prevent demoting seniors
    if user.role == UserRole.SENIOR and promote_data.new_role != UserRole.SENIOR:
        raise HTTPException(status_code=400, detail="Cannot demote senior users")
    
    # Prevent self-promotion/demotion
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    
    # Store original email to ensure it's preserved (Microsoft/Google auth uses email for lookup)
    original_email = user.email
    original_password_hash = user.hashed_password
    
    # Update only the user's role - all other fields (email, password, etc.) remain unchanged
    # This ensures Microsoft/Google authentication continues to work after promotion
    old_role = user.role
    user.role = promote_data.new_role
    
    # Verify email and password hash are preserved (should never change, but double-check)
    if user.email != original_email:
        raise HTTPException(status_code=500, detail="Email was modified during promotion - this should not happen")
    if user.hashed_password != original_password_hash:
        raise HTTPException(status_code=500, detail="Password hash was modified during promotion - this should not happen")
    
    await db.commit()
    await db.refresh(user)
    
    return user
