from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_
from typing import List, Optional
from app.database import get_db
from app.models.activity_log import ActivityLog
from app.models.user import User, UserRole
from app.routes.auth import get_current_user

router = APIRouter(prefix="/activity-logs", tags=["activity-logs"])


def _serialize(log: ActivityLog) -> dict:
    return {
        "id": log.id,
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "actor_id": log.actor_id,
        "actor_name": log.actor_name,
        "action": log.action,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "entity_name": log.entity_name,
        "target_id": log.target_id,
        "target_name": log.target_name,
        "description": log.description,
    }


@router.get("/")
async def get_all_activity_logs(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """All activity logs — senior (director) only."""
    from fastapi import HTTPException
    if current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="Only directors can view all activity logs")

    result = await db.execute(
        select(ActivityLog)
        .order_by(ActivityLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    logs = result.scalars().all()
    return [_serialize(log) for log in logs]


@router.get("/mine")
async def get_my_activity_logs(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Logs where the current user is the actor or the target."""
    result = await db.execute(
        select(ActivityLog)
        .filter(
            or_(
                ActivityLog.actor_id == current_user.id,
                ActivityLog.target_id == current_user.id,
            )
        )
        .order_by(ActivityLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    logs = result.scalars().all()
    return [_serialize(log) for log in logs]
