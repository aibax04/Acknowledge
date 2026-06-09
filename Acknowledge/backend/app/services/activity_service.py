from sqlalchemy.ext.asyncio import AsyncSession


async def log_activity(
    db: AsyncSession,
    actor,
    action: str,
    entity_type: str,
    entity_id,
    entity_name: str,
    description: str,
    target=None,
):
    """Add an activity log entry. Caller is responsible for committing the session."""
    try:
        from app.models.activity_log import ActivityLog
        entry = ActivityLog(
            actor_id=actor.id,
            actor_name=actor.full_name or actor.email or str(actor.id),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            target_id=target.id if target else None,
            target_name=(target.full_name or target.email) if target else None,
            description=description,
        )
        db.add(entry)
    except Exception:
        pass  # Never let logging crash the main operation
