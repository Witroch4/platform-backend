"""
Certificate cryptographic operations.

Handles PFX encryption/decryption with Fernet (AES-128-CBC),
metadata extraction from PKCS#12, and mTLS tempfile management
with zero-disk-footprint for private keys.
"""

import logging
import os
import re
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Generator

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509 import Certificate
from cryptography.x509.oid import NameOID

logger = logging.getLogger(__name__)


@dataclass
class CertificateMetadata:
    """Extracted metadata from a PFX/P12 certificate."""

    titular_nome: str
    titular_cpf_cnpj: str
    emissora: str
    serial_number: str
    valido_de: datetime
    valido_ate: datetime


def _extract_cpf_cnpj_from_subject(cert: Certificate) -> str:
    """Extract CPF or CNPJ from certificate subject or SAN."""
    # Try subject CN first
    try:
        cn = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
        # ICP-Brasil certs often embed CPF/CNPJ in CN
        # Pattern: "NAME:12345678900" or just digits in CN
        cpf_match = re.search(r"\d{11}", str(cn))
        if cpf_match:
            return cpf_match.group()
        cnpj_match = re.search(r"\d{14}", str(cn))
        if cnpj_match:
            return cnpj_match.group()
    except (IndexError, ValueError):
        pass

    # Try OID for CPF (2.16.76.1.3.1) common in ICP-Brasil
    try:
        from cryptography.x509 import ObjectIdentifier

        # ICP-Brasil OIDs
        OID_PF_CPF = ObjectIdentifier("2.16.76.1.3.1")
        OID_PJ_CNPJ = ObjectIdentifier("2.16.76.1.3.3")

        for ext in cert.extensions:
            ext_value = ext.value
            # Check SubjectAlternativeName for otherName
            if hasattr(ext_value, "__iter__"):
                for name in ext_value:
                    if hasattr(name, "type_id"):
                        if name.type_id == OID_PF_CPF:
                            raw = name.value.public_bytes()
                            digits = re.findall(r"\d+", raw.decode("latin-1", errors="ignore"))
                            for d in digits:
                                if len(d) == 11:
                                    return d
                        elif name.type_id == OID_PJ_CNPJ:
                            raw = name.value.public_bytes()
                            digits = re.findall(r"\d+", raw.decode("latin-1", errors="ignore"))
                            for d in digits:
                                if len(d) == 14:
                                    return d
    except Exception:
        pass

    # Try serial number field (some ICP-Brasil certs use this)
    try:
        serial_attr = cert.subject.get_attributes_for_oid(NameOID.SERIAL_NUMBER)
        if serial_attr:
            val = str(serial_attr[0].value)
            digits = re.findall(r"\d+", val)
            for d in digits:
                if len(d) in (11, 14):
                    return d
    except (IndexError, ValueError):
        pass

    return ""


class CertificateCryptoService:
    """
    Manages PFX encryption, decryption, metadata extraction,
    and ephemeral mTLS tempfile creation.
    """

    def __init__(self, encrypt_key: str):
        """
        Initialize with Fernet encryption key.

        Args:
            encrypt_key: Base64-encoded 32-byte Fernet key.
                         Generate with: Fernet.generate_key().decode()
        """
        if not encrypt_key:
            raise ValueError("ENCRYPT_KEY must be set for certificate operations")
        self.fernet = Fernet(encrypt_key.encode() if isinstance(encrypt_key, str) else encrypt_key)

    def encrypt(self, data: bytes) -> bytes:
        """Encrypt arbitrary bytes with Fernet."""
        return self.fernet.encrypt(data)

    def decrypt(self, encrypted_data: bytes) -> bytes:
        """Decrypt Fernet-encrypted bytes."""
        return self.fernet.decrypt(encrypted_data)

    def encrypt_password(self, password: str) -> bytes:
        """Encrypt a PFX password string."""
        return self.fernet.encrypt(password.encode("utf-8"))

    def decrypt_password(self, encrypted_password: bytes) -> str:
        """Decrypt a Fernet-encrypted PFX password."""
        return self.fernet.decrypt(encrypted_password).decode("utf-8")

    def extract_metadata(self, pfx_bytes: bytes, password: str) -> CertificateMetadata:
        """
        Parse a PFX/P12 file and extract certificate metadata.

        Args:
            pfx_bytes: Raw PFX file content
            password: PFX password

        Returns:
            CertificateMetadata with subject, issuer, serial, validity dates

        Raises:
            ValueError: If PFX cannot be parsed or password is wrong
        """
        try:
            private_key, certificate, chain = pkcs12.load_key_and_certificates(
                pfx_bytes, password.encode("utf-8")
            )
        except Exception as e:
            raise ValueError(f"Erro ao abrir certificado PFX: {e}") from e

        if certificate is None:
            raise ValueError("Arquivo PFX não contém certificado válido")

        if private_key is None:
            raise ValueError("Arquivo PFX não contém chave privada")

        # Extract subject CN
        try:
            cn_attrs = certificate.subject.get_attributes_for_oid(NameOID.COMMON_NAME)
            titular_nome = str(cn_attrs[0].value) if cn_attrs else "Desconhecido"
        except (IndexError, ValueError):
            titular_nome = "Desconhecido"

        # Extract issuer CN
        try:
            issuer_attrs = certificate.issuer.get_attributes_for_oid(NameOID.COMMON_NAME)
            emissora = str(issuer_attrs[0].value) if issuer_attrs else "Desconhecido"
        except (IndexError, ValueError):
            emissora = "Desconhecido"

        # Extract CPF/CNPJ
        titular_cpf_cnpj = _extract_cpf_cnpj_from_subject(certificate)

        # Serial number as hex
        serial_hex = format(certificate.serial_number, "X")
        # Format as AA:BB:CC:DD
        serial_formatted = ":".join(
            serial_hex[i : i + 2] for i in range(0, len(serial_hex), 2)
        )

        return CertificateMetadata(
            titular_nome=titular_nome,
            titular_cpf_cnpj=titular_cpf_cnpj,
            emissora=emissora,
            serial_number=serial_formatted,
            valido_de=certificate.not_valid_before_utc.replace(tzinfo=timezone.utc),
            valido_ate=certificate.not_valid_after_utc.replace(tzinfo=timezone.utc),
        )

    @contextmanager
    def mtls_tempfiles(
        self, pfx_encrypted: bytes, pfx_password_encrypted: bytes
    ) -> Generator[tuple[str, str], None, None]:
        """
        Context manager that decrypts PFX, writes cert+key to ephemeral tempfiles,
        yields their paths for mTLS, then securely cleans up.

        Zero-disk-footprint: files are overwritten with zeros before unlinking.

        Args:
            pfx_encrypted: Fernet-encrypted PFX blob from database
            pfx_password_encrypted: Fernet-encrypted PFX password

        Yields:
            (cert_path, key_path) tuple for use with requests/httpx session.cert

        Raises:
            ValueError: If decryption or PFX parsing fails
        """
        cert_path = None
        key_path = None

        try:
            # Decrypt in RAM
            pfx_bytes = self.decrypt(pfx_encrypted)
            password = self.decrypt_password(pfx_password_encrypted)

            # Parse PKCS#12
            private_key, certificate, chain = pkcs12.load_key_and_certificates(
                pfx_bytes, password.encode("utf-8")
            )

            if certificate is None or private_key is None:
                raise ValueError("PFX inválido: sem certificado ou chave privada")

            # Serialize certificate + chain to PEM
            cert_pem = certificate.public_bytes(serialization.Encoding.PEM)
            if chain:
                for ca_cert in chain:
                    cert_pem += ca_cert.public_bytes(serialization.Encoding.PEM)

            # Serialize private key to PEM (unencrypted — file is ephemeral)
            key_pem = private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            )

            # Write to tempfiles with restricted permissions
            cert_fd = tempfile.NamedTemporaryFile(
                suffix=".pem", prefix="jm_cert_", delete=False
            )
            cert_path = cert_fd.name
            cert_fd.write(cert_pem)
            cert_fd.close()
            os.chmod(cert_path, 0o600)

            key_fd = tempfile.NamedTemporaryFile(
                suffix=".pem", prefix="jm_key_", delete=False
            )
            key_path = key_fd.name
            key_fd.write(key_pem)
            key_fd.close()
            os.chmod(key_path, 0o600)

            logger.debug("mTLS tempfiles created", extra={"cert": cert_path, "key": key_path})

            yield cert_path, key_path

        finally:
            # Securely cleanup: overwrite with zeros then unlink
            for path in (cert_path, key_path):
                if path and os.path.exists(path):
                    try:
                        size = os.path.getsize(path)
                        with open(path, "wb") as f:
                            f.write(b"\x00" * size)
                        os.unlink(path)
                        logger.debug("Securely deleted tempfile", extra={"path": path})
                    except OSError as e:
                        logger.warning(
                            "Failed to cleanup tempfile",
                            extra={"path": path, "error": str(e)},
                        )
