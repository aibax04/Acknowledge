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
    venture_id: Optional[int] = None

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
    acknowledged_at: Optional[datetime] = None
    created_by: Optional[UserResponse] = None
    assigned_to: Optional[UserResponse] = None

    class Config:
        from_attributes = True


class TaskCommentCreate(BaseModel):
    body: str


class TaskCommentResponse(BaseModel):
    id: int
    task_id: int
    user_id: int
    body: str
    created_at: datetime
    user: Optional[UserResponse] = None

    class Config:
        from_attributes = True


class TaskCommentSummary(BaseModel):
    task_id: int
    last_comment_at: Optional[datetime] = None
