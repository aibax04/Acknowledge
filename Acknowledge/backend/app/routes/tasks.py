from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List
from app.database import get_db
from app.models.task import Task
from app.models.user import User, UserRole
from app.schemas.task_schema import TaskCreate, TaskResponse, TaskUpdate
from app.routes.auth import get_current_user

router = APIRouter(prefix="/tasks", tags=["tasks"])

@router.post("/", response_model=TaskResponse)
async def create_task(task: TaskCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.EMPLOYEE:
         raise HTTPException(status_code=403, detail="Employees cannot assign tasks")
    
    new_task = Task(
        title=task.title,
        description=task.description,
        priority=task.priority,
        deadline=task.deadline,
        assigned_to_id=task.assigned_to_id,
        created_by_id=current_user.id
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
    query = select(Task).options(selectinload(Task.assigned_to), selectinload(Task.created_by))
    
    if current_user.role == UserRole.EMPLOYEE:
        query = query.filter(Task.assigned_to_id == current_user.id)
    
    # Managers/Seniors see all, or filtered by team (omitted for MVP)
    result = await db.execute(query)
    return result.scalars().all()

@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(task_id: int, task_update: TaskUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Task).filter(Task.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    # Permission check: Only assignee or creator/manager can update
    if current_user.role == UserRole.EMPLOYEE and task.assigned_to_id != current_user.id:
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
