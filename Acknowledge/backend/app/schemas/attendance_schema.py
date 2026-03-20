from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


class ClockInRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None


class ClockOutRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None


class AttendanceResponse(BaseModel):
    id: Optional[int] = None
    user_id: int
    date: date
    clock_in: Optional[datetime] = None
    clock_out: Optional[datetime] = None
    clock_in_address: Optional[str] = None
    clock_out_address: Optional[str] = None
    status: str
    user_name: Optional[str] = None

    class Config:
        from_attributes = True


class AttendanceUpdateRequestCreate(BaseModel):
    date: date
    requested_clock_in: Optional[str] = None  # ISO format time string
    requested_clock_out: Optional[str] = None
    reason: str
    manager_id: int


class AttendanceUpdateRequestResponse(BaseModel):
    id: int
    user_id: int
    date: date
    requested_clock_in: Optional[datetime] = None
    requested_clock_out: Optional[datetime] = None
    reason: str
    manager_id: int
    status: str
    reviewer_notes: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    user_name: Optional[str] = None
    manager_name: Optional[str] = None

    class Config:
        from_attributes = True


class AttendanceUpdateReview(BaseModel):
    status: str  # "approved" or "rejected"
    reviewer_notes: Optional[str] = None


class MarkAbsentRequest(BaseModel):
    user_id: int
    absent_date: date
