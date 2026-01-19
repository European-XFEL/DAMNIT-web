from datetime import datetime

from sqlalchemy import Column
from sqlmodel import DateTime, Field, func


class CreatedAtMixin:
    created_at: datetime = Field(
        default=None,
        sa_column=Column(DateTime(timezone=False), server_default=func.now()),
    )


class UpdatedAtMixin:
    updated_at: datetime | None = Field(
        sa_column=Column(DateTime(timezone=False), onupdate=func.now())
    )
