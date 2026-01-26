from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func, insert
from typing import List
from app.database import get_db
from app.models.notification import Notification, notification_acknowledgments
from app.models.user import User, UserRole
from app.schemas.notification_schema import NotificationCreate, NotificationResponse, NotificationStatus
from app.routes.auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.post("/", response_model=NotificationResponse)
async def create_notification(notification: NotificationCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.MANAGER, UserRole.SENIOR]:
        raise HTTPException(status_code=403, detail="Only managers and seniors can create general notifications")
    
    new_notif = Notification(
        title=notification.title,
        content=notification.content,
        created_by_id=current_user.id
    )
    db.add(new_notif)
    await db.commit()
    await db.refresh(new_notif)
    
    # Re-fetch with relationships
    result = await db.execute(
        select(Notification)
        .filter(Notification.id == new_notif.id)
        .options(selectinload(Notification.created_by))
    )
    return result.scalars().first()

@router.get("/", response_model=List[NotificationResponse])
async def get_notifications(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Fetch all notifications
    result = await db.execute(
        select(Notification)
        .options(selectinload(Notification.created_by))
        .order_by(Notification.created_at.desc())
    )
    notifications = result.scalars().all()
    
    # For each notification, check if the current user has acknowledged it
    response = []
    for notif in notifications:
        ack_check = await db.execute(
            select(notification_acknowledgments)
            .where(notification_acknowledgments.c.notification_id == notif.id)
            .where(notification_acknowledgments.c.user_id == current_user.id)
        )
        is_acknowledged = ack_check.first() is not None
        
        notif_data = NotificationResponse.from_orm(notif)
        notif_data.is_acknowledged = is_acknowledged
        response.append(notif_data)
        
    return response

@router.post("/{notification_id}/acknowledge")
async def acknowledge_notification(notification_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check if exists
    result = await db.execute(select(Notification).filter(Notification.id == notification_id))
    notif = result.scalars().first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Check if already acknowledged
    ack_check = await db.execute(
        select(notification_acknowledgments)
        .where(notification_acknowledgments.c.notification_id == notification_id)
        .where(notification_acknowledgments.c.user_id == current_user.id)
    )
    if ack_check.first():
        return {"message": "Already acknowledged"}
    
    # Add acknowledgment
    await db.execute(
        insert(notification_acknowledgments).values(
            notification_id=notification_id,
            user_id=current_user.id
        )
    )
    await db.commit()
    return {"message": "Notification acknowledged"}

@router.get("/{notification_id}/status", response_model=NotificationStatus)
async def get_notification_status(notification_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.MANAGER, UserRole.SENIOR]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Find notification
    result = await db.execute(select(Notification).filter(Notification.id == notification_id))
    notif = result.scalars().first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Get all employees
    users_result = await db.execute(select(User).filter(User.role == UserRole.EMPLOYEE))
    employees = users_result.scalars().all()
    
    # Get acknowledged users
    ack_users_result = await db.execute(
        select(User)
        .join(notification_acknowledgments)
        .where(notification_acknowledgments.c.notification_id == notification_id)
    )
    acknowledged_users = ack_users_result.scalars().all()
    acknowledged_ids = {u.id for u in acknowledged_users}
    
    pending_users = [u for u in employees if u.id not in acknowledged_ids]
    
    return {
        "notification_id": notification_id,
        "total_users": len(employees),
        "acknowledged_count": len(acknowledged_users),
        "acknowledged_users": acknowledged_users,
        "pending_users": pending_users
    }
