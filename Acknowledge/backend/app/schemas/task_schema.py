from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.task import TaskPriority, TaskStatus
from app.schemas.user_schema import UserResponse

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.MEDIUM
    deadline: Optional[datetime] = None

class TaskCreate(TaskBase):
    assigned_to_id: int

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[TaskPriority] = None
    status: Optional[TaskStatus] = None
    deadline: Optional[datetime] = None
    assigned_to_id: Optional[int] = None

class TaskResponse(TaskBase):
    id: int
    status: TaskStatus
    created_at: datetime
    updated_at: Optional[datetime]
    created_by: Optional[UserResponse] = None
    assigned_to: Optional[UserResponse] = None

    class Config:
        from_attributes = True
