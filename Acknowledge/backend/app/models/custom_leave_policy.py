from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class CustomLeavePolicy(Base):
    """Custom leave policy created by managers. Applications under these policies are approved by directors."""
    __tablename__ = "custom_leave_policies"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)  # heading
    prior_days = Column(Integer, nullable=False, default=0)  # days in advance required (0 = anytime)
    max_days_per_month = Column(Float, nullable=True)  # optional cap per month (None = no limit); supports decimals
    monthly_allowance = Column(Float, nullable=True)  # days granted per month; unused carries to wallet (leave balance)
    # Optional grouped-subtype policy support:
    # multiple subtype policies can share one annual pool using the same policy_group_key.
    policy_group_key = Column(String(120), nullable=True, index=True)
    sub_type_name = Column(String(120), nullable=True)
    shared_annual_limit = Column(Float, nullable=True)  # shared across all policies in the group, per year
    allowed_roles = Column(String(200), nullable=False)  # comma-separated: employee,intern,manager
    allowed_on_probation = Column(Boolean, default=True, nullable=True)  # whether probation employees can use this leave
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    created_by = relationship("User", foreign_keys=[created_by_id])
