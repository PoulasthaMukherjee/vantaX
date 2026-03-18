"""
SystemConfig model - global key-value configuration.
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class SystemConfig(Base):
    """
    Global system configuration key-value store.

    NOT org-scoped - applies to entire system.
    Used for maintenance mode, feature flags, etc.
    """

    __tablename__ = "system_config"

    # Primary key is the config key itself
    key: Mapped[str] = mapped_column(String(100), primary_key=True)

    # Value stored as JSONB for flexibility
    value: Mapped[dict[str, Any]] = mapped_column(JSONB)

    # Audit trail
    updated_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    updater: Mapped["User | None"] = relationship()

    def __repr__(self) -> str:
        return f"<SystemConfig {self.key}={self.value}>"

    @classmethod
    def get_value(cls, db, key: str, default: Any = None) -> Any:
        """
        Get a config value by key.

        Args:
            db: Database session
            key: Config key
            default: Default value if key not found

        Returns:
            Config value or default
        """
        config = db.query(cls).filter(cls.key == key).first()
        if config is None:
            return default
        return config.value

    @classmethod
    def set_value(
        cls, db, key: str, value: Any, updated_by: UUID | None = None
    ) -> "SystemConfig":
        """
        Set a config value.

        Args:
            db: Database session
            key: Config key
            value: Value to set
            updated_by: User ID who made the change

        Returns:
            Updated or created SystemConfig
        """
        config = db.query(cls).filter(cls.key == key).first()
        if config is None:
            config = cls(key=key, value=value, updated_by=updated_by)
            db.add(config)
        else:
            config.value = value
            config.updated_by = updated_by
        db.commit()
        return config

    @classmethod
    def is_maintenance_mode(cls, db) -> bool:
        """Check if system is in maintenance mode."""
        value = cls.get_value(db, "maintenance_mode", False)
        # Handle both boolean and string "true"/"false"
        if isinstance(value, bool):
            return value
        return str(value).lower() == "true"
