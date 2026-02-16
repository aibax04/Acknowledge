from sqlalchemy import Column, Integer, String, Enum, DateTime, Date, Float, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import enum

# Import for FK; avoid circular import by using relationship string in custom_leave_policy


class LeaveType(str, enum.Enum):
    EARNED_LEAVE = "earned_leave"
    CASUAL_SICK_LEAVE = "casual_sick_leave"  # legacy; same pool as casual + sick
    CASUAL_LEAVE = "casual_leave"
    SICK_LEAVE = "sick_leave"
    UNPAID_LEAVE = "unpaid_leave"
    CUSTOM = "custom"  # uses custom_leave_policy_id; approved by director


class LeaveStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    leave_type = Column(Enum(LeaveType), nullable=False)
    custom_policy_id = Column(Integer, ForeignKey("custom_leave_policies.id"), nullable=True)  # when leave_type is CUSTOM
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    num_days = Column(Float, nullable=False)  # Float for half-days
    reason = Column(String, nullable=False)
    status = Column(Enum(LeaveStatus), default=LeaveStatus.PENDING)
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewer_notes = Column(String, nullable=True)
    applied_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    approved_by = relationship("User", foreign_keys=[approved_by_id])
    custom_policy = relationship("CustomLeavePolicy", foreign_keys=[custom_policy_id])