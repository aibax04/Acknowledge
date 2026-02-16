from sqlalchemy import Column, Integer, String, Enum, DateTime, Boolean, Date
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    office = Column(String, nullable=True)  # "panscience" or "eigen"
    joining_date = Column(Date, nullable=True)
    is_on_probation = Column(Boolean, default=False, nullable=True)
