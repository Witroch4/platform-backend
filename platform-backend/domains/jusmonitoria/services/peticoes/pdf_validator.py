"""PDF validation service for petition documents."""

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    valid: bool
    error: Optional[str] = None


class PdfValidatorService:
    """Validates PDF files for MNI electronic filing."""

    def __init__(self, max_size_mb: int = 5):
        self.max_size_bytes = max_size_mb * 1024 * 1024

    def validate(self, pdf_bytes: bytes, filename: str) -> ValidationResult:
        """Validate PDF integrity and size."""
        if not pdf_bytes:
            return ValidationResult(False, "Arquivo vazio")

        if len(pdf_bytes) > self.max_size_bytes:
            return ValidationResult(
                False,
                f"Arquivo excede limite de {self.max_size_bytes // (1024 * 1024)}MB",
            )

        if not pdf_bytes.startswith(b"%PDF"):
            return ValidationResult(False, "Arquivo não é um PDF válido")

        # Check for PDF EOF marker
        tail = pdf_bytes[-1024:] if len(pdf_bytes) > 1024 else pdf_bytes
        if b"%%EOF" not in tail:
            logger.warning("PDF missing %%EOF marker: %s", filename)
            # Non-fatal — some PDFs are valid without it

        return ValidationResult(True)
