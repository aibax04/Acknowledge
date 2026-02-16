from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


class HolidayCreate(BaseModel):
    title: str
    date: date
    office: str  # "eigen", "panscience", or "both"


class HolidayResponse(BaseModel):
    id: int
    title: str
    date: date
    office: str
    created_by_id: int
    created_at: datetime
    created_by_name: Optional[str] = None

    class Config:
        from_attributes = True
