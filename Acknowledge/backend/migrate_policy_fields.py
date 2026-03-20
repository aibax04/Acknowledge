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
        # Add allowed_on_probation column to custom_leave_policies
        try:
            await conn.execute(text("""
                ALTER TABLE custom_leave_policies
                ADD COLUMN IF NOT EXISTS allowed_on_probation BOOLEAN DEFAULT TRUE;
            """))
            print("Migration successful: allowed_on_probation added to custom_leave_policies.")
        except Exception as e:
            print(f"Migration failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
