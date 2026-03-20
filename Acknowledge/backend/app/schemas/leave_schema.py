from pydantic import BaseModel, field_validator
from typing import Optional, List, Union, Dict
from datetime import date, datetime

# Allowed leave types for new applications: Casual/Sick, Earned Leave, Unpaid, Custom
ALLOWED_LEAVE_TYPES = {"casual_sick_leave", "earned_leave", "unpaid_leave", "custom"}


def _parse_date(v: Union[str, date]) -> date:
    """Accept date or ISO string (YYYY-MM-DD) or DD/MM/YYYY string."""
    if isinstance(v, date):
        return v
    s = (v or "").strip()
    if not s:
        raise ValueError("Date is required")
    # ISO
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        try:
            return date(int(s[:4]), int(s[5:7]), int(s[8:10]))
        except (ValueError, TypeError):
            pass
    # DD/MM/YYYY or D/M/YYYY
    if "/" in s:
        parts = s.split("/")
        if len(parts) == 3:
            try:
                day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
                if year < 100:
                    year += 2000
                return date(year, month, day)
            except (ValueError, TypeError):
                pass
    raise ValueError(f"Invalid date format. Use YYYY-MM-DD or DD/MM/YYYY: {s[:20]}")


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

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def parse_date(cls, v) -> date:
        return _parse_date(v)


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
    max_days_per_month: Optional[int] = None  # optional cap per month (None = no limit)
    allowed_roles: List[str]  # e.g. ["employee", "intern", "manager"]
    allowed_on_probation: bool = True  # whether people on probation can use this leave
    enable_sub_types: bool = False
    sub_types: Optional[List[str]] = None  # e.g. ["Medical", "Earned"]
    shared_annual_limit: Optional[int] = None  # shared pool across sub_types, per year
    sub_type_prior_days: Optional[Dict[str, int]] = None  # e.g. {"Medical": 0, "Earned": 7}


class CustomLeavePolicyResponse(BaseModel):
    id: int
    title: str
    prior_days: int
    max_days_per_month: Optional[int] = None
    policy_group_key: Optional[str] = None
    sub_type_name: Optional[str] = None
    shared_annual_limit: Optional[int] = None
    allowed_roles: List[str]
    allowed_on_probation: Optional[bool] = True
    created_by_id: int
    created_at: datetime
    created_by_name: Optional[str] = None

    class Config:
        from_attributes = True
