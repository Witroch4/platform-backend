"""Business logic for the Leads admin group (B.7.5b — Manuscrito + Espelho).

Port of:
- app/api/admin/leads-chatwit/manuscrito/route.ts (PUT, DELETE)
- app/api/admin/leads-chatwit/enviar-manuscrito/route.ts (POST)
- app/api/admin/leads-chatwit/convert-to-images/route.ts (POST, GET)
- app/api/admin/leads-chatwit/deletar-espelho/route.ts (DELETE, PUT)
- app/api/admin/leads-chatwit/espelhos-padrao/route.ts (GET, POST, PUT)
- app/api/admin/leads-chatwit/biblioteca-espelhos/route.ts (GET, POST, PUT, DELETE)
- app/api/admin/leads-chatwit/associar-espelho/route.ts (POST)
- app/api/admin/leads-chatwit/oab-rubrics/route.ts (GET)
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.arquivo_lead_oab import ArquivoLeadOab
from domains.socialwise.db.models.espelho_biblioteca import EspelhoBiblioteca
from domains.socialwise.db.models.espelho_padrao import EspelhoPadrao
from domains.socialwise.db.models.lead import Lead
from domains.socialwise.db.models.lead_oab_data import LeadOabData
from domains.socialwise.db.models.oab_rubric import OabRubric
from domains.socialwise.db.models.usuario_chatwit import UsuarioChatwit
from platform_core.logging.config import get_logger
from platform_core.services.storage import upload_bytes_to_s3

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

UPLOAD_CONCURRENCY = 6
RENDER_PARALLELISM = 3
IMAGE_MAX_DIMENSION = 2048
IMAGE_JPEG_QUALITY = 80


class ManuscritoServiceError(Exception):
    pass


# ---------------------------------------------------------------------------
# manuscrito/route.ts — PUT + DELETE
# ---------------------------------------------------------------------------


async def update_manuscrito(session: AsyncSession, lead_id: str, texto: Any) -> dict:
    """Update manuscript text and mark as processed."""
    if not lead_id or texto is None:
        raise ManuscritoServiceError("Lead ID e texto são obrigatórios")

    await session.execute(
        update(LeadOabData)
        .where(LeadOabData.id == lead_id)
        .values(prova_manuscrita=texto, manuscrito_processado=True)
    )
    await session.commit()

    return {"success": True, "message": "Manuscrito atualizado com sucesso"}


async def delete_manuscrito(session: AsyncSession, lead_id: str) -> dict:
    """Delete manuscript and cascade-reset analysis/espelho fields."""
    if not lead_id:
        raise ManuscritoServiceError("Lead ID é obrigatório")

    await session.execute(
        update(LeadOabData)
        .where(LeadOabData.id == lead_id)
        .values(
            prova_manuscrita=None,
            manuscrito_processado=False,
            aguardando_manuscrito=False,
            analise_url=None,
            analise_processada=False,
            aguardando_analise=False,
            analise_preliminar=None,
            analise_validada=False,
            consultoria_fase2=False,
            aguardando_espelho=False,
            espelho_processado=False,
        )
    )
    await session.commit()

    return {"success": True, "message": "Manuscrito excluído com sucesso"}


# ---------------------------------------------------------------------------
# deletar-espelho/route.ts — DELETE + PUT
# ---------------------------------------------------------------------------


async def delete_espelho(session: AsyncSession, lead_id: str) -> dict:
    """Delete espelho correction from lead."""
    if not lead_id:
        raise ManuscritoServiceError("ID do lead é obrigatório")

    await session.execute(
        update(LeadOabData)
        .where(LeadOabData.id == lead_id)
        .values(
            espelho_correcao=None,
            texto_do_espelho=None,
            espelho_processado=False,
            aguardando_espelho=False,
        )
    )
    await session.commit()

    return {"success": True, "message": "Espelho excluído com sucesso"}


async def save_espelho(
    session: AsyncSession, lead_id: str, texto: Any | None, imagens: Any | None
) -> dict:
    """Save espelho correction text and images."""
    if not lead_id:
        raise ManuscritoServiceError("ID do lead é obrigatório")

    espelho_correcao = json.dumps(imagens) if imagens else None
    espelho_processado = bool(texto or (imagens and len(imagens) > 0))

    await session.execute(
        update(LeadOabData)
        .where(LeadOabData.id == lead_id)
        .values(
            texto_do_espelho=texto if texto else None,
            espelho_correcao=espelho_correcao,
            espelho_processado=espelho_processado,
            aguardando_espelho=False,
        )
    )
    await session.commit()

    return {"success": True, "message": "Espelho salvo com sucesso"}


# ---------------------------------------------------------------------------
# enviar-manuscrito/route.ts — POST
# ---------------------------------------------------------------------------


async def _resolve_lead(
    session: AsyncSession, lead_id: str | None, telefone: str | None, espelho_biblioteca_id: str | None
) -> LeadOabData | None:
    """Multi-strategy lead resolution: ID -> phone -> espelhoBibliotecaId."""
    if lead_id:
        result = await session.execute(
            select(LeadOabData)
            .options(selectinload(LeadOabData.lead))
            .where(LeadOabData.id == lead_id)
        )
        lead = result.scalar_one_or_none()
        if lead:
            return lead

    # Fallback: phone
    if telefone:
        result = await session.execute(
            select(LeadOabData)
            .join(Lead)
            .options(selectinload(LeadOabData.lead))
            .where(Lead.phone == telefone)
        )
        lead = result.scalar_one_or_none()
        if lead:
            return lead

    # Fallback: espelhoBibliotecaId
    if espelho_biblioteca_id:
        result = await session.execute(
            select(LeadOabData)
            .options(selectinload(LeadOabData.lead))
            .where(LeadOabData.espelho_biblioteca_id == espelho_biblioteca_id)
        )
        lead = result.scalar_one_or_none()
        if lead:
            return lead

    # Final: leadId might actually be an espelhoBibliotecaId
    if lead_id:
        result = await session.execute(
            select(LeadOabData)
            .options(selectinload(LeadOabData.lead))
            .where(LeadOabData.espelho_biblioteca_id == lead_id)
        )
        lead = result.scalar_one_or_none()
        if lead:
            return lead

    return None


async def _resolve_espelho_padrao(
    session: AsyncSession,
    espelho_padrao_id: str | None,
    especialidade: str | None,
    is_espelho: bool,
    is_manuscrito: bool,
) -> tuple[str | None, str | None]:
    """Resolve espelho padrão text and ID.

    Returns (espelho_padrao_texto, espelho_padrao_id).
    """
    if espelho_padrao_id:
        # Try OabRubric first (local agent)
        result = await session.execute(
            select(OabRubric).where(OabRubric.id == espelho_padrao_id)
        )
        rubric = result.scalar_one_or_none()
        if rubric:
            # OabRubric — agent generates dynamically, no textoMarkdown
            return None, espelho_padrao_id

        # Fallback: EspelhoPadrao (legacy)
        result = await session.execute(
            select(EspelhoPadrao).where(EspelhoPadrao.id == espelho_padrao_id)
        )
        padrao = result.scalar_one_or_none()
        if padrao and padrao.texto_markdown:
            return padrao.texto_markdown, espelho_padrao_id

    elif especialidade and (is_espelho or is_manuscrito):
        # Auto-resolve by specialty (legacy behavior)
        result = await session.execute(
            select(EspelhoPadrao)
            .where(
                EspelhoPadrao.especialidade == especialidade,
                EspelhoPadrao.is_ativo.is_(True),
                EspelhoPadrao.processado.is_(True),
            )
            .order_by(EspelhoPadrao.updated_at.desc())
            .limit(1)
        )
        padrao = result.scalar_one_or_none()
        if padrao and padrao.texto_markdown:
            return padrao.texto_markdown, None

    return None, None


async def enviar_documento(session: AsyncSession, payload: dict[str, Any]) -> dict:
    """Submit manuscript, mirror, or proof for processing.

    For local agents, enqueues TaskIQ jobs. For legacy, fires webhook.
    """
    from platform_core.config import settings

    lead_id = payload.get("leadID")
    espelho_biblioteca_id = payload.get("espelhoBibliotecaId")
    telefone = payload.get("telefone")

    is_manuscrito = payload.get("manuscrito") is True
    is_espelho = (
        payload.get("espelho") is True
        or payload.get("espelhoconsultoriafase2") is True
        or payload.get("espelhoparabiblioteca") is True
    )
    is_prova = payload.get("prova") is True
    is_espelho_biblioteca = payload.get("espelhoparabiblioteca") is True
    is_recurso = payload.get("recurso") is True

    doc_type = (
        "Manuscrito" if is_manuscrito
        else "Espelho para Biblioteca" if is_espelho_biblioteca
        else "Espelho" if is_espelho
        else "Prova" if is_prova
        else "Recurso" if is_recurso
        else "Documento"
    )

    resolved_lead_id: str | None = lead_id
    espelho_padrao_texto: str | None = None
    espelho_padrao_id: str | None = payload.get("espelhoPadraoId")

    if is_espelho_biblioteca:
        logger.info("enviar_documento_biblioteca", espelho_biblioteca_id=espelho_biblioteca_id)
    elif is_recurso:
        logger.info("enviar_documento_recurso", lead_id=lead_id)
    elif lead_id:
        lead = await _resolve_lead(session, lead_id, telefone, espelho_biblioteca_id)
        if not lead:
            raise ManuscritoServiceError("Lead não encontrado")

        resolved_lead_id = lead.id

        # Resolve espelhoPadraoId from payload or DB
        if not espelho_padrao_id and lead.espelho_padrao_id:
            espelho_padrao_id = lead.espelho_padrao_id

        espelho_padrao_texto, espelho_padrao_id = await _resolve_espelho_padrao(
            session, espelho_padrao_id, lead.especialidade, is_espelho, is_manuscrito
        )

        # Mark lead as awaiting processing
        if is_manuscrito and not is_espelho and not is_prova:
            if not resolved_lead_id:
                raise ManuscritoServiceError("Lead não identificado para atualização de manuscrito")
            await session.execute(
                update(LeadOabData)
                .where(LeadOabData.id == resolved_lead_id)
                .values(manuscrito_processado=False, aguardando_manuscrito=True)
            )
            await session.commit()
        elif is_espelho and not is_manuscrito and not is_prova:
            if not resolved_lead_id:
                raise ManuscritoServiceError("Lead não identificado para atualização de espelho")
            await session.execute(
                update(LeadOabData)
                .where(LeadOabData.id == resolved_lead_id)
                .values(espelho_processado=False, aguardando_espelho=True)
            )
            await session.commit()

    # Decide processing mode: local agent vs legacy webhook
    use_local_transcriber = getattr(settings, "oab_agent_local", False)
    use_local_mirror = getattr(settings, "oab_agent_local_espelho", False)

    should_use_local_manuscrito = use_local_transcriber and is_manuscrito and not is_espelho and not is_prova
    should_use_local_mirror = use_local_mirror and is_espelho and not is_manuscrito and not is_prova

    if should_use_local_manuscrito:
        return await _enqueue_transcription(session, payload, resolved_lead_id)

    if should_use_local_mirror:
        return await _enqueue_mirror(session, payload, resolved_lead_id, espelho_padrao_id)

    # Legacy webhook fallback
    webhook_url = os.environ.get("WEBHOOK_URL")
    if not webhook_url:
        raise ManuscritoServiceError("URL do webhook não configurada")

    payload_final = {**payload}
    if espelho_padrao_texto and (is_espelho or is_manuscrito):
        payload_final["espelhoPadraoTexto"] = espelho_padrao_texto.strip()

    # Fire-and-forget to legacy webhook
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(webhook_url, json=payload_final)
    except Exception as e:
        logger.warning("legacy_webhook_failed", error=str(e))

    return {
        "success": True,
        "message": f"{doc_type} processado com sucesso",
        "mode": "legacy-webhook",
    }


async def _enqueue_transcription(
    session: AsyncSession, payload: dict, resolved_lead_id: str | None
) -> dict:
    """Enqueue transcription task via TaskIQ."""
    from domains.socialwise.tasks.transcription import process_transcription_task

    if not resolved_lead_id:
        raise ManuscritoServiceError("Lead não identificado para processamento local do manuscrito")

    images_raw = payload.get("arquivos_imagens_manuscrito", [])
    if not isinstance(images_raw, list) or not images_raw:
        raise ManuscritoServiceError("Nenhuma imagem do manuscrito foi fornecida")

    # Prepare images
    images = []
    for i, img in enumerate(images_raw):
        url = img.get("url") or img.get("dataUrl") or img.get("data_url", "")
        if url:
            images.append(url)

    if not images:
        raise ManuscritoServiceError("Imagens do manuscrito sem URL válida")

    selected_provider = payload.get("selectedProvider", "GEMINI")

    task_payload = {
        "leadId": resolved_lead_id,
        "images": images,
        "telefone": payload.get("telefone"),
        "nome": payload.get("nome"),
        "userId": payload.get("userId", "system"),
        "selectedProvider": selected_provider,
    }

    task = await process_transcription_task.kiq(task_payload)
    job_id = task.task_id

    return {
        "success": True,
        "message": "Manuscrito adicionado à fila de digitação",
        "mode": "queued",
        "jobId": job_id,
        "leadId": resolved_lead_id,
        "totalPages": len(images),
        "operation": {
            "jobId": job_id,
            "leadId": resolved_lead_id,
            "stage": "transcription",
            "statusUrl": f"/api/admin/leads-chatwit/operations/status?leadId={resolved_lead_id}&stage=transcription",
            "cancelUrl": "/api/admin/leads-chatwit/operations/cancel",
        },
    }


async def _enqueue_mirror(
    session: AsyncSession,
    payload: dict,
    resolved_lead_id: str | None,
    espelho_padrao_id: str | None,
) -> dict:
    """Enqueue mirror generation task via TaskIQ."""
    from domains.socialwise.tasks.mirror_generation import process_mirror_generation_task

    if not resolved_lead_id:
        raise ManuscritoServiceError("Lead não identificado para processamento local do espelho")

    # Fetch especialidade
    result = await session.execute(
        select(LeadOabData.especialidade).where(LeadOabData.id == resolved_lead_id)
    )
    especialidade = result.scalar_one_or_none()
    if not especialidade:
        raise ManuscritoServiceError("Lead sem especialidade definida.")

    # Collect images
    images_raw = payload.get("arquivos_imagens_espelho") or payload.get("arquivos", [])
    if not isinstance(images_raw, list) or not images_raw:
        raise ManuscritoServiceError("Nenhuma imagem do espelho foi fornecida")

    images = []
    for i, img in enumerate(images_raw):
        url = img.get("url") or img.get("dataUrl") or img.get("data_url", "")
        if url:
            images.append({
                "id": str(img.get("id", f"{resolved_lead_id}-espelho-{i}")),
                "url": url,
                "nome": img.get("nome", f"Espelho {i + 1}"),
                "page": i + 1,
            })

    if not images:
        raise ManuscritoServiceError("Imagens do espelho sem URL válida")

    selected_provider = payload.get("selectedProvider", "GEMINI")

    task_payload = {
        "leadId": resolved_lead_id,
        "especialidade": especialidade,
        "espelhoPadraoId": espelho_padrao_id,
        "images": images,
        "telefone": payload.get("telefone"),
        "nome": payload.get("nome"),
        "userId": payload.get("userId", "system"),
        "selectedProvider": selected_provider,
    }

    task = await process_mirror_generation_task.kiq(task_payload)
    job_id = task.task_id

    return {
        "success": True,
        "message": "Espelho adicionado à fila de processamento",
        "mode": "queued",
        "jobId": job_id,
        "leadId": resolved_lead_id,
        "totalImages": len(images),
        "especialidade": especialidade,
        "operation": {
            "jobId": job_id,
            "leadId": resolved_lead_id,
            "stage": "mirror",
            "statusUrl": f"/api/admin/leads-chatwit/operations/status?leadId={resolved_lead_id}&stage=mirror",
            "cancelUrl": "/api/admin/leads-chatwit/operations/cancel",
        },
    }


# ---------------------------------------------------------------------------
# convert-to-images/route.ts — POST + GET
# ---------------------------------------------------------------------------


def _fix_minio_url(url: str) -> str:
    """Fix MinIO URL domain if needed."""
    if not url:
        return url
    fixed = url
    if "objstore.witdev.com.br" in fixed:
        fixed = fixed.replace("objstore.witdev.com.br", "objstoreapi.witdev.com.br")
    if not fixed.startswith("http://") and not fixed.startswith("https://"):
        fixed = f"https://{fixed}"
    return fixed


async def _get_page_count(pdf_path: str) -> int:
    """Get PDF page count via pdfinfo."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "pdfinfo", pdf_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        for line in stdout.decode().splitlines():
            if line.lower().startswith("pages:"):
                pages = int(line.split(":")[1].strip())
                if pages > 0:
                    return pages
    except Exception:
        pass
    return 0


async def _render_page_range(
    pdf_path: str, output_dir: str, first_page: int, last_page: int, density: int
) -> list[str]:
    """Render PDF pages to JPEG via pdftoppm (tier 0) or GhostScript (tier 1)."""
    output_prefix = os.path.join(output_dir, "page")

    # Tier 0: pdftoppm
    range_flags = ["-f", str(first_page), "-l", str(last_page)] if first_page > 0 else []
    cmd = [
        "pdftoppm", "-jpeg", "-jpegopt", "quality=90", "-r", str(density),
        *range_flags, pdf_path, output_prefix,
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await asyncio.wait_for(proc.communicate(), timeout=120)
        files = sorted(
            f for f in os.listdir(output_dir)
            if f.startswith("page-") and f.endswith(".jpg")
        )
        if files:
            return files
    except Exception as e:
        logger.warning("pdftoppm_failed", range=f"{first_page}-{last_page}", error=str(e))

    # Tier 1: GhostScript
    gs_cmd = [
        "gs", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=jpeg", "-dJPEGQ=90",
        f"-r{density}", "-dGraphicsAlphaBits=4", "-dTextAlphaBits=4",
    ]
    if first_page > 0:
        gs_cmd.extend([f"-dFirstPage={first_page}", f"-dLastPage={last_page}"])
    gs_cmd.extend([f"-sOutputFile={output_prefix}-%d.jpg", pdf_path])

    proc = await asyncio.create_subprocess_exec(
        *gs_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await asyncio.wait_for(proc.communicate(), timeout=180)

    files = sorted(
        f for f in os.listdir(output_dir)
        if f.startswith("page-") and f.endswith(".jpg")
    )
    if not files:
        raise ManuscritoServiceError(f"Nenhum arquivo gerado para range {first_page}-{last_page}")
    return files


def _extract_page_number(filename: str) -> int:
    """Extract page number from 'page-01.jpg' style filenames."""
    import re
    match = re.search(r"page-(\d+)\.", filename)
    return int(match.group(1)) if match else 0


async def _optimize_image(raw_bytes: bytes) -> bytes:
    """Resize + recompress for AI vision (max 2048px, JPEG q80).

    Uses Pillow instead of sharp (Node.js equivalent).
    """
    from io import BytesIO

    from PIL import Image

    img = Image.open(BytesIO(raw_bytes))

    # Resize if larger than max dimension
    if max(img.size) > IMAGE_MAX_DIMENSION:
        img.thumbnail((IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION), Image.LANCZOS)

    # Convert to JPEG
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=IMAGE_JPEG_QUALITY, optimize=True)
    return buf.getvalue()


async def _upload_batch(
    files: list[str], output_dir: str, base_name: str
) -> list[dict[str, Any]]:
    """Upload rendered page images to MinIO in batches."""
    results: list[dict[str, Any]] = []

    for i in range(0, len(files), UPLOAD_CONCURRENCY):
        batch = files[i : i + UPLOAD_CONCURRENCY]
        batch_results = await asyncio.gather(
            *[_upload_single(f, output_dir, base_name) for f in batch]
        )
        results.extend(batch_results)

    return results


async def _upload_single(filename: str, output_dir: str, base_name: str) -> dict[str, Any]:
    """Read, optimize and upload a single page image."""
    file_path = os.path.join(output_dir, filename)
    raw_bytes = await asyncio.to_thread(Path(file_path).read_bytes)
    optimized = await _optimize_image(raw_bytes)

    s3_key = f"pdf-images/{base_name}_{filename}"
    url = upload_bytes_to_s3(s3_key, optimized, "image/jpeg")

    # Cleanup temp
    try:
        os.unlink(file_path)
    except OSError:
        pass

    return {"url": url, "page": _extract_page_number(filename)}


async def convert_pdf_to_images(
    session: AsyncSession, lead_id: str, pdf_urls: list[str] | None
) -> dict:
    """Convert PDF to optimized JPEG images for AI vision processing."""
    if not lead_id:
        raise ManuscritoServiceError("ID do lead é obrigatório")

    if not pdf_urls:
        # Fetch from DB
        result = await session.execute(
            select(LeadOabData.pdf_unificado).where(LeadOabData.id == lead_id)
        )
        pdf_unificado = result.scalar_one_or_none()
        if not pdf_unificado:
            raise ManuscritoServiceError("Nenhum PDF unificado encontrado para este lead")
        pdf_urls = [_fix_minio_url(pdf_unificado)]

    converted_urls: list[str] = []
    failed_urls: list[str] = []

    for pdf_url in pdf_urls:
        try:
            fixed_url = _fix_minio_url(pdf_url)
            if not fixed_url:
                failed_urls.append(pdf_url)
                continue

            # Download PDF
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(fixed_url, headers={"Accept": "application/pdf"})
                resp.raise_for_status()
                pdf_bytes = resp.content

            # Convert
            urls = await _convert_single_pdf(pdf_bytes, lead_id)
            converted_urls.extend(urls)
        except Exception as e:
            failed_urls.append(pdf_url)
            logger.error("pdf_conversion_failed", url=pdf_url, error=str(e))

    if converted_urls:
        try:
            # Clear legacy metadata
            await session.execute(
                update(ArquivoLeadOab)
                .where(ArquivoLeadOab.lead_oab_data_id == lead_id)
                .values(pdf_convertido=None)
            )
            # Save converted URLs
            await session.execute(
                update(LeadOabData)
                .where(LeadOabData.id == lead_id)
                .values(imagens_convertidas=json.dumps(converted_urls))
            )
            await session.commit()
        except Exception as e:
            logger.error("pdf_conversion_db_update_failed", error=str(e))

    return {
        "success": len(converted_urls) > 0,
        "imageUrls": converted_urls,
        "convertedUrls": converted_urls,
        "failedUrls": failed_urls,
        "message": f"{len(converted_urls)} PDFs convertidos com sucesso. {len(failed_urls)} falhas.",
    }


async def _convert_single_pdf(pdf_bytes: bytes, lead_id: str) -> list[str]:
    """Pipeline: save temp -> render pages -> optimize -> upload -> cleanup."""
    base_name = f"pdf-lead{lead_id[:8]}-{uuid.uuid4().hex[:8]}"
    tmp_dir = tempfile.mkdtemp(prefix="pdf_conv_")
    pdf_path = os.path.join(tmp_dir, f"{base_name}.pdf")
    output_dir = os.path.join(tmp_dir, base_name)
    os.makedirs(output_dir, exist_ok=True)

    # Write PDF to temp
    await asyncio.to_thread(Path(pdf_path).write_bytes, pdf_bytes)

    try:
        total_pages = await _get_page_count(pdf_path)
        all_results: list[dict[str, Any]] = []

        if total_pages > 0 and total_pages > RENDER_PARALLELISM:
            # Parallel range rendering
            pages_per_range = (total_pages + RENDER_PARALLELISM - 1) // RENDER_PARALLELISM
            ranges = []
            for i in range(RENDER_PARALLELISM):
                first = i * pages_per_range + 1
                last = min((i + 1) * pages_per_range, total_pages)
                if first <= total_pages:
                    ranges.append((first, last))

            async def process_range(idx: int, first: int, last: int) -> list[dict]:
                range_dir = os.path.join(tmp_dir, f"{base_name}_r{idx}")
                os.makedirs(range_dir, exist_ok=True)
                try:
                    files = await _render_page_range(pdf_path, range_dir, first, last, 300)
                    uploaded = await _upload_batch(files, range_dir, base_name)
                    return uploaded
                finally:
                    shutil.rmtree(range_dir, ignore_errors=True)

            range_results = await asyncio.gather(
                *[process_range(idx, f, l) for idx, (f, l) in enumerate(ranges)]
            )
            for rr in range_results:
                all_results.extend(rr)
        else:
            # Small PDF — render all at once
            files = await _render_page_range(pdf_path, output_dir, 0, 0, 300)
            all_results = await _upload_batch(files, output_dir, base_name)

        # Sort by page number
        all_results.sort(key=lambda r: r["page"])
        urls = [r["url"] for r in all_results]

        if not urls:
            raise ManuscritoServiceError("Nenhuma imagem convertida")
        return urls
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


async def get_converted_images(session: AsyncSession, lead_id: str) -> dict:
    """Retrieve converted image metadata for a lead."""
    if not lead_id:
        raise ManuscritoServiceError("ID do lead é obrigatório")

    result = await session.execute(
        select(ArquivoLeadOab)
        .where(ArquivoLeadOab.lead_oab_data_id == lead_id)
    )
    arquivos = result.scalars().all()

    return {
        "arquivos": [
            {
                "id": a.id,
                "dataUrl": a.data_url,
                "fileType": a.file_type,
                "pdfConvertido": a.pdf_convertido,
            }
            for a in arquivos
        ]
    }


# ---------------------------------------------------------------------------
# espelhos-padrao/route.ts — GET + POST + PUT
# ---------------------------------------------------------------------------


async def list_espelhos_padrao(
    session: AsyncSession, especialidade: str | None = None
) -> dict:
    """List active standard mirrors, optionally filtered by specialty."""
    stmt = select(EspelhoPadrao).where(EspelhoPadrao.is_ativo.is_(True))

    if especialidade:
        stmt = stmt.where(EspelhoPadrao.especialidade == especialidade)

    stmt = stmt.order_by(EspelhoPadrao.updated_at.desc())
    result = await session.execute(stmt)
    espelhos = result.scalars().all()

    # Fetch atualizadoPor names
    user_ids = [e.atualizado_por_id for e in espelhos if e.atualizado_por_id]
    users_map: dict[str, dict] = {}
    if user_ids:
        user_result = await session.execute(
            select(UsuarioChatwit.id, UsuarioChatwit.name)
            .where(UsuarioChatwit.id.in_(user_ids))
        )
        for uid, uname in user_result.all():
            users_map[uid] = {"id": uid, "name": uname}

    return {
        "success": True,
        "espelhos": [
            {
                "id": e.id,
                "nome": e.nome,
                "especialidade": e.especialidade,
                "descricao": e.descricao,
                "updatedAt": e.updated_at.isoformat() if e.updated_at else None,
                "atualizadoPor": users_map.get(e.atualizado_por_id),
            }
            for e in espelhos
        ],
    }


async def upsert_espelho_padrao(
    session: AsyncSession,
    especialidade: str,
    nome: str,
    descricao: str | None,
    usuario_id: str | None,
    espelho_correcao: str | None,
    tipo_processamento: str | None,
) -> dict:
    """Create or update a standard mirror (upsert by specialty)."""
    if not especialidade or not nome:
        raise ManuscritoServiceError("Especialidade e nome são obrigatórios")

    # Resolve valid user
    usuario_valido = None
    if usuario_id and usuario_id != "global":
        result = await session.execute(
            select(UsuarioChatwit).where(UsuarioChatwit.id == usuario_id)
        )
        usuario_valido = result.scalar_one_or_none()

    if not usuario_valido:
        result = await session.execute(
            select(UsuarioChatwit).order_by(UsuarioChatwit.created_at.asc()).limit(1)
        )
        usuario_valido = result.scalar_one_or_none()

    if not usuario_valido:
        raise ManuscritoServiceError("Nenhum usuário encontrado no sistema Chatwit")

    # Check existing
    result = await session.execute(
        select(EspelhoPadrao).where(EspelhoPadrao.especialidade == especialidade)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.nome = nome
        if descricao is not None:
            existing.descricao = descricao
        if espelho_correcao is not None:
            existing.espelho_correcao = espelho_correcao
        existing.atualizado_por_id = usuario_valido.id
        session.add(existing)
        await session.commit()
        await session.refresh(existing)

        return {
            "success": True,
            "espelhoPadrao": _serialize_espelho_padrao(existing, usuario_valido),
            "message": "Espelho padrão atualizado com sucesso",
        }
    else:
        from domains.socialwise.db.base import generate_cuid

        novo = EspelhoPadrao(
            id=generate_cuid(),
            especialidade=especialidade,
            nome=nome,
            descricao=descricao,
            espelho_correcao=espelho_correcao,
            atualizado_por_id=usuario_valido.id,
        )
        session.add(novo)
        await session.commit()
        await session.refresh(novo)

        return {
            "success": True,
            "espelhoPadrao": _serialize_espelho_padrao(novo, usuario_valido),
            "message": "Espelho padrão criado com sucesso",
        }


async def update_espelho_padrao(
    session: AsyncSession,
    espelho_id: str,
    texto_markdown: str | None = None,
    processado: bool | None = None,
    aguardando_processamento: bool | None = None,
) -> dict:
    """Update espelho padrão fields."""
    if not espelho_id:
        raise ManuscritoServiceError("ID é obrigatório")

    result = await session.execute(
        select(EspelhoPadrao).where(EspelhoPadrao.id == espelho_id)
    )
    espelho = result.scalar_one_or_none()
    if not espelho:
        raise ManuscritoServiceError("Espelho padrão não encontrado")

    if texto_markdown is not None:
        espelho.texto_markdown = texto_markdown
    if processado is not None:
        espelho.processado = processado
    if aguardando_processamento is not None:
        espelho.aguardando_processamento = aguardando_processamento

    session.add(espelho)
    await session.commit()
    await session.refresh(espelho)

    # Fetch user
    user_result = await session.execute(
        select(UsuarioChatwit).where(UsuarioChatwit.id == espelho.atualizado_por_id)
    )
    user = user_result.scalar_one_or_none()

    return {
        "success": True,
        "espelhoPadrao": _serialize_espelho_padrao(espelho, user),
        "message": "Espelho padrão atualizado com sucesso",
    }


def _serialize_espelho_padrao(e: EspelhoPadrao, user: UsuarioChatwit | None) -> dict:
    return {
        "id": e.id,
        "especialidade": e.especialidade,
        "nome": e.nome,
        "descricao": e.descricao,
        "textoMarkdown": e.texto_markdown,
        "espelhoCorrecao": e.espelho_correcao,
        "isAtivo": e.is_ativo,
        "totalUsos": e.total_usos,
        "processado": e.processado,
        "aguardandoProcessamento": e.aguardando_processamento,
        "createdAt": e.created_at.isoformat() if e.created_at else None,
        "updatedAt": e.updated_at.isoformat() if e.updated_at else None,
        "atualizadoPor": {"id": user.id, "name": user.name} if user else None,
    }


# ---------------------------------------------------------------------------
# biblioteca-espelhos/route.ts — GET + POST + PUT + DELETE
# ---------------------------------------------------------------------------


async def list_biblioteca_espelhos(session: AsyncSession, usuario_id: str) -> dict:
    """List active mirrors in user's library."""
    if not usuario_id:
        raise ManuscritoServiceError("ID do usuário é obrigatório")

    result = await session.execute(
        select(EspelhoBiblioteca)
        .where(
            EspelhoBiblioteca.criado_por_id == usuario_id,
            EspelhoBiblioteca.is_ativo.is_(True),
        )
        .order_by(EspelhoBiblioteca.created_at.desc())
    )
    espelhos = result.scalars().all()

    return {
        "success": True,
        "espelhos": [_serialize_espelho_biblioteca(e) for e in espelhos],
    }


async def create_biblioteca_espelho(
    session: AsyncSession,
    nome: str,
    usuario_id: str,
    descricao: str | None = None,
    texto_do_espelho: Any | None = None,
    espelho_correcao: str | None = None,
) -> dict:
    """Add new mirror to library."""
    if not nome or not usuario_id:
        raise ManuscritoServiceError("Nome e ID do usuário são obrigatórios")

    from domains.socialwise.db.base import generate_cuid

    novo = EspelhoBiblioteca(
        id=generate_cuid(),
        nome=nome,
        descricao=descricao,
        texto_do_espelho=texto_do_espelho,
        espelho_correcao=espelho_correcao,
        criado_por_id=usuario_id,
    )
    session.add(novo)
    await session.commit()
    await session.refresh(novo)

    return {
        "success": True,
        "message": "Espelho adicionado à biblioteca com sucesso",
        "espelho": _serialize_espelho_biblioteca(novo),
    }


async def update_biblioteca_espelho(
    session: AsyncSession,
    espelho_id: str,
    nome: str | None = None,
    descricao: str | None = None,
    texto_do_espelho: Any | None = None,
    espelho_correcao: str | None = None,
    espelho_biblioteca_processado: bool | None = None,
    aguardando_espelho: bool | None = None,
) -> dict:
    """Update a library mirror."""
    if not espelho_id:
        raise ManuscritoServiceError("ID do espelho é obrigatório")

    result = await session.execute(
        select(EspelhoBiblioteca).where(EspelhoBiblioteca.id == espelho_id)
    )
    espelho = result.scalar_one_or_none()
    if not espelho:
        raise ManuscritoServiceError("Espelho não encontrado")

    if nome:
        espelho.nome = nome
    if descricao is not None:
        espelho.descricao = descricao
    if texto_do_espelho is not None:
        espelho.texto_do_espelho = texto_do_espelho
    if espelho_correcao is not None:
        espelho.espelho_correcao = espelho_correcao
    if espelho_biblioteca_processado is not None:
        espelho.espelho_biblioteca_processado = espelho_biblioteca_processado
    if aguardando_espelho is not None:
        espelho.aguardando_espelho = aguardando_espelho

    session.add(espelho)
    await session.commit()
    await session.refresh(espelho)

    return {
        "success": True,
        "message": "Espelho atualizado com sucesso",
        "espelho": _serialize_espelho_biblioteca(espelho),
    }


async def delete_biblioteca_espelho(session: AsyncSession, espelho_id: str) -> dict:
    """Soft-delete library mirror and remove lead associations."""
    if not espelho_id:
        raise ManuscritoServiceError("ID do espelho é obrigatório")

    # Soft delete
    await session.execute(
        update(EspelhoBiblioteca)
        .where(EspelhoBiblioteca.id == espelho_id)
        .values(is_ativo=False)
    )

    # Remove associations
    await session.execute(
        update(LeadOabData)
        .where(LeadOabData.espelho_biblioteca_id == espelho_id)
        .values(espelho_biblioteca_id=None)
    )

    await session.commit()

    return {"success": True, "message": "Espelho removido da biblioteca com sucesso"}


def _serialize_espelho_biblioteca(e: EspelhoBiblioteca) -> dict:
    return {
        "id": e.id,
        "nome": e.nome,
        "descricao": e.descricao,
        "textoDOEspelho": e.texto_do_espelho,
        "espelhoCorrecao": e.espelho_correcao,
        "isAtivo": e.is_ativo,
        "totalUsos": e.total_usos,
        "espelhoBibliotecaProcessado": e.espelho_biblioteca_processado,
        "aguardandoEspelho": e.aguardando_espelho,
        "createdAt": e.created_at.isoformat() if e.created_at else None,
        "updatedAt": e.updated_at.isoformat() if e.updated_at else None,
        "criadoPorId": e.criado_por_id,
    }


# ---------------------------------------------------------------------------
# associar-espelho/route.ts — POST
# ---------------------------------------------------------------------------


async def associar_espelho(
    session: AsyncSession, lead_id: str, espelho_id: str | None
) -> dict:
    """Associate or disassociate a library mirror to a lead."""
    if not lead_id:
        raise ManuscritoServiceError("ID do lead é obrigatório")

    if espelho_id:
        # Verify mirror exists and is active
        result = await session.execute(
            select(EspelhoBiblioteca).where(
                EspelhoBiblioteca.id == espelho_id,
                EspelhoBiblioteca.is_ativo.is_(True),
            )
        )
        espelho = result.scalar_one_or_none()
        if not espelho:
            raise ManuscritoServiceError("Espelho não encontrado ou inativo")

        # Associate
        await session.execute(
            update(LeadOabData)
            .where(LeadOabData.id == lead_id)
            .values(
                espelho_biblioteca_id=espelho_id,
                espelho_correcao=None,
                texto_do_espelho=None,
            )
        )

        # Increment usage counter
        espelho.total_usos += 1
        session.add(espelho)
        await session.commit()

        return {
            "success": True,
            "message": "Espelho associado com sucesso",
            "espelhoId": espelho_id,
        }
    else:
        # Disassociate — decrement counter of current mirror
        result = await session.execute(
            select(LeadOabData.espelho_biblioteca_id)
            .where(LeadOabData.id == lead_id)
        )
        current_id = result.scalar_one_or_none()

        if current_id:
            result = await session.execute(
                select(EspelhoBiblioteca).where(EspelhoBiblioteca.id == current_id)
            )
            current_espelho = result.scalar_one_or_none()
            if current_espelho and current_espelho.total_usos > 0:
                current_espelho.total_usos -= 1
                session.add(current_espelho)

        await session.execute(
            update(LeadOabData)
            .where(LeadOabData.id == lead_id)
            .values(espelho_biblioteca_id=None)
        )
        await session.commit()

        return {"success": True, "message": "Espelho desassociado com sucesso"}


# ---------------------------------------------------------------------------
# oab-rubrics/route.ts — GET
# ---------------------------------------------------------------------------


async def list_oab_rubrics(session: AsyncSession) -> dict:
    """Fetch all OAB rubrics grouped by area."""
    result = await session.execute(
        select(OabRubric).order_by(OabRubric.updated_at.desc())
    )
    rubrics = result.scalars().all()

    rubrics_by_area: dict[str, list[dict]] = {}
    for r in rubrics:
        meta = r.meta or {}
        meta_area = meta.get("area") or r.area or "DESCONHECIDA"
        exam_info = meta.get("exam") or r.exam or "Exame Desconhecido"

        if meta_area not in rubrics_by_area:
            rubrics_by_area[meta_area] = []

        rubrics_by_area[meta_area].append({
            "id": r.id,
            "nome": f"{exam_info} - {meta_area}",
            "area": meta_area,
            "exam": exam_info,
            "version": r.version,
        })

    return {
        "success": True,
        "rubrics": rubrics_by_area,
        "total": len(rubrics),
    }
