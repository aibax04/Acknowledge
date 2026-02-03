from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.schemas.user_schema import UserResponse

class VentureBase(BaseModel):
    name: str
    description: Optional[str] = None

class VentureCreate(VentureBase):
    pass

class VentureUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class VentureMemberAdd(BaseModel):
    user_ids: List[int]

class VentureMemberRemove(BaseModel):
    user_id: int

class VentureResponse(VentureBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class VentureDetailResponse(VentureResponse):
    members: List[UserResponse] = []
    creator: Optional[UserResponse] = None

    class Config:
        from_attributes = True
