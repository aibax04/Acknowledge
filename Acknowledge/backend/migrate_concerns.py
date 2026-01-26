"""
Database migration to add concern notifications and acknowledgments

Run this after updating the models
"""

from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://"))

# SQL to create the new tables
migration_sql = """
-- Create concern_notified_users table
CREATE TABLE IF NOT EXISTS concern_notified_users (
    concern_id INTEGER NOT NULL REFERENCES concerns(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (concern_id, user_id)
);

-- Create concern_acknowledgments table  
CREATE TABLE IF NOT EXISTS concern_acknowledgments (
    concern_id INTEGER NOT NULL REFERENCES concerns(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    acknowledged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (concern_id, user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_concern_notified_users_concern ON concern_notified_users(concern_id);
CREATE INDEX IF NOT EXISTS idx_concern_notified_users_user ON concern_notified_users(user_id);
CREATE INDEX IF NOT EXISTS idx_concern_acknowledgments_concern ON concern_acknowledgments(concern_id);
CREATE INDEX IF NOT EXISTS idx_concern_acknowledgments_user ON concern_acknowledgments(user_id);
"""

if __name__ == "__main__":
    print("Running concern notifications migration...")
    try:
        with engine.connect() as conn:
            conn.execute(text(migration_sql))
            conn.commit()
        print("✅ Migration completed successfully!")
    except Exception as e:
        print(f"❌ Migration failed: {e}")
