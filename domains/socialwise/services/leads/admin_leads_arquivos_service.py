"""Business logic for the Leads admin group (B.7.5d — Arquivos + Documentos).

Port of:
- app/api/admin/leads-chatwit/arquivos/route.ts (GET, POST, DELETE, PATCH)
- app/api/admin/leads-chatwit/upload-files/route.ts (POST)
- app/api/admin/leads-chatwit/unify/route.ts (GET, POST)
- app/api/admin/leads-chatwit/enviar-pdf-analise-lead/route.ts (POST)
- app/api/admin/leads-chatwit/enviar-pdf-recurso-lead/route.ts (POST)
- app/api/admin/leads-chatwit/recebearquivos/route.ts (POST, GET)
"""

from __future__ import annotations

import asyncio
import io
import json
import re
import time
from typing import Any
from urllib.parse import unquote, urlparse

import httpx
from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas
from sqlalchemy import delete as sa_delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.arquivo_lead_oab import ArquivoLeadOab
from domains.socialwise.db.models.lead import Lead
from domains.socialwise.db.models.lead_oab_data import LeadOabData
from domains.socialwise.db.models.usuario_chatwit import UsuarioChatwit
from platform_core.config import settings
from platform_core.logging.config import get_logger
from platform_core.services.storage import (
    delete_s3_object,
    upload_bytes_to_bucket,
)

logger = get_logger(__name__)

SOCIALWISE_BUCKET = "socialwise"


class ArquivosServiceError(Exception):
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _object_key_from_url(url: str) -> str | None:
    """Extract the object key (last path component) from an objstoreapi S3 URL."""
    if not url or "objstoreapi" not in url:
        return None
    parts = url.split("/")
    return parts[-1] if parts else None


def _extract_chatwit_ids(lead_url: str) -> tuple[str, str]:
    """Extract accountId and conversationId from a Chatwit lead URL.

    URL format: https://.../accounts/{accountId}/conversations/{conversationId}
    """
    parsed = urlparse(lead_url)
    segments = parsed.path.strip("/").split("/")
    # Expected: [..., 'accounts', <id>, 'conversations', <id>]
    try:
        acc_idx = segments.index("accounts")
        account_id = segments[acc_idx + 1]
        conv_idx = segments.index("conversations")
        conversation_id = segments[conv_idx + 1]
        return account_id, conversation_id
    except (ValueError, IndexError) as exc:
        raise ArquivosServiceError(f"leadUrl fora do formato esperado: {lead_url}") from exc


def _extract_file_extension(url: str) -> str:
    """Extract the real file extension from a URL, ignoring query params."""
    if not url:
        return ""
    try:
        clean = url.split("?")[0].split("#")[0]
        clean = re.sub(r"-filename[_*]+.*$", "", clean)
        parsed = urlparse(clean)
        ext = parsed.path.rsplit(".", 1)[-1].lower() if "." in parsed.path else ""
        return ext
    except Exception:
        return ""


async def _download_file(url: str) -> tuple[bytes, str, str]:
    """Download a remote file. Returns (data, content_type, filename)."""
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "application/octet-stream")
        parsed = urlparse(url)
        filename = unquote(parsed.path.split("/")[-1]) if parsed.path else "file"
        return resp.content, content_type, filename


async def _delete_minio_object_safe(url: str) -> None:
    """Try to delete an object from MinIO by its URL. Logs and swallows errors."""
    key = _object_key_from_url(url)
    if not key:
        return
    try:
        delete_s3_object(f"{key}")
        logger.info("minio_object_deleted", key=key)
    except Exception as exc:
        logger.warning("minio_delete_failed", key=key, error=str(exc))


def _upload_to_socialwise_bucket(data: bytes, filename: str, content_type: str) -> str:
    """Upload bytes to the socialwise bucket. Returns full URL."""
    return upload_bytes_to_bucket(SOCIALWISE_BUCKET, filename, data, content_type)


# ---------------------------------------------------------------------------
# 1. Arquivos CRUD
# ---------------------------------------------------------------------------


async def list_arquivos(
    session: AsyncSession,
    lead_id: str | None = None,
    usuario_id: str | None = None,
) -> list[dict[str, Any]]:
    """List arquivos for a specific lead or all leads of a user."""
    if not lead_id and not usuario_id:
        raise ArquivosServiceError("ID do lead ou ID do usuário é obrigatório")

    if lead_id:
        result = await session.execute(
            select(ArquivoLeadOab)
            .where(ArquivoLeadOab.lead_oab_data_id == lead_id)
            .order_by(ArquivoLeadOab.created_at.desc())
        )
        rows = result.scalars().all()
        return [
            {
                "id": r.id,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
                "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
                "leadId": r.lead_oab_data_id,
                "fileType": r.file_type,
                "dataUrl": r.data_url,
                "pdfConvertido": r.pdf_convertido,
            }
            for r in rows
        ]

    # By usuario_id
    leads_result = await session.execute(
        select(LeadOabData.id).where(LeadOabData.usuario_chatwit_id == usuario_id)
    )
    lead_ids = [row[0] for row in leads_result.all()]

    if not lead_ids:
        return []

    result = await session.execute(
        select(ArquivoLeadOab)
        .options(selectinload(ArquivoLeadOab.lead_oab_data))
        .where(ArquivoLeadOab.lead_oab_data_id.in_(lead_ids))
        .order_by(ArquivoLeadOab.created_at.desc())
    )
    rows = result.scalars().all()
    arquivos = []
    for r in rows:
        lead_data = r.lead_oab_data
        entry: dict[str, Any] = {
            "id": r.id,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
            "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
            "leadId": r.lead_oab_data_id,
            "fileType": r.file_type,
            "dataUrl": r.data_url,
            "pdfConvertido": r.pdf_convertido,
        }
        if lead_data:
            entry["lead"] = {
                "id": lead_data.id,
                "nomeReal": lead_data.nome_real,
                "name": None,
            }
        arquivos.append(entry)
    return arquivos


async def create_arquivo(
    session: AsyncSession,
    lead_id: str,
    file_type: str,
    data_url: str,
) -> dict[str, Any]:
    """Create a new arquivo record for a lead."""
    if not lead_id or not file_type or not data_url:
        raise ArquivosServiceError("ID do lead, tipo do arquivo e URL do arquivo são obrigatórios")

    lead = await session.get(LeadOabData, lead_id)
    if not lead:
        raise ArquivosServiceError("Lead não encontrado")

    from domains.socialwise.db.base import generate_cuid

    arquivo = ArquivoLeadOab(
        id=generate_cuid(),
        lead_oab_data_id=lead_id,
        file_type=file_type,
        data_url=data_url,
    )
    session.add(arquivo)
    await session.flush()
    return {
        "id": arquivo.id,
        "leadOabDataId": arquivo.lead_oab_data_id,
        "fileType": arquivo.file_type,
        "dataUrl": arquivo.data_url,
        "pdfConvertido": arquivo.pdf_convertido,
        "createdAt": arquivo.created_at.isoformat() if arquivo.created_at else None,
        "updatedAt": arquivo.updated_at.isoformat() if arquivo.updated_at else None,
    }


async def delete_arquivo(
    session: AsyncSession,
    arquivo_id: str | None,
    delete_type: str | None,
    lead_id: str | None,
    user_role: str,
) -> dict[str, Any]:
    """Delete an arquivo, unified PDF, or converted images."""
    if user_role not in ("ADMIN", "SUPERADMIN"):
        raise ArquivosServiceError("Unauthorized")

    if not arquivo_id and not lead_id:
        raise ArquivosServiceError("ID do arquivo ou do lead é obrigatório")

    # Delete specific arquivo
    if arquivo_id and delete_type == "arquivo":
        arquivo = await session.get(ArquivoLeadOab, arquivo_id)
        if not arquivo:
            raise ArquivosServiceError("Arquivo não encontrado")

        await _delete_minio_object_safe(arquivo.data_url or "")
        await session.delete(arquivo)
        await session.flush()
        return {"success": True, "message": "Arquivo excluído com sucesso"}

    # Delete unified PDF
    if lead_id and delete_type == "pdf":
        lead = await session.get(LeadOabData, lead_id)
        if not lead:
            raise ArquivosServiceError("Lead não encontrado")

        if lead.pdf_unificado:
            await _delete_minio_object_safe(lead.pdf_unificado)

        lead.pdf_unificado = None
        await session.flush()
        return {"success": True, "message": "PDF unificado excluído com sucesso"}

    # Delete converted images
    if lead_id and delete_type == "imagem":
        result = await session.execute(
            select(LeadOabData)
            .options(selectinload(LeadOabData.arquivos))
            .where(LeadOabData.id == lead_id)
        )
        lead = result.scalar_one_or_none()
        if not lead:
            raise ArquivosServiceError("Lead não encontrado")

        image_urls: set[str] = set()
        for arq in lead.arquivos:
            if arq.pdf_convertido and "objstoreapi" in arq.pdf_convertido:
                image_urls.add(arq.pdf_convertido)

        if lead.imagens_convertidas:
            try:
                parsed = json.loads(lead.imagens_convertidas)
                if isinstance(parsed, list):
                    for url in parsed:
                        if isinstance(url, str) and "objstoreapi" in url:
                            image_urls.add(url)
            except (json.JSONDecodeError, TypeError):
                pass

        for url in image_urls:
            await _delete_minio_object_safe(url)

        # Clear pdfConvertido on all arquivos
        await session.execute(
            update(ArquivoLeadOab)
            .where(ArquivoLeadOab.lead_oab_data_id == lead_id)
            .values(pdf_convertido=None)
        )
        lead.imagens_convertidas = None
        await session.flush()
        return {"success": True, "message": "Imagens convertidas excluídas com sucesso"}

    raise ArquivosServiceError("Tipo de exclusão inválido")


async def patch_arquivo(
    session: AsyncSession,
    arquivo_id: str,
    pdf_convertido: str | None = None,
) -> dict[str, Any]:
    """Update an arquivo (e.g. add converted PDF URL)."""
    if not arquivo_id:
        raise ArquivosServiceError("ID do arquivo é obrigatório")

    arquivo = await session.get(ArquivoLeadOab, arquivo_id)
    if not arquivo:
        raise ArquivosServiceError("Arquivo não encontrado")

    if pdf_convertido is not None:
        arquivo.pdf_convertido = pdf_convertido

    await session.flush()
    return {
        "id": arquivo.id,
        "leadOabDataId": arquivo.lead_oab_data_id,
        "fileType": arquivo.file_type,
        "dataUrl": arquivo.data_url,
        "pdfConvertido": arquivo.pdf_convertido,
        "createdAt": arquivo.created_at.isoformat() if arquivo.created_at else None,
        "updatedAt": arquivo.updated_at.isoformat() if arquivo.updated_at else None,
    }


# ---------------------------------------------------------------------------
# 2. Upload Files
# ---------------------------------------------------------------------------


async def upload_files(
    session: AsyncSession,
    lead_id: str,
    files: list[tuple[str, bytes, str]],  # (filename, data, content_type)
) -> list[dict[str, Any]]:
    """Upload multiple files to MinIO and create arquivo records."""
    if not lead_id:
        raise ArquivosServiceError("ID do lead é obrigatório")

    lead = await session.get(LeadOabData, lead_id)
    if not lead:
        raise ArquivosServiceError("Lead não encontrado")

    if not files:
        raise ArquivosServiceError("Nenhum arquivo fornecido")

    from domains.socialwise.db.base import generate_cuid

    uploaded: list[dict[str, Any]] = []
    for filename, data, content_type in files:
        try:
            # Generate unique filename
            ts = int(time.time() * 1000)
            safe_name = re.sub(r"[^\w.\-]", "_", filename)
            s3_key = f"leads/{lead_id}/{ts}_{safe_name}"
            url = _upload_to_socialwise_bucket(data, s3_key, content_type)

            arquivo = ArquivoLeadOab(
                id=generate_cuid(),
                lead_oab_data_id=lead_id,
                file_type=content_type or "application/octet-stream",
                data_url=url,
            )
            session.add(arquivo)
            await session.flush()

            uploaded.append({
                "id": arquivo.id,
                "fileType": arquivo.file_type,
                "dataUrl": arquivo.data_url,
                "originalName": filename,
                "thumbnailUrl": None,
            })
            logger.info("file_uploaded", filename=filename, lead_id=lead_id)
        except Exception as exc:
            logger.error("file_upload_failed", filename=filename, error=str(exc))

    if not uploaded:
        raise ArquivosServiceError("Falha ao fazer upload de todos os arquivos")

    return uploaded


# ---------------------------------------------------------------------------
# 3. Unify (PDF merger)
# ---------------------------------------------------------------------------


async def get_unified_pdf_url(
    session: AsyncSession,
    lead_id: str | None = None,
    usuario_id: str | None = None,
) -> str:
    """Get the URL of the unified PDF for a lead or user."""
    if not lead_id and not usuario_id:
        raise ArquivosServiceError("ID do lead ou do usuário é obrigatório")

    if lead_id:
        lead = await session.get(LeadOabData, lead_id)
        if not lead or not lead.pdf_unificado:
            raise ArquivosServiceError("PDF unificado não encontrado para esse lead")
        return lead.pdf_unificado

    # By usuario
    result = await session.execute(
        select(LeadOabData)
        .where(
            LeadOabData.usuario_chatwit_id == usuario_id,
            LeadOabData.pdf_unificado.isnot(None),
        )
        .limit(1)
    )
    lead = result.scalar_one_or_none()
    if not lead or not lead.pdf_unificado:
        raise ArquivosServiceError("Nenhum PDF unificado encontrado para esse usuário")
    return lead.pdf_unificado


async def unify_files(
    session: AsyncSession,
    lead_id: str | None = None,
    usuario_id: str | None = None,
) -> dict[str, Any]:
    """Unify multiple arquivos into a single PDF."""
    if not lead_id and not usuario_id:
        raise ArquivosServiceError("ID do lead ou do usuário é obrigatório")

    arquivos: list[ArquivoLeadOab] = []

    if lead_id:
        result = await session.execute(
            select(ArquivoLeadOab).where(ArquivoLeadOab.lead_oab_data_id == lead_id)
        )
        arquivos = list(result.scalars().all())

        if not arquivos:
            raise ArquivosServiceError("Nenhum arquivo encontrado para esse lead")

        # Optimization: single PDF → use directly
        if len(arquivos) == 1 and arquivos[0].file_type.lower() == "pdf":
            single = arquivos[0]
            lead = await session.get(LeadOabData, lead_id)
            if lead:
                lead.pdf_unificado = single.data_url
                await session.flush()
            return {
                "success": True,
                "message": "PDF único definido como unificado (sem processamento necessário)",
                "pdfUrl": single.data_url,
                "optimized": True,
            }

        filename = f"lead_{lead_id}_unificado_{int(time.time() * 1000)}.pdf"

    else:
        # All leads of a user
        leads_result = await session.execute(
            select(LeadOabData)
            .options(selectinload(LeadOabData.arquivos))
            .where(LeadOabData.usuario_chatwit_id == usuario_id)
        )
        leads = leads_result.scalars().all()
        for ld in leads:
            arquivos.extend(ld.arquivos)

        if not arquivos:
            raise ArquivosServiceError("Nenhum arquivo encontrado para os leads desse usuário")

        filename = f"usuario_{usuario_id}_todos_leads_unificado_{int(time.time() * 1000)}.pdf"

    # Download all files in parallel
    file_entries = [
        {"url": arq.data_url, "name": f"arquivo_{arq.id}.{arq.file_type}"}
        for arq in arquivos
    ]

    logger.info("unify_starting", count=len(file_entries))
    pdf_buffer = await _unify_files_to_pdf(file_entries)

    # Upload unified PDF
    s3_key = f"unified/{filename}"
    pdf_url = _upload_to_socialwise_bucket(pdf_buffer, s3_key, "application/pdf")

    # Update lead record
    if lead_id:
        lead = await session.get(LeadOabData, lead_id)
        if lead:
            lead.pdf_unificado = pdf_url
            await session.flush()

    logger.info("unify_complete", pdf_url=pdf_url, files=len(file_entries))
    return {
        "success": True,
        "message": "Arquivos unificados com sucesso",
        "pdfUrl": pdf_url,
        "filesProcessed": len(file_entries),
    }


async def _download_file_for_unify(
    client: httpx.AsyncClient, url: str, name: str
) -> dict[str, Any] | None:
    """Download a single file for the unify pipeline."""
    try:
        ext = _extract_file_extension(url)
        image_exts = {"jpg", "jpeg", "png"}
        is_image = ext in image_exts
        is_pdf = ext == "pdf"

        if not is_image and not is_pdf and "fbsbx.com" not in url:
            logger.debug("unify_skip_unsupported", url=url)
            return None

        file_url = url
        if "fbsbx.com" in file_url:
            match = re.search(r"asset_id=(\d+)", file_url)
            if match:
                file_url = f"https://www.facebook.com/messenger_media/?thread_id={match.group(1)}"

        resp = await client.get(file_url)
        if resp.status_code != 200:
            logger.warning("unify_download_failed", url=file_url, status=resp.status_code)
            return None

        content_type = resp.headers.get("content-type", "")
        file_type = "image"
        if is_pdf or "pdf" in content_type:
            file_type = "pdf"

        return {
            "name": name,
            "type": file_type,
            "data": resp.content,
            "content_type": content_type,
        }
    except Exception as exc:
        logger.error("unify_download_error", name=name, error=str(exc))
        return None


async def _unify_files_to_pdf(files: list[dict[str, str]]) -> bytes:
    """Merge multiple PDFs and images into a single PDF.

    Port of: app/api/admin/leads-chatwit/unify/utils.ts → unifyFilesToPdf()
    Uses pypdf for PDF merging and reportlab+Pillow for image embedding.
    """
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        tasks = [_download_file_for_unify(client, f["url"], f["name"]) for f in files]
        results = await asyncio.gather(*tasks)

    valid = [r for r in results if r is not None]
    if not valid:
        raise ArquivosServiceError("Nenhum arquivo válido encontrado para unificação.")

    writer = PdfWriter()

    # Pass 1: PDFs
    for f in valid:
        if f["type"] != "pdf":
            continue
        try:
            reader = PdfReader(io.BytesIO(f["data"]))
            for page in reader.pages:
                writer.add_page(page)
        except Exception as exc:
            logger.warning("unify_pdf_error", name=f["name"], error=str(exc))

    # Pass 2: Images → embed into A4 pages via reportlab
    for f in valid:
        if f["type"] != "image":
            continue
        try:
            img = Image.open(io.BytesIO(f["data"]))
            page_w, page_h = A4  # 595.28, 841.89

            img_w, img_h = img.size
            ratio = min(page_w / img_w, page_h / img_h)
            scaled_w = img_w * ratio
            scaled_h = img_h * ratio

            buf = io.BytesIO()
            c = rl_canvas.Canvas(buf, pagesize=A4)
            img_reader = ImageReader(io.BytesIO(f["data"]))
            c.drawImage(
                img_reader,
                (page_w - scaled_w) / 2,
                (page_h - scaled_h) / 2,
                width=scaled_w,
                height=scaled_h,
            )
            c.showPage()
            c.save()
            buf.seek(0)

            reader = PdfReader(buf)
            for page in reader.pages:
                writer.add_page(page)
        except Exception as exc:
            logger.warning("unify_image_error", name=f["name"], error=str(exc))

    if len(writer.pages) == 0:
        raise ArquivosServiceError("Não foi possível processar nenhum dos arquivos fornecidos.")

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


# ---------------------------------------------------------------------------
# 4. Enviar PDF (Análise / Recurso) to Chatwit
# ---------------------------------------------------------------------------


async def _resolve_access_token(
    session: AsyncSession,
    source_id: str,
    explicit_token: str | None,
) -> str:
    """Resolve the Chatwit access token: explicit → user's token → env default."""
    if explicit_token:
        return explicit_token

    # Try user's saved token via explicit join
    result = await session.execute(
        select(UsuarioChatwit.chatwit_access_token)
        .join(LeadOabData, LeadOabData.usuario_chatwit_id == UsuarioChatwit.id)
        .where(LeadOabData.lead_id == source_id)
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if row:
        return row

    # Env default
    default = settings.chatwit_access_token
    if not default:
        raise ArquivosServiceError("Token de acesso não configurado")
    return default


async def enviar_pdf_analise(
    session: AsyncSession,
    source_id: str,
    message: str = "Segue o documento em anexo.",
    access_token: str | None = None,
) -> dict[str, Any]:
    """Send the análise PDF to the Chatwit conversation.

    Priority: analiseUrl → pdfUnificado → first PDF arquivo.
    """
    result = await session.execute(
        select(LeadOabData)
        .options(selectinload(LeadOabData.arquivos))
        .where(LeadOabData.lead_id == source_id)
    )
    lead = result.scalar_one_or_none()
    if not lead or not lead.lead_url:
        raise ArquivosServiceError("Lead não encontrado ou sem leadUrl")

    token = await _resolve_access_token(session, source_id, access_token)

    pdf_url = (
        lead.analise_url
        or lead.pdf_unificado
        or next(
            (a.data_url for a in lead.arquivos if a.file_type == "pdf"),
            None,
        )
    )
    if not pdf_url:
        raise ArquivosServiceError("Nenhum PDF disponível para este lead")

    account_id, conversation_id = _extract_chatwit_ids(lead.lead_url)

    file_data, mime, filename = await _download_file(pdf_url)

    chatwit_base = settings.chatwit_base_url or "https://chatwit.witdev.com.br"
    chatwit_url = f"{chatwit_base}/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages"

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            chatwit_url,
            headers={"api_access_token": token},
            data={"content": message, "message_type": "outgoing"},
            files={"attachments[]": (filename, file_data, mime)},
        )
        resp.raise_for_status()
        cw_data = resp.json()

    # Update anotações
    lead.anotacoes = message
    await session.flush()

    # Persist custom token if provided
    if access_token and access_token != settings.chatwit_access_token:
        usr_result = await session.execute(
            select(UsuarioChatwit)
            .join(LeadOabData, LeadOabData.usuario_chatwit_id == UsuarioChatwit.id)
            .where(LeadOabData.lead_id == source_id)
            .limit(1)
        )
        usr = usr_result.scalar_one_or_none()
        if usr:
            usr.chatwit_access_token = access_token
            await session.flush()

    return {"ok": True, "chatwoot": cw_data}


async def enviar_pdf_recurso(
    session: AsyncSession,
    source_id: str,
    message: str = "Segue o nosso Recurso, qualquer dúvida estamos à disposição.",
    access_token: str | None = None,
) -> dict[str, Any]:
    """Send the recurso PDF to the Chatwit conversation.

    Priority: recursoUrl → pdfUnificado → first PDF arquivo.
    Uses usuarioChatwit.chatwitAccountId for the Chatwit account.
    """
    result = await session.execute(
        select(LeadOabData)
        .options(selectinload(LeadOabData.arquivos))
        .where(LeadOabData.lead_id == source_id)
    )
    lead = result.scalar_one_or_none()
    if not lead or not lead.lead_url:
        raise ArquivosServiceError("Lead não encontrado ou sem leadUrl")

    # Get account ID from usuario_chatwit via explicit join
    usr_result = await session.execute(
        select(UsuarioChatwit.chatwit_account_id)
        .join(LeadOabData, LeadOabData.usuario_chatwit_id == UsuarioChatwit.id)
        .where(LeadOabData.lead_id == source_id)
        .limit(1)
    )
    account_id = usr_result.scalar_one_or_none()
    if not account_id:
        raise ArquivosServiceError("Usuário Chatwit não configurado")

    token = access_token or settings.chatwit_access_token
    if not token:
        raise ArquivosServiceError("Token de acesso não configurado")

    pdf_url = (
        lead.recurso_url
        or lead.pdf_unificado
        or next(
            (a.data_url for a in lead.arquivos if a.file_type == "pdf"),
            None,
        )
    )
    if not pdf_url:
        raise ArquivosServiceError("Nenhum PDF de recurso disponível para este lead")

    _, conversation_id = _extract_chatwit_ids(lead.lead_url)

    file_data, mime, filename = await _download_file(pdf_url)

    chatwit_base = settings.chatwit_base_url or "https://chatwit.witdev.com.br"
    chatwit_url = f"{chatwit_base}/api/v1/accounts/{account_id}/conversations/{conversation_id}/messages"

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            chatwit_url,
            headers={"api_access_token": token},
            data={"content": message, "message_type": "outgoing"},
            files={"attachments[]": (filename, file_data, mime)},
        )
        resp.raise_for_status()
        cw_data = resp.json()

    lead.anotacoes = message
    await session.flush()

    return {"ok": True, "chatwoot": cw_data}


# ---------------------------------------------------------------------------
# 5. Receber Arquivos (lead sync webhook)
# ---------------------------------------------------------------------------


async def recebearquivos_health() -> dict[str, Any]:
    """Health check for the recebearquivos endpoint."""
    return {
        "status": "Webhook operante - processando direto (sem fila)",
        "mode": "direct",
        "supportedEvents": [
            "contact_created",
            "contact_updated",
            "lead_files_sync",
            "legacy_message_with_attachments",
        ],
    }


async def recebearquivos_process(
    session: AsyncSession,
    raw_payload: dict[str, Any],
) -> dict[str, Any]:
    """Process incoming lead sync webhook from Chatwit.

    Port of: app/api/admin/leads-chatwit/recebearquivos/route.ts (POST)
    """
    from domains.socialwise.services.flow.payment_handler import handle_payment_confirmed
    from domains.socialwise.services.leads.normalize_payload import (
        normalize_chatwit_lead_sync_payload,
    )
    from domains.socialwise.services.leads.process_sync import process_chatwit_lead_sync

    # Check payment confirmation
    event = raw_payload.get("event")
    if event == "payment_confirmed" or (
        isinstance(raw_payload.get("data"), dict)
        and raw_payload["data"].get("event") == "payment_confirmed"
    ):
        result = await handle_payment_confirmed(raw_payload)
        return {"success": True, **result}

    # Normalize
    try:
        normalized = normalize_chatwit_lead_sync_payload(raw_payload)
    except Exception as exc:
        return {
            "success": True,
            "skipped": True,
            "reason": "unsupported_payload",
            "details": str(exc),
        }

    if normalized.skip_reason:
        return {
            "success": True,
            "skipped": True,
            "reason": normalized.skip_reason,
            "event": normalized.event,
            "syncMode": normalized.mode,
        }

    payload = normalized.payload
    if not payload or not payload.origem_lead.get("source_id"):
        return {"success": False, "error": "source_id ausente após sanitização", "_status_code": 400}

    # Convert dataclass to dict for process_chatwit_lead_sync
    payload_dict = {"usuario": payload.usuario, "origem_lead": payload.origem_lead}

    # Direct processing (default)
    result = await process_chatwit_lead_sync(session, payload_dict)

    return {
        "success": True,
        "processed": True,
        "mode": "direct",
        "event": normalized.event,
        "syncMode": normalized.mode,
        "leadId": result.lead_id,
        "arquivos": result.arquivos,
        "leadCreated": result.lead_created,
        "sourceId": payload.origem_lead.get("source_id"),
    }
