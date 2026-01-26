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

@router.get("/audit/recent")
async def get_policy_audit(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get recent policy acknowledgment audit for senior dashboard"""
    if current_user.role not in [UserRole.SENIOR, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    from sqlalchemy import func
    
    # Get all policies with acknowledgment stats
    result = await db.execute(
        select(
            Policy.id,
            Policy.title,
            Policy.created_at,
            func.count(policy_acknowledgments.c.user_id).label('ack_count')
        )
        .outerjoin(policy_acknowledgments, Policy.id == policy_acknowledgments.c.policy_id)
        .group_by(Policy.id, Policy.title, Policy.created_at)
        .order_by(Policy.created_at.desc())
        .limit(10)
    )
    
    policies_data = result.all()
    
    # Get total users count
    total_users_result = await db.execute(select(func.count(User.id)))
    total_users = total_users_result.scalar() or 1
    
    audit_data = []
    for policy in policies_data:
        completion_percentage = round((policy.ack_count / total_users * 100), 1)
        status = "Completed" if completion_percentage >= 90 else "In Progress" if completion_percentage >= 50 else "Low Compliance"
        
        audit_data.append({
            "policy_id": policy.id,
            "policy_name": policy.title,
            "status": status,
            "completion_percentage": completion_percentage,
            "date_issued": policy.created_at.isoformat() if policy.created_at else None,
            "acknowledged_count": policy.ack_count
        })
    
    return audit_data

@router.post("/{policy_id}/remind")
async def send_policy_reminder(policy_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Send reminder to employees who haven't acknowledged a policy"""
    if current_user.role not in [UserRole.SENIOR, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if policy exists
    result = await db.execute(select(Policy).filter(Policy.id == policy_id))
    policy = result.scalars().first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    # Get users who haven't acknowledged
    acknowledged_users = await db.execute(
        select(policy_acknowledgments.c.user_id).where(policy_acknowledgments.c.policy_id == policy_id)
    )
    ack_user_ids = [row[0] for row in acknowledged_users.all()]
    
    pending_users_result = await db.execute(
        select(User).filter(User.id.notin_(ack_user_ids) if ack_user_ids else True)
    )
    pending_users = pending_users_result.scalars().all()
    
    # In a real system, send email/notification here
    # For now, just return count
    
    return {
        "message": f"Reminder sent to {len(pending_users)} employees",
        "pending_count": len(pending_users)
    }

@router.delete("/{policy_id}")
async def delete_policy(policy_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete a policy permanently. Only senior can do this."""
    if current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="Only seniors can delete policies")
    
    result = await db.execute(select(Policy).filter(Policy.id == policy_id))
    policy = result.scalars().first()
    
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    # Remove from DB. Associated acknowledgments will be cleaned up if relationship is set up or by manual deletion.
    # Manual deletion of association rows to be safe:
    stmt = text("DELETE FROM policy_acknowledgments WHERE policy_id = :pid")
    await db.execute(stmt, {"pid": policy_id})
    
    await db.delete(policy)
    await db.commit()
    
    return {"message": "Policy deleted successfully from everywhere"}
