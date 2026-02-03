from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum, Text, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum

class ConcernStatus(str, enum.Enum):
    OPEN = "open"
    ACCEPTED = "accepted"
    RESOLVED = "resolved"
    ESCALATED = "escalated"

# Association table for concern notifications (who should see this concern)
concern_notified_users = Table(
    'concern_notified_users',
    Base.metadata,
    Column('concern_id', Integer, ForeignKey('concerns.id'), primary_key=True),
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True)
)

# Association table for concern acknowledgments (who has acknowledged)
concern_acknowledgments = Table(
    'concern_acknowledgments',
    Base.metadata,
    Column('concern_id', Integer, ForeignKey('concerns.id'), primary_key=True),
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('acknowledged_at', DateTime(timezone=True), server_default=func.now())
)

class Concern(Base):
    __tablename__ = "concerns"

    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    status = Column(Enum(ConcernStatus), default=ConcernStatus.OPEN)
    
    raised_by_id = Column(Integer, ForeignKey("users.id"))
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    venture_id = Column(Integer, ForeignKey("ventures.id"), nullable=True)
    resolved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    raised_by = relationship("User", foreign_keys=[raised_by_id], backref="concerns_raised")
    resolved_by = relationship("User", foreign_keys=[resolved_by_id], backref="concerns_resolved")
    notified_users = relationship("User", secondary=concern_notified_users, backref="concerns_notified")
    acknowledged_by = relationship("User", secondary=concern_acknowledgments, backref="concerns_acknowledged")
    task = relationship("Task", backref="concerns")
    venture = relationship("Venture", backref="concerns")
