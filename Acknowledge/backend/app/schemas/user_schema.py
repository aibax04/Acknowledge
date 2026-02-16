from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, date
from app.models.user import UserRole

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.EMPLOYEE

class UserCreate(UserBase):
    password: str
    senior_signup_key: Optional[str] = None  # required when role is senior

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    office: Optional[str] = None
    joining_date: Optional[date] = None
    is_on_probation: Optional[bool] = None

class UserPromote(BaseModel):
    new_role: UserRole

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    office: Optional[str] = None
    joining_date: Optional[date] = None
    is_on_probation: Optional[bool] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
