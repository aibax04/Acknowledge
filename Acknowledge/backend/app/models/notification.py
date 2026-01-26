from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

# Association table for notification acknowledgments
notification_acknowledgments = Table(
    'notification_acknowledgments',
    Base.metadata,
    Column('notification_id', Integer, ForeignKey('notifications.id'), primary_key=True),
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('acknowledged_at', DateTime(timezone=True), server_default=func.now())
)

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    created_by = relationship("User", backref="notifications_created")
    acknowledged_by = relationship("User", secondary=notification_acknowledgments, backref="notifications_acknowledged")
