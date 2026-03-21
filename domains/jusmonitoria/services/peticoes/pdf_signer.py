"""PDF signing service using pyhanko with PKCS#7/CMS signatures.

Signs PDFs in memory using A1 ICP-Brasil certificates for MNI 2.2.2 filing.
Uses tempfiles for PFX (pyhanko requires file path) with zero-disk-footprint cleanup.
"""

import io
import logging
import os
import tempfile

from domains.jusmonitoria.services.certificados.crypto import CertificateCryptoService

logger = logging.getLogger(__name__)


class PdfSignerService:
    """Signs PDFs with A1 digital certificates using pyhanko."""

    def sign_in_memory(
        self,
        pdf_bytes: bytes,
        pfx_encrypted: bytes,
        pfx_password_encrypted: bytes,
        crypto: CertificateCryptoService,
        reason: str = "Peticionamento eletrônico via JusMonitorIA",
        location: str = "Brasil",
    ) -> bytes:
        """
        Sign a PDF using the given A1 certificate.

        Decrypts PFX in RAM, writes to ephemeral tempfile for pyhanko,
        then securely cleans up. Returns signed PDF bytes.
        """
        from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
        from pyhanko.sign import signers

        # Decrypt PFX and password
        pfx_bytes = crypto.decrypt(pfx_encrypted)
        password = crypto.decrypt_password(pfx_password_encrypted)

        pfx_path = None
        try:
            # Write PFX to ephemeral tempfile (pyhanko requires file path)
            pfx_fd = tempfile.NamedTemporaryFile(
                suffix=".pfx", prefix="jm_sign_", delete=False
            )
            pfx_path = pfx_fd.name
            pfx_fd.write(pfx_bytes)
            pfx_fd.close()
            os.chmod(pfx_path, 0o600)

            # Load signer from PKCS#12
            signer = signers.SimpleSigner.load_pkcs12(
                pfx_file=pfx_path,
                passphrase=password.encode("utf-8"),
            )

            # Sign PDF
            w = IncrementalPdfFileWriter(io.BytesIO(pdf_bytes))
            result = signers.sign_pdf(
                w,
                signers.PdfSignatureMetadata(
                    field_name="JusMonitorIASig",
                    reason=reason,
                    location=location,
                ),
                signer=signer,
            )

            # result is a BytesIO
            result.seek(0)
            signed_bytes = result.read()
            logger.debug("PDF signed successfully, size=%d", len(signed_bytes))
            return signed_bytes

        finally:
            # Zero-disk-footprint cleanup
            if pfx_path and os.path.exists(pfx_path):
                try:
                    size = os.path.getsize(pfx_path)
                    with open(pfx_path, "wb") as f:
                        f.write(b"\x00" * size)
                    os.unlink(pfx_path)
                except OSError as e:
                    logger.warning("Failed to cleanup PFX tempfile: %s", e)
