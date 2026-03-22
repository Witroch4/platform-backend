"""Bootstrap script: create databases if missing, run Alembic migrations.

Usage:
    python -m scripts.db_prepare
"""

import asyncio
import subprocess
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from platform_core.config import settings

# Databases managed by Alembic (platform + jusmonitoria)
# socialwise DB is managed by Prisma — we only connect, never migrate
MANAGED_DBS = {
    "platform": settings.platform_database_url,
    "jusmonitoria": settings.jusmonitoria_database_url,
}

# All databases to verify connectivity
ALL_DBS = {
    **MANAGED_DBS,
    "socialwise": settings.socialwise_database_url,
}


def _admin_url() -> str:
    """Build admin URL (connect to 'postgres' database) from platform URL."""
    url = str(settings.platform_database_url)
    # Replace the database name with 'postgres'
    parts = url.rsplit("/", 1)
    return f"{parts[0]}/postgres"


async def ensure_databases_exist() -> None:
    """Create databases if they don't exist (requires superuser on dev)."""
    admin_engine = create_async_engine(_admin_url(), isolation_level="AUTOCOMMIT")

    async with admin_engine.connect() as conn:
        for db_name in ALL_DBS:
            result = await conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": db_name},
            )
            if not result.scalar():
                print(f"  Creating database '{db_name}'...")
                await conn.execute(text(f'CREATE DATABASE "{db_name}"'))
                print(f"  ✓ Database '{db_name}' created")
            else:
                print(f"  ✓ Database '{db_name}' exists")

    await admin_engine.dispose()


def run_alembic_migrations() -> None:
    """Run Alembic migrations for managed databases."""
    # Platform DB (default [alembic] section)
    print("\n  Running platform DB migrations...")
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"  ✗ Platform migration failed: {result.stderr}")
        sys.exit(1)
    print("  ✓ Platform DB up to date")

    # JusMonitorIA DB (named section)
    print("  Running jusmonitoria DB migrations...")
    result = subprocess.run(
        ["alembic", "-n", "jusmonitoria", "upgrade", "head"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"  ✗ JusMonitorIA migration failed: {result.stderr}")
        sys.exit(1)
    print("  ✓ JusMonitorIA DB up to date")


async def verify_connectivity() -> None:
    """Verify all 3 database connections work."""
    for name, url in ALL_DBS.items():
        engine = create_async_engine(url)
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            print(f"  ✓ {name} DB connected")
        except Exception as e:
            print(f"  ✗ {name} DB connection failed: {e}")
            sys.exit(1)
        finally:
            await engine.dispose()


async def main() -> None:
    print("=== Platform DB Prepare ===\n")

    print("[1/3] Ensuring databases exist...")
    await ensure_databases_exist()

    print("\n[2/3] Running Alembic migrations...")
    run_alembic_migrations()

    print("\n[3/3] Verifying connectivity...")
    await verify_connectivity()

    print("\n=== All databases ready ===")


if __name__ == "__main__":
    asyncio.run(main())
