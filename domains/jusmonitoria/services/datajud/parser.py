"""
DataJud Movement Parser

Parses and normalizes movements from DataJud API responses.
Implements round-trip property: parse(format(x)) ≈ x

Requirements: 2.5, 2.6, 23
"""

import hashlib
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, List, Optional


@dataclass
class Movement:
    """
    Normalized movement data structure.

    Represents a process movement with normalized fields.
    """

    date: date
    type: str
    description: str
    raw_data: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        """Validate and normalize fields after initialization."""
        # Normalize type (remove extra whitespace, lowercase)
        if self.type:
            self.type = " ".join(self.type.split()).strip()

        # Normalize description (remove extra whitespace)
        if self.description:
            self.description = " ".join(self.description.split()).strip()

    def to_dict(self) -> Dict[str, Any]:
        """
        Serialize movement to dictionary.

        Returns:
            Dictionary representation
        """
        return {
            "date": self.date.isoformat(),
            "type": self.type,
            "description": self.description,
            "raw_data": self.raw_data,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Movement":
        """
        Deserialize movement from dictionary.

        Args:
            data: Dictionary with movement data

        Returns:
            Movement instance
        """
        return cls(
            date=date.fromisoformat(data["date"]),
            type=data["type"],
            description=data["description"],
            raw_data=data.get("raw_data", {}),
        )

    def compute_hash(self) -> str:
        """
        Compute content hash for deduplication.

        Uses date, type, and description to create unique hash.

        Returns:
            SHA-256 hash string
        """
        content = f"{self.date.isoformat()}|{self.type}|{self.description}"
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    def __eq__(self, other) -> bool:
        """
        Check equality based on normalized fields.

        Args:
            other: Another Movement instance

        Returns:
            True if movements are equivalent
        """
        if not isinstance(other, Movement):
            return False

        return (
            self.date == other.date
            and self.type == other.type
            and self.description == other.description
        )


class MovementParser:
    """
    Parser for DataJud movement data.

    Implements round-trip property:
    parse(format(movement)) should produce equivalent movement
    """

    # Common date formats in DataJud responses
    DATE_FORMATS = [
        "%Y-%m-%d",  # ISO format
        "%d/%m/%Y",  # Brazilian format
        "%Y-%m-%dT%H:%M:%S",  # ISO with time
        "%Y-%m-%dT%H:%M:%S.%f",  # ISO with microseconds
        "%d/%m/%Y %H:%M:%S",  # Brazilian with time
    ]

    def parse(self, raw_data: Dict[str, Any]) -> Movement:
        """
        Parse raw DataJud movement data.

        Args:
            raw_data: Raw movement data from DataJud API

        Returns:
            Normalized Movement instance

        Raises:
            ValueError: If required fields are missing or invalid
        """
        # Extract date
        date_value = self._parse_date(
            raw_data.get("dataMovimento")
            or raw_data.get("data")
            or raw_data.get("dataHora")
        )

        # Extract type
        movement_type = (
            raw_data.get("tipoMovimento")
            or raw_data.get("tipo")
            or raw_data.get("movimentoNacional", {}).get("nome")
            or ""
        )

        # Extract description
        description = (
            raw_data.get("descricao")
            or raw_data.get("complemento")
            or raw_data.get("texto")
            or ""
        )

        if not description:
            raise ValueError("Movement description is required")

        return Movement(
            date=date_value,
            type=movement_type,
            description=description,
            raw_data=raw_data,
        )

    def parse_batch(self, raw_movements: List[Dict[str, Any]]) -> List[Movement]:
        """
        Parse multiple movements.

        Args:
            raw_movements: List of raw movement data

        Returns:
            List of normalized Movement instances
        """
        movements = []

        for raw_data in raw_movements:
            try:
                movement = self.parse(raw_data)
                movements.append(movement)
            except (ValueError, KeyError) as e:
                # Log error but continue processing other movements
                print(f"Error parsing movement: {e}")
                continue

        return movements

    def format(self, movement: Movement) -> Dict[str, Any]:
        """
        Format movement back to DataJud-like structure.

        Args:
            movement: Movement instance to format

        Returns:
            Dictionary in DataJud format
        """
        return {
            "dataMovimento": movement.date.isoformat(),
            "tipoMovimento": movement.type,
            "descricao": movement.description,
        }

    def format_batch(self, movements: List[Movement]) -> List[Dict[str, Any]]:
        """
        Format multiple movements.

        Args:
            movements: List of Movement instances

        Returns:
            List of dictionaries in DataJud format
        """
        return [self.format(movement) for movement in movements]

    def validate_round_trip(self, movement: Movement) -> bool:
        """
        Validate round-trip property: parse(format(x)) ≈ x

        Args:
            movement: Original movement

        Returns:
            True if round-trip produces equivalent movement

        Raises:
            AssertionError: If round-trip validation fails
        """
        # Format then parse
        formatted = self.format(movement)
        parsed = self.parse(formatted)

        # Check equivalence (normalized fields should match)
        if parsed != movement:
            raise AssertionError(
                f"Round-trip validation failed:\n"
                f"Original: {movement}\n"
                f"After round-trip: {parsed}"
            )

        return True

    def _parse_date(self, date_value: Any) -> date:
        """
        Parse date from various formats.

        Args:
            date_value: Date string or datetime object

        Returns:
            date object

        Raises:
            ValueError: If date cannot be parsed
        """
        if date_value is None:
            raise ValueError("Date is required")

        # Already a date object
        if isinstance(date_value, date):
            return date_value

        # datetime object
        if isinstance(date_value, datetime):
            return date_value.date()

        # String - try various formats
        if isinstance(date_value, str):
            date_str = date_value.strip()

            # Try each format
            for fmt in self.DATE_FORMATS:
                try:
                    parsed = datetime.strptime(date_str, fmt)
                    return parsed.date()
                except ValueError:
                    continue

            # If no format worked, raise error
            raise ValueError(f"Unable to parse date: {date_value}")

        raise ValueError(f"Invalid date type: {type(date_value)}")

    def _normalize_text(self, text: str) -> str:
        """
        Normalize text by removing extra whitespace and special characters.

        Args:
            text: Text to normalize

        Returns:
            Normalized text
        """
        if not text:
            return ""

        # Remove extra whitespace
        text = " ".join(text.split())

        # Remove control characters
        text = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", text)

        return text.strip()


def create_parser() -> MovementParser:
    """
    Factory function to create movement parser.

    Returns:
        MovementParser instance
    """
    return MovementParser()
