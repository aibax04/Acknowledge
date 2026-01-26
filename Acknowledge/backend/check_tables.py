"""
Check if concern notification tables exist
"""

from sqlalchemy import create_engine, inspect
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://"))

inspector = inspect(engine)
tables = inspector.get_table_names()

print("Existing tables:")
for table in sorted(tables):
    print(f"  - {table}")

required_tables = ['concern_notified_users', 'concern_acknowledgments']
print("\nChecking for new concern tables:")
for table in required_tables:
    if table in tables:
        print(f"  ✅ {table} exists")
    else:
        print(f"  ❌ {table} MISSING - Server needs restart!")
