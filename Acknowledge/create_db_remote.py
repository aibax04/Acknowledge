import asyncio
import asyncpg

DB_URL = "postgresql://postgres:oxmL3UT=@13.204.3.107:5432/postgres"

async def main():
    try:
        print("Connecting to remote postgres...")
        conn = await asyncpg.connect(DB_URL)
        
        try:
            print("Creating database 'Acknowledge_db'...")
            await conn.execute('CREATE DATABASE "Acknowledge_db"')
            print("Database created successfully.")
        except asyncpg.DuplicateDatabaseError:
            print("Database 'Acknowledge_db' already exists.")
        except Exception as e:
            print(f"Error creating DB: {e}")
            
        await conn.close()
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
