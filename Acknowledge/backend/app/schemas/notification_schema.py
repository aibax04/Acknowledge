from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.schemas.user_schema import UserResponse

class NotificationBase(BaseModel):
    title: str
    content: str

class NotificationCreate(NotificationBase):
    recipient_ids: Optional[List[int]] = None
    notification_type: Optional[str] = "BROADCAST"

class NotificationResponse(NotificationBase):
    id: int
    notification_type: str
    created_by_id: Optional[int] = None
    created_at: datetime
    created_by: Optional[UserResponse] = None
    is_acknowledged: Optional[bool] = None  # To be populated dynamically

    class Config:
        from_attributes = True

class NotificationStatus(BaseModel):
    notification_id: int
    total_users: int
    acknowledged_count: int
    acknowledged_users: List[UserResponse]
    pending_users: List[UserResponse]
