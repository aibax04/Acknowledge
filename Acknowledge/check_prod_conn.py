import asyncio
import asyncpg

# Credentials (match backend/.env for production)
DB_USER = "postgres"
DB_PASS = "Vh0quFWyPfwLfvbk"
DB_HOST = "13.204.3.107"
DB_PORT = "5432"
DB_NAME = "postgres" # Try default DB first

async def main():
    dsn = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    print(f"Connecting to {dsn}...")
    try:
        conn = await asyncpg.connect(dsn)
        print("Success! Connected.")
        await conn.close()
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
