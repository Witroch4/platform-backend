"""Socialwise declarative base — binds to the socialwise database.

Prisma is the schema authority for this database.
SQLAlchemy models here are read/write mirrors — NO Alembic, NO migrations.
"""

import os
import secrets
import string
import time
from itertools import count
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

_BASE36_ALPHABET = string.digits + string.ascii_lowercase
_CUID_COUNTER = count(secrets.randbelow(36**4))
_CUID_FINGERPRINT = "".join(secrets.choice(_BASE36_ALPHABET) for _ in range(4))


def _to_base36(value: int) -> str:
    if value == 0:
        return "0"

    digits: list[str] = []
    current = value
    while current:
        current, remainder = divmod(current, 36)
        digits.append(_BASE36_ALPHABET[remainder])
    return "".join(reversed(digits))


def _random_base36(length: int) -> str:
    return "".join(secrets.choice(_BASE36_ALPHABET) for _ in range(length))


def generate_cuid() -> str:
    """Generate a Prisma-compatible string id shape for mirrored writes.

    Prisma generates CUIDs client-side, not in Postgres. Socialwise writes from
    SQLAlchemy therefore need a deterministic local generator.
    """

    timestamp = _to_base36(int(time.time() * 1000)).rjust(8, "0")[-8:]
    counter_value = _to_base36(next(_CUID_COUNTER) % (36**4)).rjust(4, "0")[-4:]
    pid_value = _to_base36(os.getpid() % (36**2)).rjust(2, "0")[-2:]
    return f"c{timestamp}{counter_value}{pid_value}{_CUID_FINGERPRINT}{_random_base36(6)}"


class SocialwiseBase(DeclarativeBase):
    """Declarative base for Socialwise models (socialwise DB).

    Prisma manages the schema. These models mirror existing tables.
    """


class SocialwiseModel(SocialwiseBase):
    """Base model with CUID pk + timestamps for Socialwise domain.

    Most Prisma models use:
      - id: String @id @default(cuid())
      - createdAt: DateTime @default(now())
      - updatedAt: DateTime @updatedAt
    """

    __abstract__ = True

    id: Mapped[str] = mapped_column(
        String(30),
        primary_key=True,
        nullable=False,
        default=generate_cuid,
    )
    created_at: Mapped[datetime] = mapped_column(
        "createdAt",
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt",
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            column.name: getattr(self, column.key)
            for column in self.__table__.columns
        }
