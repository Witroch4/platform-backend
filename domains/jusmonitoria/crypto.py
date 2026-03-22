"""Symmetric encryption utilities for sensitive data at rest."""

import base64
import hashlib

from cryptography.fernet import Fernet

from platform_core.config import settings


def _get_fernet() -> Fernet:
    """Derive a Fernet key from the application secret_key."""
    key_bytes = hashlib.sha256(settings.secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))


def encrypt(plaintext: str) -> str:
    """Encrypt a string and return base64-encoded ciphertext."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Decrypt a base64-encoded ciphertext and return plaintext."""
    f = _get_fernet()
    return f.decrypt(ciphertext.encode()).decode()
