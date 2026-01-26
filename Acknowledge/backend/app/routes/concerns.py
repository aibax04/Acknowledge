from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List
from app.database import get_db
from app.models.concern import Concern, ConcernStatus
from app.models.user import User, UserRole
from app.schemas.concern_schema import ConcernCreate, ConcernResponse, ConcernUpdate
from app.routes.auth import get_current_user
from datetime import datetime

router = APIRouter(prefix="/concerns", tags=["concerns"])

@router.post("/", response_model=ConcernResponse)
async def create_concern(concern: ConcernCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_concern = Concern(
        subject=concern.subject,
        description=concern.description,
        raised_by_id=current_user.id
    )
    db.add(new_concern)
    await db.flush()  # Flush to get the ID
    
    # Add notified users using direct SQL insert for async compatibility
    if concern.notified_user_ids:
        from app.models.concern import concern_notified_users
        from sqlalchemy import insert
        
        for user_id in concern.notified_user_ids:
            # Verify user exists
            user_result = await db.execute(select(User).filter(User.id == user_id))
            user = user_result.scalars().first()
            if user:
                # Insert into association table
                await db.execute(
                    insert(concern_notified_users).values(
                        concern_id=new_concern.id,
                        user_id=user_id
                    )
                )
    
    await db.commit()
    
    # Re-fetch with relationships for the response model
    result = await db.execute(
        select(Concern)
        .filter(Concern.id == new_concern.id)
        .options(
            selectinload(Concern.raised_by),
            selectinload(Concern.notified_users),
            selectinload(Concern.acknowledged_by)
        )
    )
    return result.scalars().first()

@router.get("/", response_model=List[ConcernResponse])
async def get_concerns(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(Concern).options(
        selectinload(Concern.raised_by),
        selectinload(Concern.notified_users),
        selectinload(Concern.acknowledged_by)
    )
    
    if current_user.role == UserRole.EMPLOYEE:
        # Employees see concerns they raised OR concerns they were notified about
        from sqlalchemy import or_
        from app.models.concern import concern_notified_users
        query = query.outerjoin(concern_notified_users).filter(
            or_(
                Concern.raised_by_id == current_user.id,
                concern_notified_users.c.user_id == current_user.id
            )
        ).distinct()  # IMPORTANT: Prevent duplicates when multiple users are notified
    # Managers/Seniors see all concerns
    
    result = await db.execute(query)
    return result.scalars().unique().all()  # Use unique() to ensure no duplicates

@router.post("/{concern_id}/acknowledge")
async def acknowledge_concern(concern_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.concern import concern_acknowledgments
    from sqlalchemy import insert, and_
    
    # Check if concern exists
    result = await db.execute(select(Concern).filter(Concern.id == concern_id))
    concern = result.scalars().first()
    if not concern:
        raise HTTPException(status_code=404, detail="Concern not found")
    
    # Check if already acknowledged
    check_result = await db.execute(
        select(concern_acknowledgments).where(
            and_(
                concern_acknowledgments.c.concern_id == concern_id,
                concern_acknowledgments.c.user_id == current_user.id
            )
        )
    )
    if check_result.first():
        return {"message": "Already acknowledged"}
    
    # Add acknowledgment using direct SQL insert
    await db.execute(
        insert(concern_acknowledgments).values(
            concern_id=concern_id,
            user_id=current_user.id
        )
    )
    await db.commit()
    
    return {"message": "Acknowledged successfully"}

@router.put("/{concern_id}", response_model=ConcernResponse)
async def update_concern(concern_id: int, update: ConcernUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.EMPLOYEE:
        raise HTTPException(status_code=403, detail="Employees cannot update concern status")
        
    result = await db.execute(
        select(Concern)
        .filter(Concern.id == concern_id)
        .options(
            selectinload(Concern.raised_by),
            selectinload(Concern.notified_users),
            selectinload(Concern.acknowledged_by)
        )
    )
    concern = result.scalars().first()
    if not concern:
        raise HTTPException(status_code=404, detail="Concern not found")
    
    if update.status:
        concern.status = update.status
    if update.resolved_at:
        concern.resolved_at = update.resolved_at
    elif update.status == ConcernStatus.RESOLVED and not concern.resolved_at:
        concern.resolved_at = datetime.utcnow()
        
    await db.commit()
    
    # Re-fetch with relationships for the response model
    result = await db.execute(
        select(Concern)
        .filter(Concern.id == concern.id)
        .options(
            selectinload(Concern.raised_by),
            selectinload(Concern.notified_users),
            selectinload(Concern.acknowledged_by)
        )
    )
    return result.scalars().first()
