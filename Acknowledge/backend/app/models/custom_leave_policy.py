from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class CustomLeavePolicy(Base):
    """Custom leave policy created by managers. Applications under these policies are approved by directors."""
    __tablename__ = "custom_leave_policies"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)  # heading
    prior_days = Column(Integer, nullable=False, default=0)  # days in advance required (0 = anytime)
    allowed_roles = Column(String(200), nullable=False)  # comma-separated: employee,intern,manager
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    created_by = relationship("User", foreign_keys=[created_by_id])
