from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List
from sqlalchemy import func
from app.database import get_db
from app.models.task import Task, TaskComment
from app.models.user import User, UserRole
from app.schemas.task_schema import TaskCreate, TaskResponse, TaskUpdate, TaskCommentCreate, TaskCommentResponse, TaskCommentSummary
from app.routes.auth import get_current_user

router = APIRouter(prefix="/tasks", tags=["tasks"])

@router.post("/", response_model=TaskResponse)
async def create_task(task: TaskCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Employees may assign tasks only to employees and interns
    if current_user.role == UserRole.EMPLOYEE:
        if not task.assigned_to_id:
            raise HTTPException(status_code=403, detail="Please select someone to assign the task to")
        result = await db.execute(select(User).filter(User.id == task.assigned_to_id))
        assignee = result.scalars().first()
        if not assignee:
            raise HTTPException(status_code=404, detail="Assignee not found")
        if assignee.role not in (UserRole.EMPLOYEE, UserRole.INTERN):
            raise HTTPException(status_code=403, detail="Employees can only assign tasks to other employees or interns")
    
    new_task = Task(
        title=task.title,
        description=task.description,
        priority=task.priority,
        deadline=task.deadline,
        assigned_to_id=task.assigned_to_id,
        created_by_id=current_user.id,
        venture_id=task.venture_id
    )
    db.add(new_task)
    await db.commit()
    
    # Re-fetch with relationships for the response model
    stmt = select(Task).filter(Task.id == new_task.id).options(
        selectinload(Task.assigned_to), 
        selectinload(Task.created_by)
    )
    result = await db.execute(stmt)
    return result.scalars().first()

@router.get("/", response_model=List[TaskResponse])
async def get_tasks(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy import or_
    query = select(Task).options(selectinload(Task.assigned_to), selectinload(Task.created_by))
    
    if current_user.role == UserRole.EMPLOYEE:
        # Employees see tasks assigned to them OR tasks they created (assigned to others)
        query = query.filter(
            or_(
                Task.assigned_to_id == current_user.id,
                Task.created_by_id == current_user.id
            )
        )
    elif current_user.role == UserRole.INTERN:
        query = query.filter(Task.assigned_to_id == current_user.id)
    elif current_user.role == UserRole.MANAGER:
        query = query.filter(
            or_(
                Task.created_by_id == current_user.id,
                Task.assigned_to_id == current_user.id
            )
        )
    
    # Order by newest first
    query = query.order_by(Task.created_at.desc())

    # Seniors see all
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/my-calendar", response_model=List[TaskResponse])
async def get_personal_tasks(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetch tasks explicitly assigned to the current user, even if they are a manager"""
    print(f"DEBUG: Hitting /tasks/my-calendar for user {current_user.id}")
    query = select(Task).options(selectinload(Task.assigned_to), selectinload(Task.created_by))
    query = query.filter(Task.assigned_to_id == current_user.id).order_by(Task.created_at.desc())
    result = await db.execute(query)
    tasks = result.scalars().all()
    print(f"DEBUG: Found {len(tasks)} personal tasks")
    return tasks

@router.put("/{task_id:int}", response_model=TaskResponse)
async def update_task(task_id: int, task_update: TaskUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Task).filter(Task.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    # Permission check: Only assignee or creator/manager can update
    if current_user.role in [UserRole.EMPLOYEE, UserRole.INTERN] and task.assigned_to_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot update tasks assigned to others")

    for key, value in task_update.model_dump(exclude_unset=True).items():
        setattr(task, key, value)
        
    await db.commit()
    
    # Re-fetch with relationships for the response model
    stmt = select(Task).filter(Task.id == task.id).options(
        selectinload(Task.assigned_to), 
        selectinload(Task.created_by)
    )
    result = await db.execute(stmt)
    return result.scalars().first()

@router.delete("/{task_id:int}")
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete a task - only creator, assignee, or senior can delete"""
    result = await db.execute(select(Task).filter(Task.id == task_id))
    task = result.scalars().first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Permission check: Only creator, assignee, or senior can delete
    if (task.created_by_id != current_user.id and 
        task.assigned_to_id != current_user.id and 
        current_user.role != UserRole.SENIOR):
        raise HTTPException(status_code=403, detail="You don't have permission to delete this task")
    
    # Delete task
    await db.delete(task)
    await db.commit()
    
    return {"message": "Task deleted successfully"}


# --- Task comments (assignee / creator can add comment back) ---

def _can_access_task(task: Task, current_user: User) -> bool:
    """User can see task if they are assignee, creator, or senior."""
    if current_user.role == UserRole.SENIOR:
        return True
    return task.assigned_to_id == current_user.id or task.created_by_id == current_user.id


@router.get("/comments/summary", response_model=List[TaskCommentSummary])
async def get_task_comment_summaries(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return last comment timestamp per task for the current user."""
    task_query = select(Task.id)

    if current_user.role in [UserRole.EMPLOYEE, UserRole.INTERN]:
        task_query = task_query.filter(Task.assigned_to_id == current_user.id)
    elif current_user.role == UserRole.MANAGER:
        from sqlalchemy import or_
        task_query = task_query.filter(
            or_(
                Task.created_by_id == current_user.id,
                Task.assigned_to_id == current_user.id
            )
        )
    # Seniors see all

    task_ids_result = await db.execute(task_query)
    task_ids = [row[0] for row in task_ids_result.all()]
    if not task_ids:
        return []

    summary_result = await db.execute(
        select(
            TaskComment.task_id,
            func.max(TaskComment.created_at).label("last_comment_at")
        )
        .filter(TaskComment.task_id.in_(task_ids))
        .group_by(TaskComment.task_id)
    )
    rows = summary_result.all()
    return [TaskCommentSummary(task_id=r[0], last_comment_at=r[1]) for r in rows]


@router.get("/{task_id:int}/comments", response_model=List[TaskCommentResponse])
async def get_task_comments(task_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Task).filter(Task.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _can_access_task(task, current_user):
        raise HTTPException(status_code=403, detail="You cannot view comments for this task")
    result = await db.execute(
        select(TaskComment).filter(TaskComment.task_id == task_id)
        .options(selectinload(TaskComment.user))
        .order_by(TaskComment.created_at.asc())
    )
    return result.scalars().all()


@router.post("/{task_id:int}/comments", response_model=TaskCommentResponse)
async def add_task_comment(task_id: int, comment: TaskCommentCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Task).filter(Task.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _can_access_task(task, current_user):
        raise HTTPException(status_code=403, detail="You cannot comment on this task")
    body = (comment.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    new_comment = TaskComment(task_id=task_id, user_id=current_user.id, body=body)
    db.add(new_comment)
    await db.commit()
    await db.refresh(new_comment)
    stmt = select(TaskComment).filter(TaskComment.id == new_comment.id).options(selectinload(TaskComment.user))
    result = await db.execute(stmt)
    return result.scalars().first()


# --- Task acknowledgment ---

@router.patch("/{task_id:int}/acknowledge", response_model=TaskResponse)
async def acknowledge_task(task_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Acknowledge a task - the assigned user (including managers) can acknowledge"""
    result = await db.execute(select(Task).filter(Task.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # The assigned user (including managers) can acknowledge
    if task.assigned_to_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the assigned user can acknowledge this task")
    
    # Set acknowledged_at to current time
    from datetime import datetime, timezone
    task.acknowledged_at = datetime.now(timezone.utc)
    await db.commit()
    
    # Re-fetch with relationships for the response model
    stmt = select(Task).filter(Task.id == task.id).options(
        selectinload(Task.assigned_to), 
        selectinload(Task.created_by)
    )
    result = await db.execute(stmt)
    return result.scalars().first()
