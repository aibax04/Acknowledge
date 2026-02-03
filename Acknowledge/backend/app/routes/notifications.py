from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func, insert
from typing import List
from app.database import get_db
from app.models.notification import Notification, notification_acknowledgments, notification_recipients
from app.models.user import User, UserRole
from app.schemas.notification_schema import NotificationCreate, NotificationResponse, NotificationStatus
from app.routes.auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.post("/", response_model=NotificationResponse)
async def create_notification(notification: NotificationCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.MANAGER, UserRole.SENIOR]:
        raise HTTPException(status_code=403, detail="Only managers and seniors can create notifications")
    
    # Enforce logic: If type is TARGETED, must have recipients
    if notification.notification_type == "TARGETED" and not notification.recipient_ids:
        raise HTTPException(status_code=400, detail="Targeted notifications must have recipients")

    # If BROADCAST, force recipients to be empty (or ignore them)
    if notification.notification_type == "BROADCAST":
        notification.recipient_ids = []

    # Create notification object
    new_notif = Notification(
        title=notification.title,
        content=notification.content,
        created_by_id=current_user.id,
        notification_type=notification.notification_type
    )
    db.add(new_notif)
    # Flush to get the ID, but do not commit yet
    await db.flush()

    # Add recipients if provided
    print(f"DEBUG: create_notification ({notification.notification_type}) payload recipient_ids: {notification.recipient_ids}")
    
    if notification.notification_type == "TARGETED" and notification.recipient_ids:
        # Check if users actually exist first to validate
        result = await db.execute(select(User.id).where(User.id.in_(notification.recipient_ids)))
        valid_user_ids = [r for r in result.scalars().all()]
        
        print(f"DEBUG: Found valid user IDs: {valid_user_ids}")
        
        if not valid_user_ids:
             await db.rollback()
             raise HTTPException(status_code=400, detail="No valid recipients found for targeted notification.")

        try:
            for user_id in valid_user_ids:
                await db.execute(
                    insert(notification_recipients).values(
                        notification_id=new_notif.id,
                        user_id=user_id
                    )
                )
            await db.commit()
            print("DEBUG: Committed recipients via manual INSERT")
        except Exception as e:
            await db.rollback()
            print(f"DEBUG: Error inserting recipients: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to save recipients: {str(e)}")
    else:
        # Commit broadcast
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
    # Fetch notifications: 
    # 1. Created by me (so I can see what I sent)
    # 2. Targeted to me (I am in recipients)
    # 3. Broadcast (no recipients) - ASSUMPTION: if no recipients => broadcast
    
    # This query is complex with relationships, simplify by fetching relevant IDs first or using python logic
    # For MVP/Simplicity: Fetch all, then filter. Or join.
    # Let's try to do it in SQL.
    
    # We need to eager load recipients to check if it's broadcast
    query = (
        select(Notification)
        .options(selectinload(Notification.created_by), selectinload(Notification.recipients))
        .order_by(Notification.created_at.desc())
    )
    
    result = await db.execute(query)
    all_notifications = result.scalars().all()
    
    filtered_notifications = []
    
    for notif in all_notifications:
        is_creator = notif.created_by_id == current_user.id
        is_recipient = any(u.id == current_user.id for u in notif.recipients)
        is_broadcast = len(notif.recipients) == 0
        
        # Managers/Seniors see what they created
        if is_creator:
            filtered_notifications.append(notif)
            continue
            
        # Everyone sees broadcast or if they are recipient
        if is_broadcast or is_recipient:
            filtered_notifications.append(notif)

    # Check acknowledgments
    response = []
    for notif in filtered_notifications:
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
    result = await db.execute(
        select(Notification)
        .filter(Notification.id == notification_id)
        .options(selectinload(Notification.recipients))
    )
    notif = result.scalars().first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Determine target audience
    target_users = []
    if len(notif.recipients) > 0:
        # Targeted notification
        target_users = notif.recipients
    else:
        # Broadcast notification: include all roles (employees, interns, managers, seniors)
        # so that when a manager sends "Notify Everyone", other managers (and seniors) appear in status too
        users_result = await db.execute(select(User).filter(User.role.in_([UserRole.EMPLOYEE, UserRole.INTERN, UserRole.MANAGER, UserRole.SENIOR])))
        target_users = users_result.scalars().all()
    
    # Get acknowledged users
    ack_users_result = await db.execute(
        select(User)
        .join(notification_acknowledgments)
        .where(notification_acknowledgments.c.notification_id == notification_id)
    )
    acknowledged_users = ack_users_result.scalars().all()
    acknowledged_ids = {u.id for u in acknowledged_users}
    
    pending_users = [u for u in target_users if u.id not in acknowledged_ids]
    
    return {
        "notification_id": notification_id,
        "total_users": len(target_users),
        "acknowledged_count": len(acknowledged_users),
        "acknowledged_users": acknowledged_users,
        "pending_users": pending_users
    }

@router.delete("/{notification_id}")
async def delete_notification(notification_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete a notification - only creator or senior can delete"""
    # Find notification
    result = await db.execute(select(Notification).filter(Notification.id == notification_id))
    notif = result.scalars().first()
    
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Permission check: Only creator or senior can delete
    if notif.created_by_id != current_user.id and current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="Only the creator or senior can delete this notification")
    
    # Delete acknowledgments first (foreign key constraint)
    await db.execute(
        notification_acknowledgments.delete().where(
            notification_acknowledgments.c.notification_id == notification_id
        )
    )
    
    # Delete notification
    await db.delete(notif)
    await db.commit()
    
    return {"message": "Notification deleted successfully"}
