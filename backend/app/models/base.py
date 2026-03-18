"""
Base model class with common fields.
"""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TimestampMixin:
    """Mixin that adds created_at and updated_at timestamps."""

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class UUIDMixin:
    """Mixin that adds UUID primary key."""

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)


class BaseModel(Base, UUIDMixin, TimestampMixin):
    """
    Abstract base model with UUID pk and timestamps.
    All models should inherit from this.
    """

    __abstract__ = True
