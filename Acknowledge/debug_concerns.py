import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.models.user import UserRole
import enum

print(f"UserRole.MANAGER type: {type(UserRole.MANAGER)}")
print(f"UserRole.MANAGER value: {UserRole.MANAGER}")
print(f"Comparison 'manager' == UserRole.MANAGER: {'manager' == UserRole.MANAGER}")

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:postflow@db:5432/Acknowledge_db')
    async with engine.connect() as conn:
        print("\n--- Concerns ---")
        res = await conn.execute(text("SELECT id, subject, status, raised_by_id FROM concerns"))
        for row in res.all():
            print(row)
            
        print("\n--- Users ---")
        res = await conn.execute(text("SELECT id, full_name, role FROM users"))
        for row in res.all():
            print(row)

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
