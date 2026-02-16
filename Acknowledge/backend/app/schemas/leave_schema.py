from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import date, datetime

# Allowed leave types for new applications: Casual/Sick, Earned Leave, Unpaid, Custom
ALLOWED_LEAVE_TYPES = {"casual_sick_leave", "earned_leave", "unpaid_leave", "custom"}


class LeaveApplyRequest(BaseModel):
    leave_type: str  # casual_sick_leave, earned_leave, unpaid_leave, custom
    start_date: date
    end_date: date
    reason: str
    custom_policy_id: Optional[int] = None  # required when leave_type is custom; validated in route

    @field_validator("leave_type")
    @classmethod
    def leave_type_allowed(cls, v: str) -> str:
        if not v:
            raise ValueError("Leave type is required")
        normalized = v.strip().lower()
        if normalized not in ALLOWED_LEAVE_TYPES:
            raise ValueError(
                "Leave type must be one of: casual_sick_leave, earned_leave, unpaid_leave, custom"
            )
        return normalized


class LeaveResponse(BaseModel):
    id: int
    user_id: int
    leave_type: str
    start_date: date
    end_date: date
    num_days: float
    reason: str
    status: str
    approved_by_id: Optional[int] = None
    reviewer_notes: Optional[str] = None
    applied_at: datetime
    reviewed_at: Optional[datetime] = None
    user_name: Optional[str] = None
    approved_by_name: Optional[str] = None

    class Config:
        from_attributes = True


class LeaveReviewRequest(BaseModel):
    status: str  # "approved" or "rejected"
    reviewer_notes: Optional[str] = None


class LeaveBalanceResponse(BaseModel):
    earned_leave_accrued: float
    earned_leave_used: float
    earned_leave_balance: float
    casual_sick_leave_accrued: float
    casual_sick_leave_used: float
    casual_sick_leave_balance: float
    is_on_probation: bool
    can_use_earned_leave: bool
    joining_date: Optional[date] = None


# --- Custom Leave Policies (manager-created; director approves applications) ---
class CustomLeavePolicyCreate(BaseModel):
    title: str
    prior_days: int = 0  # days in advance required (0 = anytime)
    allowed_roles: List[str]  # e.g. ["employee", "intern", "manager"]


class CustomLeavePolicyResponse(BaseModel):
    id: int
    title: str
    prior_days: int
    allowed_roles: List[str]
    created_by_id: int
    created_at: datetime
    created_by_name: Optional[str] = None

    class Config:
        from_attributes = True
