"""
Bootstrap the first admin account. All other users must be created via the
admin-only POST /users endpoint once this one exists.

Usage:
    python scripts/create_admin.py --username admin --full-name "Dr. Eman Ameen" --password "changeme"

    # Inside Docker:
    docker compose exec api python scripts/create_admin.py --username admin --full-name "Dr. Eman Ameen" --password "changeme"
"""

import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole


def main():
    parser = argparse.ArgumentParser(description="Create the first admin user")
    parser.add_argument("--username", required=True)
    parser.add_argument("--full-name", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--primary", action="store_true", default=None, help="Designate as primary pharmacy owner")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.username == args.username))
        if existing is not None:
            print(f"User '{args.username}' already exists. Nothing to do.")
            return

        has_primary = db.scalar(select(User).where(User.is_primary_admin.is_(True))) is not None
        is_primary = args.primary if args.primary is not None else (not has_primary)

        user = User(
            username=args.username,
            full_name=args.full_name,
            password_hash=hash_password(args.password),
            role=UserRole.ADMIN,
            is_primary_admin=is_primary,
        )
        db.add(user)
        db.commit()
        print(f"Admin user '{args.username}' created successfully (Primary Owner: {is_primary}).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
