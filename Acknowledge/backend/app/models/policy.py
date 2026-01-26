from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Table
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
    content = Column(String, nullable=False) # Link to doc or text content
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship to see who acknowledged it
    acknowledged_by = relationship("User", secondary=policy_acknowledgments, backref="acknowledged_policies")
