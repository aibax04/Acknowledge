from sqlalchemy import Column, Integer, String, Enum, DateTime, Date, Float, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class AttendanceStatus(str, enum.Enum):
    PRESENT = "present"
    ABSENT = "absent"
    HALF_DAY = "half_day"
    WEEKLY_OFF = "weekly_off"
    HOLIDAY = "holiday"
    ON_LEAVE = "on_leave"


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    clock_in = Column(DateTime(timezone=True), nullable=True)
    clock_out = Column(DateTime(timezone=True), nullable=True)
    clock_in_lat = Column(Float, nullable=True)
    clock_in_lng = Column(Float, nullable=True)
    clock_in_address = Column(String, nullable=True)
    clock_out_lat = Column(Float, nullable=True)
    clock_out_lng = Column(Float, nullable=True)
    clock_out_address = Column(String, nullable=True)
    status = Column(Enum(AttendanceStatus), default=AttendanceStatus.PRESENT)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint('user_id', 'date', name='uq_attendance_user_date'),
    )


class AttendanceUpdateRequest(Base):
    __tablename__ = "attendance_update_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False)
    requested_clock_in = Column(DateTime(timezone=True), nullable=True)
    requested_clock_out = Column(DateTime(timezone=True), nullable=True)
    reason = Column(String, nullable=False)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="pending")  # pending, approved, rejected
    reviewer_notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    manager = relationship("User", foreign_keys=[manager_id])
