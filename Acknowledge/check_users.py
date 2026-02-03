import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    try:
        engine = create_async_engine('postgresql+asyncpg://postgres:postflow@db:5432/Acknowledge_db')
        async with engine.connect() as conn:
            res = await conn.execute(text('SELECT id, email, role FROM users'))
            print("Users in DB:")
            for row in res.all():
                print(row)
        await engine.dispose()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
