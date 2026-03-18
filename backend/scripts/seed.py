#!/usr/bin/env python
"""
Seed script for local development and testing.
Creates default organization and admin user.

Usage:
    python scripts/seed.py
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import Base, SessionLocal, engine
from app.models import (
    Organization,
    OrganizationUser,
    OrganizationUserRole,
    SystemConfig,
    User,
)


def _seed_system_config(db):
    """Seed default system configuration values."""
    defaults = {
        "maintenance_mode": False,
    }

    for key, value in defaults.items():
        existing = db.query(SystemConfig).filter(SystemConfig.key == key).first()
        if not existing:
            config = SystemConfig(key=key, value=value)
            db.add(config)
            print(f"Created system config: {key} = {value}")

    db.flush()


def seed_database():
    """Create default organization, admin user, and system config."""

    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        # Seed system config defaults
        _seed_system_config(db)

        # Check if default org exists
        default_org = (
            db.query(Organization).filter(Organization.slug == "default").first()
        )

        if default_org:
            print("Default organization already exists")
            db.commit()
            return

        # Create default organization
        default_org = Organization(
            name="Default Organization",
            slug="default",
            status="active",
            plan="free",
        )
        db.add(default_org)
        db.flush()  # Get the ID

        print(f"Created organization: {default_org.name} (ID: {default_org.id})")

        # Create admin user (for local testing)
        admin_user = User(
            firebase_uid="local-admin-uid",  # Placeholder for local dev
            email="admin@localhost.dev",
            name="Local Admin",
            email_verified=True,
        )
        db.add(admin_user)
        db.flush()

        print(f"Created admin user: {admin_user.email} (ID: {admin_user.id})")

        # Create membership
        membership = OrganizationUser(
            organization_id=default_org.id,
            user_id=admin_user.id,
            role=OrganizationUserRole.OWNER,
        )
        db.add(membership)

        # Update organization creator
        default_org.created_by = admin_user.id

        db.commit()

        print("\nSeed data created successfully!")
        print(f"\nDefault Organization ID: {default_org.id}")
        print(f"Admin User ID: {admin_user.id}")
        print("\nUse these IDs for local testing.")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
