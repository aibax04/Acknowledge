from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import or_
from typing import List
from app.database import get_db
from app.models.venture import Venture, venture_members
from app.models.user import User, UserRole
from app.models.task import Task
from app.schemas.venture_schema import (
    VentureCreate, VentureUpdate, VentureResponse,
    VentureDetailResponse, VentureMemberAdd, VentureMemberRemove
)
from app.routes.auth import get_current_user

router = APIRouter(prefix="/ventures", tags=["ventures"])

def require_manager_or_senior(current_user: User):
    """Helper to check if user is manager or senior"""
    if current_user.role not in [UserRole.MANAGER, UserRole.SENIOR]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Only managers and seniors can perform this action"
        )

@router.post("/", response_model=VentureResponse, status_code=status.HTTP_201_CREATED)
async def create_venture(
    venture: VentureCreate, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Create a new venture (manager/senior only)"""
    require_manager_or_senior(current_user)
    
    new_venture = Venture(
        name=venture.name,
        description=venture.description,
        created_by=current_user.id
    )
    db.add(new_venture)
    await db.commit()
    await db.refresh(new_venture)
    return new_venture

@router.get("/", response_model=List[VentureResponse])
async def list_ventures(
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """List all ventures"""
    query = select(Venture).order_by(Venture.created_at.desc())
    
    if current_user.role == UserRole.MANAGER:
        # Managers see ventures they created OR are members of
        from sqlalchemy import or_
        from app.models.venture import venture_members
        query = query.outerjoin(venture_members).filter(
            or_(
                Venture.created_by == current_user.id,
                venture_members.c.user_id == current_user.id
            )
        ).distinct()
    elif current_user.role in [UserRole.EMPLOYEE, UserRole.INTERN]:
        # Employees/Interns should usually use /my-ventures, but if they hit this, show only membership
        from app.models.venture import venture_members
        query = query.join(venture_members).filter(venture_members.c.user_id == current_user.id)

    result = await db.execute(query)
    ventures = result.scalars().unique().all()
    return ventures

@router.get("/my-ventures", response_model=List[VentureDetailResponse])
async def get_my_ventures(
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Get ventures the current user is a member of"""
    result = await db.execute(
        select(Venture)
        .options(selectinload(Venture.members), selectinload(Venture.creator))
        .join(venture_members)
        .filter(venture_members.c.user_id == current_user.id)
        .order_by(Venture.created_at.desc())
    )
    ventures = result.scalars().all()
    return ventures


@router.get("/kanban")
async def get_kanban(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get ventures (teams) the user belongs to with tasks for Kanban. Each venture includes members and creator; tasks include assignee and created_by (who assigned)."""
    # Same visibility as list: employee/intern = member only; manager = created or member; senior = all
    query = select(Venture).options(
        selectinload(Venture.members),
        selectinload(Venture.creator)
    ).order_by(Venture.created_at.desc())
    if current_user.role in [UserRole.EMPLOYEE, UserRole.INTERN]:
        query = query.join(venture_members).filter(venture_members.c.user_id == current_user.id)
    elif current_user.role == UserRole.MANAGER:
        query = query.outerjoin(venture_members).filter(
            or_(
                Venture.created_by == current_user.id,
                venture_members.c.user_id == current_user.id
            )
        ).distinct()
    # SENIOR: no filter, see all ventures
    result = await db.execute(query)
    ventures = result.unique().scalars().all()
    out = []
    for v in ventures:
        tasks_result = await db.execute(
            select(Task)
            .options(
                selectinload(Task.assigned_to),
                selectinload(Task.created_by)
            )
            .filter(Task.venture_id == v.id)
            .order_by(Task.created_at.desc())
        )
        tasks = tasks_result.scalars().all()
        creator = v.creator
        members = v.members or []
        out.append({
            "venture": {
                "id": v.id,
                "name": v.name,
                "description": v.description or "",
                "creator": {"id": creator.id, "full_name": creator.full_name or creator.email or "Unknown"} if creator else None,
                "members": [{"id": m.id, "full_name": m.full_name or m.email or "Unknown", "role": m.role.value} for m in members],
            },
            "tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "description": t.description or "",
                    "status": t.status.value,
                    "priority": t.priority.value if t.priority else "medium",
                    "deadline": t.deadline.isoformat() if t.deadline else None,
                    "assigned_to": {"id": t.assigned_to.id, "full_name": t.assigned_to.full_name or t.assigned_to.email or "Unknown"} if t.assigned_to else None,
                    "created_by": {"id": t.created_by.id, "full_name": t.created_by.full_name or t.created_by.email or "Unknown"} if t.created_by else None,
                }
                for t in tasks
            ],
        })
    return out

@router.get("/{venture_id}", response_model=VentureDetailResponse)
async def get_venture(
    venture_id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Get a specific venture with its members"""
    result = await db.execute(
        select(Venture)
        .options(selectinload(Venture.members), selectinload(Venture.creator))
        .filter(Venture.id == venture_id)
    )
    venture = result.scalars().first()
    
    if not venture:
        raise HTTPException(status_code=404, detail="Venture not found")
    
    return venture

@router.put("/{venture_id}", response_model=VentureResponse)
async def update_venture(
    venture_id: int, 
    venture_update: VentureUpdate, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Update a venture (manager/senior only)"""
    require_manager_or_senior(current_user)
    
    result = await db.execute(select(Venture).filter(Venture.id == venture_id))
    venture = result.scalars().first()
    
    if not venture:
        raise HTTPException(status_code=404, detail="Venture not found")
    
    # Only creator or senior can update
    if venture.created_by != current_user.id and current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="You can only update ventures you created")
    
    if venture_update.name is not None:
        venture.name = venture_update.name
    if venture_update.description is not None:
        venture.description = venture_update.description
    
    await db.commit()
    await db.refresh(venture)
    return venture

@router.delete("/{venture_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_venture(
    venture_id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Delete a venture (manager/senior only)"""
    require_manager_or_senior(current_user)
    
    result = await db.execute(select(Venture).filter(Venture.id == venture_id))
    venture = result.scalars().first()
    
    if not venture:
        raise HTTPException(status_code=404, detail="Venture not found")
    
    # Relaxed: Any manager or senior who has access to the route can delete any venture
    # if venture.created_by != current_user.id and current_user.role != UserRole.SENIOR:
    #     raise HTTPException(status_code=403, detail="You can only delete ventures you created")
    
    # Handle associated tasks: remove venture reference
    from app.models.task import Task
    from sqlalchemy import update
    await db.execute(
        update(Task)
        .where(Task.venture_id == venture_id)
        .values(venture_id=None)
    )
    
    # Handle associated concerns: remove venture reference
    from app.models.concern import Concern
    await db.execute(
        update(Concern)
        .where(Concern.venture_id == venture_id)
        .values(venture_id=None)
    )
    
    await db.delete(venture)
    await db.commit()
    return None

@router.post("/{venture_id}/members", response_model=VentureDetailResponse)
async def add_members(
    venture_id: int, 
    member_data: VentureMemberAdd, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Add members to a venture (manager/senior only)"""
    require_manager_or_senior(current_user)
    
    result = await db.execute(
        select(Venture)
        .options(selectinload(Venture.members), selectinload(Venture.creator))
        .filter(Venture.id == venture_id)
    )
    venture = result.scalars().first()
    
    if not venture:
        raise HTTPException(status_code=404, detail="Venture not found")
    
    # Fetch the users to add
    users_result = await db.execute(select(User).filter(User.id.in_(member_data.user_ids)))
    users_to_add = users_result.scalars().all()
    
    if not users_to_add:
        raise HTTPException(status_code=400, detail="No valid users found")
    
    # Get existing member IDs
    existing_member_ids = {m.id for m in venture.members}
    
    # Add only new members
    for user in users_to_add:
        if user.id not in existing_member_ids:
            venture.members.append(user)
    
    await db.commit()
    await db.refresh(venture)
    return venture

@router.delete("/{venture_id}/members/{user_id}", response_model=VentureDetailResponse)
async def remove_member(
    venture_id: int, 
    user_id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Remove a member from a venture (manager/senior only)"""
    require_manager_or_senior(current_user)
    
    result = await db.execute(
        select(Venture)
        .options(selectinload(Venture.members), selectinload(Venture.creator))
        .filter(Venture.id == venture_id)
    )
    venture = result.scalars().first()
    
    if not venture:
        raise HTTPException(status_code=404, detail="Venture not found")
    
    # Find and remove the user
    user_to_remove = None
    for member in venture.members:
        if member.id == user_id:
            user_to_remove = member
            break
    
    if not user_to_remove:
        raise HTTPException(status_code=404, detail="User is not a member of this venture")
    
    venture.members.remove(user_to_remove)
    await db.commit()
    await db.refresh(venture)
    return venture

@router.get("/{venture_id}/available-users", response_model=List)
async def get_available_users(
    venture_id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Get users who are not members of this venture (for adding)"""
    require_manager_or_senior(current_user)
    
    result = await db.execute(
        select(Venture)
        .options(selectinload(Venture.members))
        .filter(Venture.id == venture_id)
    )
    venture = result.scalars().first()
    
    if not venture:
        raise HTTPException(status_code=404, detail="Venture not found")
    
    # Get IDs of current members
    member_ids = {m.id for m in venture.members}
    
    # Get all users not in this venture
    all_users_result = await db.execute(select(User))
    all_users = all_users_result.scalars().all()
    
    available_users = [
        {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role.value}
        for u in all_users if u.id not in member_ids
    ]
    
    return available_users
