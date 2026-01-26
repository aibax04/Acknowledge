from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.schemas.user_schema import UserResponse

class PolicyBase(BaseModel):
    title: str
    content: str
    is_active: bool = True

class PolicyCreate(PolicyBase):
    pass

class PolicyResponse(PolicyBase):
    id: int
    created_at: datetime
    acknowledged_by: List[UserResponse] = []

    class Config:
        from_attributes = True
