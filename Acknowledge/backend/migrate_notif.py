import asyncio
import os
import sys
from sqlalchemy import text

sys.path.append(os.getcwd())

try:
    from app.database import engine
except Exception as e:
    print(f"Error importing engine: {e}")
    sys.exit(1)

async def migrate():
    async with engine.begin() as conn:
        try:
            print("Creating notification_recipients table...")
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS notification_recipients (
                    notification_id INTEGER REFERENCES notifications(id),
                    user_id INTEGER REFERENCES users(id),
                    PRIMARY KEY (notification_id, user_id)
                );
            """))
            print("Migration successful: notification_recipients created.")
        except Exception as e:
            print(f"Migration failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
