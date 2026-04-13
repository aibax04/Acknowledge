from sqlalchemy import Column, Integer, String, Enum, DateTime, Boolean, Date, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum

class UserRole(str, enum.Enum):
    EMPLOYEE = "employee"
    MANAGER = "manager"
    SENIOR = "senior"
    INTERN = "intern"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.EMPLOYEE, nullable=False)
    is_active = Column(Boolean, default=True)
    is_pending_approval = Column(Boolean, default=False, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    office = Column(String, nullable=True)  # "panscience" or "eigen"
    joining_date = Column(Date, nullable=True)
    is_on_probation = Column(Boolean, default=False, nullable=True)
    office_location_id = Column(Integer, ForeignKey("office_locations.id", ondelete="SET NULL"), nullable=True)
    office_location = relationship("OfficeLocation", foreign_keys=[office_location_id], lazy="raise")
