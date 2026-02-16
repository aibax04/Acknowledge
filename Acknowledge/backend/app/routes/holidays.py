from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.database import get_db
from app.models.user import User, UserRole
from app.models.holiday import Holiday
from app.routes.auth import get_current_user
from app.schemas.holiday_schema import HolidayCreate, HolidayResponse
from typing import List, Optional
from datetime import date

router = APIRouter(prefix="/holidays", tags=["holidays"])


@router.post("/", response_model=dict)
async def create_holiday(
    req: HolidayCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a holiday. Only managers and seniors can do this."""
    if current_user.role not in (UserRole.MANAGER, UserRole.SENIOR):
        raise HTTPException(status_code=403, detail="Only managers and directors can create holidays")

    if req.office not in ("eigen", "panscience", "both"):
        raise HTTPException(status_code=400, detail="Office must be 'eigen', 'panscience', or 'both'")

    # Check for duplicate
    result = await db.execute(
        select(Holiday).filter(
            Holiday.date == req.date,
            (Holiday.office == req.office) | (Holiday.office == "both") | (req.office == "both")
        )
    )
    existing = result.scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail=f"A holiday already exists on this date for {existing.office}")

    holiday = Holiday(
        title=req.title,
        date=req.date,
        office=req.office,
        created_by_id=current_user.id
    )
    db.add(holiday)
    await db.commit()
    await db.refresh(holiday)

    return {"message": "Holiday created successfully", "id": holiday.id}


@router.get("/")
async def get_holidays(
    year: Optional[int] = None,
    office: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all holidays. Optional filters for year and office."""
    query = select(Holiday)

    if year:
        from sqlalchemy import extract
        query = query.filter(extract('year', Holiday.date) == year)

    if office and office != "all":
        query = query.filter(
            (Holiday.office == office) | (Holiday.office == "both")
        )

    query = query.order_by(Holiday.date.asc())
    result = await db.execute(query)
    holidays = result.scalars().all()

    response = []
    for h in holidays:
        creator_result = await db.execute(select(User).filter(User.id == h.created_by_id))
        creator = creator_result.scalars().first()
        response.append({
            "id": h.id,
            "title": h.title,
            "date": h.date.isoformat(),
            "office": h.office,
            "created_by_id": h.created_by_id,
            "created_by_name": creator.full_name if creator else "Unknown",
            "created_at": h.created_at.isoformat() if h.created_at else None
        })

    return response


@router.delete("/{holiday_id}")
async def delete_holiday(
    holiday_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a holiday. Only managers and seniors can do this."""
    if current_user.role not in (UserRole.MANAGER, UserRole.SENIOR):
        raise HTTPException(status_code=403, detail="Only managers and directors can delete holidays")

    result = await db.execute(select(Holiday).filter(Holiday.id == holiday_id))
    holiday = result.scalars().first()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")

    await db.delete(holiday)
    await db.commit()
    return {"message": "Holiday deleted successfully"}
