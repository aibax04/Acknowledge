from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Table, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

# Association table for User-Policy many-to-many relationship (acknowledgments)
policy_acknowledgments = Table(
    "policy_acknowledgments",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("policy_id", Integer, ForeignKey("policies.id"), primary_key=True),
    Column("acknowledged_at", DateTime(timezone=True), server_default=func.now())
)

class Policy(Base):
    __tablename__ = "policies"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)  # Full policy content with formatting
    image_url = Column(String, nullable=True)  # Optional cover image URL
    target_audience = Column(String, default="all") # all, employee, manager, intern
    is_active = Column(Boolean, default=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    created_by = relationship("User", backref="policies_created", foreign_keys=[created_by_id])
    acknowledged_by = relationship("User", secondary=policy_acknowledgments, backref="acknowledged_policies")

