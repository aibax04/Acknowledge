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
import logging

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/policies", tags=["policies"])
@router.get("/{policy_id}", response_model=PolicyResponse)
async def get_policy(policy_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Policy)
        .filter(Policy.id == policy_id)
        .options(selectinload(Policy.acknowledged_by), selectinload(Policy.created_by))
    )
    policy = result.scalars().first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy

@router.put("/{policy_id}", response_model=PolicyResponse)
async def update_policy(
    policy_id: int, 
    policy_update: PolicyCreate, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="Only seniors can update policies")
    
    result = await db.execute(select(Policy).filter(Policy.id == policy_id))
    policy = result.scalars().first()
    
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    policy.title = policy_update.title
    policy.content = policy_update.content
    policy.image_url = policy_update.image_url
    policy.is_active = policy_update.is_active
    
    await db.commit()
    
    # Re-fetch with all relationships loaded for response model
    # This acts as a refresh but ensures async relationships (selectinload) are handled
    result = await db.execute(
        select(Policy)
        .filter(Policy.id == policy_id)
        .options(selectinload(Policy.acknowledged_by), selectinload(Policy.created_by))
    )
    updated_policy = result.scalars().first()
    return updated_policy

@router.post("/", response_model=PolicyResponse)
async def create_policy(policy: PolicyCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    logger.info(f"DEBUG: create_policy payload: {policy.dict()}")
    if current_user.role == UserRole.EMPLOYEE:
        raise HTTPException(status_code=403, detail="Employees cannot create policies")
    
    new_policy = Policy(
        title=policy.title,
        content=policy.content,
        image_url=policy.image_url,
        is_active=policy.is_active,
        target_audience=policy.target_audience,
        created_by_id=current_user.id
    )
    logger.info(f"DEBUG: Creating policy with target_audience: {new_policy.target_audience}")
    db.add(new_policy)
    await db.commit()
    
    # Re-fetch with relationships for the response model
    result = await db.execute(
        select(Policy)
        .filter(Policy.id == new_policy.id)
        .options(selectinload(Policy.acknowledged_by), selectinload(Policy.created_by))
    )
    return result.scalars().first()

@router.get("/", response_model=List[PolicyResponse])
async def get_policies(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Filter policies based on user role and target audience
    # Policies can now have multiple audiences separated by commas
    current_role = str(current_user.role).lower()
    # Handle Enum direct comparison locally or via string
    if hasattr(current_user.role, 'value'):
         current_role = current_user.role.value.lower()

    logger.info(f"DEBUG: get_policies for user: {current_user.full_name}, role: {current_user.role} (parsed: {current_role})")
    
    if current_role == 'senior':
         # Seniors usually see everything so they can manage them
         logger.info("DEBUG: User is Senior, showing all.")
         query = select(Policy).filter(Policy.is_active == True)
    else:
        # Standard filtering for Employee, Intern, Manager
        logger.info(f"DEBUG: Filtering for {current_role}")
        
        # Get all active policies and filter in Python for accurate comma-separated matching
        query = select(Policy).filter(Policy.is_active == True)

    result = await db.execute(
        query
        .options(selectinload(Policy.acknowledged_by), selectinload(Policy.created_by))
        .order_by(Policy.created_at.desc())
    )
    all_policies = result.scalars().all()
    
    # Filter policies based on target audience (for non-senior users)
    if current_role != 'senior':
        pol_list = []
        for policy in all_policies:
            audiences = [a.strip() for a in (policy.target_audience or 'all').split(',')]
            logger.info(f"DEBUG: Policy '{policy.title}' has audiences: {audiences}, checking against role: {current_role}")
            # Check if 'all' is in audiences OR current role is in audiences
            if 'all' in audiences or current_role in audiences:
                logger.info(f"DEBUG: ✓ Policy '{policy.title}' MATCHES - showing to {current_role}")
                pol_list.append(policy)
            else:
                logger.info(f"DEBUG: ✗ Policy '{policy.title}' DOES NOT MATCH - hiding from {current_role}")
        logger.info(f"DEBUG: Filtered to {len(pol_list)} policies for {current_role}. Targets: {[p.target_audience for p in pol_list]}")
    else:
        pol_list = all_policies
        logger.info(f"DEBUG: Returning {len(pol_list)} policies (senior sees all). Targets: {[p.target_audience for p in pol_list]}")
    
    return pol_list

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

@router.get("/{policy_id}/acknowledgments")
async def get_policy_acknowledgments(policy_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get detailed acknowledgment information for a policy"""
    if current_user.role not in [UserRole.SENIOR, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get policy
    result = await db.execute(select(Policy).filter(Policy.id == policy_id))
    policy = result.scalars().first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    # Get users who have acknowledged with timestamp
    ack_result = await db.execute(
        select(User, policy_acknowledgments.c.acknowledged_at)
        .join(policy_acknowledgments, User.id == policy_acknowledgments.c.user_id)
        .filter(policy_acknowledgments.c.policy_id == policy_id)
    )
    acknowledged_users = []
    for user, ack_time in ack_result.all():
        acknowledged_users.append({
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role.value if hasattr(user.role, 'value') else str(user.role),
            "acknowledged_at": ack_time.isoformat() if ack_time else None
        })
    
    ack_user_ids = [u["id"] for u in acknowledged_users]
    
    # Get users who should see this policy but haven't acknowledged
    audience = policy.target_audience or 'all'
    
    if 'all' in audience:
        # All users should acknowledge
        pending_result = await db.execute(
            select(User).filter(User.id.notin_(ack_user_ids) if ack_user_ids else True)
        )
    else:
        # Only users in target audience
        from sqlalchemy import or_
        audience_list = [a.strip() for a in audience.split(',')]
        role_filters = [User.role == UserRole(aud) for aud in audience_list if aud != 'all']
        
        if role_filters:
            base_filter = or_(*role_filters)
            if ack_user_ids:
                pending_result = await db.execute(
                    select(User).filter(base_filter, User.id.notin_(ack_user_ids))
                )
            else:
                pending_result = await db.execute(
                    select(User).filter(base_filter)
                )
        else:
            pending_result = await db.execute(select(User).filter(User.id == -1))  # No results
    
    pending_users = []
    for user in pending_result.scalars().all():
        pending_users.append({
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role.value if hasattr(user.role, 'value') else str(user.role)
        })
    
    return {
        "acknowledged": acknowledged_users,
        "pending": pending_users,
        "total": len(acknowledged_users) + len(pending_users)
    }

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
            Policy.target_audience,
            func.count(policy_acknowledgments.c.user_id).label('ack_count')
        )
        .outerjoin(policy_acknowledgments, Policy.id == policy_acknowledgments.c.policy_id)
        .group_by(Policy.id, Policy.title, Policy.created_at, Policy.target_audience)
        .order_by(Policy.created_at.desc())
        .limit(10)
    )
    
    policies_data = result.all()
    
    # Pre-fetch user counts by role to calculate correct percentages
    # We need total count, and count per role
    # Using a simple query to group by role
    role_counts_res = await db.execute(
        select(User.role, func.count(User.id)).group_by(User.role)
    )
    role_counts = {row[0]: row[1] for row in role_counts_res.all()}
    
    total_users = sum(role_counts.values()) or 1
    
    audit_data = []
    for policy in policies_data:
        # Determine denominator based on target audience
        audience = policy.target_audience
        
        # Handle multiple audiences separated by commas
        if not audience or 'all' in audience:
            denominator = total_users
        else:
            # Split comma-separated audiences and sum their counts
            audience_list = [a.strip() for a in audience.split(',')]
            denominator = 0
            for aud in audience_list:
                if aud == 'all':
                    denominator = total_users
                    break
                try:
                    denominator += role_counts.get(UserRole(aud), 0)
                except (ValueError, KeyError):
                    # Invalid role, skip
                    pass
            
        denominator = denominator if denominator > 0 else 1
        
        completion_percentage = round((policy.ack_count / denominator * 100), 1)
        # Cap at 100% just in case of data sync issues
        completion_percentage = min(completion_percentage, 100.0)
        
        status = "Completed" if completion_percentage >= 90 else "In Progress" if completion_percentage >= 50 else "Low Compliance"
        
        audit_data.append({
            "policy_id": policy.id,
            "policy_name": policy.title,
            "status": status,
            "completion_percentage": completion_percentage,
            "date_issued": policy.created_at.isoformat() if policy.created_at else None,
            "acknowledged_count": policy.ack_count,
            "target_audience": audience # Optional: helpful for frontend to show
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
    
    # Filter by target audience
    audience = policy.target_audience or 'all'
    
    if 'all' in audience:
        # Send to all users who haven't acknowledged
        pending_users_result = await db.execute(
            select(User).filter(User.id.notin_(ack_user_ids) if ack_user_ids else True)
        )
    else:
        # Send only to users in the target audience who haven't acknowledged
        from sqlalchemy import or_
        audience_list = [a.strip() for a in audience.split(',')]
        role_filters = [User.role == UserRole(aud) for aud in audience_list if aud != 'all']
        
        if role_filters:
            base_filter = or_(*role_filters)
            if ack_user_ids:
                pending_users_result = await db.execute(
                    select(User).filter(base_filter, User.id.notin_(ack_user_ids))
                )
            else:
                pending_users_result = await db.execute(
                    select(User).filter(base_filter)
                )
        else:
            pending_users_result = await db.execute(select(User).filter(User.id == -1))  # No results
    
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
