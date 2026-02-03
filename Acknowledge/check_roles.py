import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:postflow@db:5432/Acknowledge_db')
    async with engine.connect() as conn:
        print("\n--- User Roles Count ---")
        res = await conn.execute(text("SELECT role, count(*) FROM users GROUP BY role"))
        for row in res.all():
            print(f"Role: {row[0]}, Count: {row[1]}")
            
        print("\n--- All Users ---")
        res = await conn.execute(text("SELECT id, full_name, role FROM users"))
        for row in res.all():
            print(f"User: {row[1]}, Role: {row[2]}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
