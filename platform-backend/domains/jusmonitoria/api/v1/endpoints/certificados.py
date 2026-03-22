"""API endpoints for digital certificate management (A1 ICP-Brasil)."""

import base64
import logging
from io import BytesIO
from urllib.parse import parse_qs, urlparse
from uuid import UUID

import httpx
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.config import settings
from domains.jusmonitoria.auth.dependencies import get_current_tenant_id, get_current_user
from domains.jusmonitoria.services.certificados.crypto import CertificateCryptoService
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.db.repositories.certificado_digital import CertificadoDigitalRepository
from domains.jusmonitoria.schemas.certificado import (
    CertificadoListResponse,
    CertificadoResponse,
    CertificadoTesteResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/certificados", tags=["certificados"])


def _get_crypto_service() -> CertificateCryptoService:
    """Create crypto service with configured encryption key."""
    return CertificateCryptoService(settings.encrypt_key)


@router.get("", response_model=CertificadoListResponse)
async def list_certificados(
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> CertificadoListResponse:
    """List all active (non-revoked) certificates for the tenant."""
    repo = CertificadoDigitalRepository(session, tenant_id)
    certs = await repo.get_active()

    return CertificadoListResponse(
        items=[CertificadoResponse.model_validate(c) for c in certs],
        total=len(certs),
    )


@router.get("/{cert_id}", response_model=CertificadoResponse)
async def get_certificado(
    cert_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> CertificadoResponse:
    """Get a single certificate by ID."""
    repo = CertificadoDigitalRepository(session, tenant_id)
    cert = await repo.get(cert_id)

    if cert is None or cert.revogado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificado não encontrado",
        )

    return CertificadoResponse.model_validate(cert)


@router.post("", response_model=CertificadoResponse, status_code=status.HTTP_201_CREATED)
async def upload_certificado(
    arquivo: UploadFile = File(..., description="Arquivo PFX/P12"),
    nome: str = Form(..., min_length=1, max_length=255, description="Nome amigável"),
    senha_pfx: str = Form(..., min_length=1, description="Senha do arquivo PFX"),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> CertificadoResponse:
    """
    Upload and store a new A1 digital certificate.

    Accepts a PFX/P12 file, validates it with the provided password,
    extracts metadata, encrypts the blob with Fernet, and stores it.
    The password is also encrypted and stored for future mTLS operations.
    """
    # Validate file extension
    if arquivo.filename and not arquivo.filename.lower().endswith((".pfx", ".p12")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo deve ser .pfx ou .p12",
        )

    # Read file content
    pfx_bytes = await arquivo.read()
    if not pfx_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo vazio",
        )

    # Validate and extract metadata
    crypto = _get_crypto_service()
    try:
        metadata = crypto.extract_metadata(pfx_bytes, senha_pfx)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Check for duplicate serial number (including revoked certs)
    repo = CertificadoDigitalRepository(session, tenant_id)
    existing = await repo.get_by_serial_any(metadata.serial_number)
    if existing and not existing.revogado:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Certificado com serial {metadata.serial_number} já cadastrado",
        )

    # Encrypt PFX blob and password
    pfx_encrypted = crypto.encrypt(pfx_bytes)
    password_encrypted = crypto.encrypt_password(senha_pfx)

    if existing and existing.revogado:
        # Reactivate previously deleted certificate with new data
        cert = await repo.update(
            existing.id,
            nome=nome,
            titular_nome=metadata.titular_nome,
            titular_cpf_cnpj=metadata.titular_cpf_cnpj,
            emissora=metadata.emissora,
            valido_de=metadata.valido_de,
            valido_ate=metadata.valido_ate,
            pfx_encrypted=pfx_encrypted,
            pfx_password_encrypted=password_encrypted,
            totp_secret_encrypted=None,
            ultimo_teste_em=None,
            ultimo_teste_resultado=None,
            ultimo_teste_mensagem=None,
            revogado=False,
        )
        action = "reactivated"
    else:
        # Create new record
        cert = await repo.create(
            nome=nome,
            titular_nome=metadata.titular_nome,
            titular_cpf_cnpj=metadata.titular_cpf_cnpj,
            emissora=metadata.emissora,
            serial_number=metadata.serial_number,
            valido_de=metadata.valido_de,
            valido_ate=metadata.valido_ate,
            pfx_encrypted=pfx_encrypted,
            pfx_password_encrypted=password_encrypted,
        )
        action = "uploaded"

    await session.commit()

    logger.info(
        f"Certificate {action}",
        extra={
            "cert_id": str(cert.id),
            "tenant_id": str(tenant_id),
            "titular": metadata.titular_nome,
            "serial": metadata.serial_number,
        },
    )

    return CertificadoResponse.model_validate(cert)


@router.post("/{cert_id}/testar", response_model=CertificadoTesteResponse)
async def testar_certificado(
    cert_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> CertificadoTesteResponse:
    """
    Test mTLS handshake with a tribunal endpoint using this certificate.

    Attempts an HTTPS connection to a PJe MNI endpoint using the
    decrypted certificate for mutual TLS authentication.
    """
    repo = CertificadoDigitalRepository(session, tenant_id)
    cert = await repo.get(cert_id)

    if cert is None or cert.revogado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificado não encontrado",
        )

    crypto = _get_crypto_service()

    # Default test endpoint: TRF5-JFCE (known stable PJe MNI endpoint)
    test_url = "https://pje.jfce.jus.br/pje/intercomunicacao?wsdl"

    sucesso = False
    mensagem = ""

    try:
        with crypto.mtls_tempfiles(cert.pfx_encrypted, cert.pfx_password_encrypted) as (
            cert_path,
            key_path,
        ):
            # Attempt mTLS handshake
            async with httpx.AsyncClient(
                cert=(cert_path, key_path),
                verify=True,
                timeout=httpx.Timeout(15.0),
            ) as client:
                response = await client.get(test_url)
                if response.status_code == 200:
                    sucesso = True
                    mensagem = (
                        f"Handshake mTLS bem-sucedido com {test_url} "
                        f"(HTTP {response.status_code})"
                    )
                else:
                    mensagem = (
                        f"Conexão estabelecida mas retornou HTTP {response.status_code}"
                    )
                    # Still consider it a success if we got past TLS
                    sucesso = response.status_code < 500

    except httpx.ConnectError as e:
        mensagem = f"Falha na conexão mTLS: {e}"
    except httpx.TimeoutException:
        mensagem = "Timeout na conexão com o tribunal (15s)"
    except ValueError as e:
        mensagem = f"Erro ao descriptografar certificado: {e}"
    except Exception as e:
        mensagem = f"Erro inesperado: {type(e).__name__}: {e}"
        logger.exception("Certificate test failed", extra={"cert_id": str(cert_id)})

    # Update test result in DB
    from datetime import datetime, timezone

    await repo.update(
        cert_id,
        ultimo_teste_em=datetime.now(timezone.utc),
        ultimo_teste_resultado="sucesso" if sucesso else "falha",
        ultimo_teste_mensagem=mensagem,
    )
    await session.commit()

    return CertificadoTesteResponse(sucesso=sucesso, mensagem=mensagem)


@router.delete("/{cert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_certificado(
    cert_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> None:
    """Soft-delete (revoke) a certificate."""
    repo = CertificadoDigitalRepository(session, tenant_id)
    cert = await repo.get(cert_id)

    if cert is None or cert.revogado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificado não encontrado",
        )

    await repo.update(cert_id, revogado=True)
    await session.commit()

    logger.info(
        "Certificate revoked",
        extra={"cert_id": str(cert_id), "tenant_id": str(tenant_id)},
    )


@router.patch("/{cert_id}/totp", status_code=status.HTTP_204_NO_CONTENT)
async def configurar_totp_certificado(
    cert_id: UUID,
    totp_secret: str | None = Body(
        default=None,
        embed=True,
        description="Segredo TOTP base32 para 2FA do SSO PJe. Enviar null para remover.",
    ),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> None:
    """Configurar (ou remover) o segredo TOTP para autenticação 2FA do SSO PJe.

    Envia null para remover o TOTP configurado.
    O segredo é armazenado criptografado (Fernet) junto ao certificado.
    """
    repo = CertificadoDigitalRepository(session, tenant_id)
    cert = await repo.get(cert_id)

    if cert is None or cert.revogado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificado não encontrado",
        )

    crypto = _get_crypto_service()
    totp_encrypted = crypto.encrypt(totp_secret.encode()) if totp_secret else None

    await repo.update(cert_id, totp_secret_encrypted=totp_encrypted)
    await session.commit()

    logger.info(
        "Certificate TOTP %s",
        "configured" if totp_secret else "removed",
        extra={"cert_id": str(cert_id), "tenant_id": str(tenant_id)},
    )


@router.post("/{cert_id}/totp-qr")
async def configurar_totp_via_qr(
    cert_id: UUID,
    imagem: UploadFile = File(..., description="Screenshot ou foto do QR Code TOTP"),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict:
    """Upload screenshot/foto de QR Code TOTP, decodifica e armazena o segredo.

    Aceita imagens PNG, JPG, WebP, BMP contendo um QR code com URI otpauth://totp/...
    Extrai o segredo base32, criptografa com Fernet e salva no certificado.
    """
    repo = CertificadoDigitalRepository(session, tenant_id)
    cert = await repo.get(cert_id)

    if cert is None or cert.revogado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificado não encontrado",
        )

    image_bytes = await imagem.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Imagem vazia",
        )

    # Decode QR code from image
    try:
        from PIL import Image
        from pyzbar.pyzbar import decode as decode_qr

        img = Image.open(BytesIO(image_bytes))
        qr_results = decode_qr(img)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao processar imagem: {e}",
        )

    if not qr_results:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nenhum QR Code encontrado na imagem. Tente com uma foto mais nítida.",
        )

    # Log all QR codes found for debugging
    for i, qr in enumerate(qr_results):
        data = qr.data.decode("utf-8", errors="ignore")
        logger.info(
            "QR code #%d found: type=%s data=%s",
            i,
            qr.type,
            data[:200],
            extra={"cert_id": str(cert_id)},
        )

    # Find otpauth:// URI
    totp_uri = None
    for qr in qr_results:
        data = qr.data.decode("utf-8", errors="ignore")
        if data.startswith("otpauth://"):
            totp_uri = data
            break

    if not totp_uri:
        # Return what was found for debugging
        found_data = [qr.data.decode("utf-8", errors="ignore")[:100] for qr in qr_results]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"QR Code não contém URI TOTP válida (otpauth://...). Encontrado: {found_data}",
        )

    logger.info(
        "TOTP URI decoded: %s",
        totp_uri,
        extra={"cert_id": str(cert_id), "tenant_id": str(tenant_id)},
    )

    # Parse secret from URI
    parsed = urlparse(totp_uri)
    params = parse_qs(parsed.query)
    secret = params.get("secret", [None])[0]
    algorithm = params.get("algorithm", ["SHA1"])[0].upper()
    digits = int(params.get("digits", ["6"])[0])
    period = int(params.get("period", ["30"])[0])

    if not secret:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"URI TOTP não contém parâmetro 'secret'. URI: {totp_uri[:200]}",
        )

    # Validate base32
    secret_upper = secret.upper()
    try:
        base64.b32decode(secret_upper)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Segredo TOTP não é base32 válido.",
        )

    # Build JSON payload with all TOTP params (not just secret)
    import json

    totp_payload = json.dumps({
        "secret": secret_upper,
        "algorithm": algorithm,
        "digits": digits,
        "period": period,
        "issuer": params.get("issuer", [None])[0],
        "uri": totp_uri,
    })

    # Encrypt and store full TOTP config
    crypto = _get_crypto_service()
    totp_encrypted = crypto.encrypt(totp_payload.encode())
    await repo.update(cert_id, totp_secret_encrypted=totp_encrypted)
    await session.commit()

    logger.info(
        "Certificate TOTP configured via QR (algo=%s, digits=%d, period=%ds)",
        algorithm,
        digits,
        period,
        extra={"cert_id": str(cert_id), "tenant_id": str(tenant_id)},
    )

    masked = secret_upper[:4] + "****" + secret_upper[-4:] if len(secret_upper) > 8 else "****"
    return {
        "mensagem": "TOTP configurado com sucesso",
        "secret_masked": masked,
        "algorithm": algorithm,
        "digits": digits,
        "period": period,
    }
