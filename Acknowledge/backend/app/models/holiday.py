from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Holiday(Base):
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    date = Column(Date, nullable=False, index=True)
    office = Column(String, nullable=False)  # "eigen", "panscience", or "both"
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    created_by = relationship("User", foreign_keys=[created_by_id])
