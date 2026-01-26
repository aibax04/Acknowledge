from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import insert, text
from sqlalchemy.orm import selectinload
from typing import List
from app.database import get_db
from app.models.policy import Policy, policy_acknowledgments
from app.models.user import User, UserRole
from app.schemas.policy_schema import PolicyCreate, PolicyResponse
from app.routes.auth import get_current_user

router = APIRouter(prefix="/policies", tags=["policies"])

@router.post("/", response_model=PolicyResponse)
async def create_policy(policy: PolicyCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.EMPLOYEE:
        raise HTTPException(status_code=403, detail="Employees cannot create policies")
        
    new_policy = Policy(**policy.model_dump())
    db.add(new_policy)
    await db.commit()
    
    # Re-fetch with relationships for the response model
    result = await db.execute(
        select(Policy)
        .filter(Policy.id == new_policy.id)
        .options(selectinload(Policy.acknowledged_by))
    )
    return result.scalars().first()

@router.get("/", response_model=List[PolicyResponse])
async def get_policies(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Everyone sees active policies
    result = await db.execute(
        select(Policy)
        .filter(Policy.is_active == True)
        .options(selectinload(Policy.acknowledged_by))
    )
    return result.scalars().all()

@router.post("/{policy_id}/acknowledge")
async def acknowledge_policy(policy_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check if policy exists
    result = await db.execute(select(Policy).filter(Policy.id == policy_id))
    policy = result.scalars().first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
        
    # Check if already acknowledged using direct SQL or table object
    # Using text for simplicity in async check or just try insert and catch violation?
    # Better to check.
    stmt = select(policy_acknowledgments.c.policy_id).where(
        (policy_acknowledgments.c.user_id == current_user.id) & 
        (policy_acknowledgments.c.policy_id == policy_id)
    )
    existing = await db.execute(stmt)
    if existing.first():
         return {"message": "Already acknowledged"}

    # Add acknowledgment
    stmt = insert(policy_acknowledgments).values(user_id=current_user.id, policy_id=policy_id)
    await db.execute(stmt)
    await db.commit()
    
    return {"message": "Acknowledged"}
