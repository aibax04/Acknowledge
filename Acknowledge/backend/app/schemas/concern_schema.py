from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.concern import ConcernStatus
from app.schemas.user_schema import UserResponse

class ConcernBase(BaseModel):
    subject: str
    description: str

class ConcernCreate(ConcernBase):
    notified_user_ids: List[int] = []  # List of user IDs to notify

class ConcernUpdate(BaseModel):
    status: Optional[ConcernStatus] = None
    resolved_at: Optional[datetime] = None

class ConcernResponse(ConcernBase):
    id: int
    status: ConcernStatus
    raised_by: Optional[UserResponse] = None
    notified_users: List[UserResponse] = []
    acknowledged_by: List[UserResponse] = []
    created_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True
