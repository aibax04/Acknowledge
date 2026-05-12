from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.user import User
from app.schemas.user_schema import UserCreate
from app.utils.hashing import get_password_hash, verify_password

async def get_user_by_email(db: AsyncSession, email: str):
    result = await db.execute(select(User).filter(User.email == email))
    return result.scalars().first()

async def create_user(db: AsyncSession, user: UserCreate):
    from app.models.user import UserRole
    hashed_password = get_password_hash(user.password)
    # Default all new signups to pending approval
    is_pending = True
    db_user = User(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
        role=user.role,
        is_pending_approval=is_pending,
        position=user.position,
        department=user.department,
        phone=user.phone,
        emergency_contact_name=user.emergency_contact_name,
        emergency_contact_number=user.emergency_contact_number,
        address=user.address,
        office=user.office,
        joining_date=user.joining_date
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

async def authenticate_user(db: AsyncSession, email: str, password: str):
    user = await get_user_by_email(db, email)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user
