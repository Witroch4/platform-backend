"""API endpoints for petition management and electronic filing."""

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.ai.agents.writer import RedatorAgent
from platform_core.config import settings
from domains.jusmonitoria.auth.dependencies import get_current_tenant_id, get_current_user
from domains.jusmonitoria.metrics import taskiq_task_enqueue_failures_total
from domains.jusmonitoria.services.peticoes.peticao_service import PeticaoService
from domains.jusmonitoria.data.tipos_documento_pje import get_tipos_documento
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.peticao import DocumentoStatus, PeticaoStatus, TipoDocumento
from domains.jusmonitoria.db.models.tpu import TpuDocumento
from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.db.repositories.peticao import (
    PeticaoDocumentoRepository,
    PeticaoEventoRepository,
    PeticaoRepository,
)
from domains.jusmonitoria.schemas.peticao import (
    ConsultarProcessoRequest,
    PeticaoCreate,
    PeticaoDocumentoResponse,
    PeticaoEventoResponse,
    PeticaoListItemResponse,
    PeticaoListResponse,
    PeticaoResponse,
    PeticaoUpdate,
)
from domains.jusmonitoria.tasks.tasks.multimodal_embeddings import generate_document_embedding

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/peticoes", tags=["peticoes"])

_service = PeticaoService()
_MAX_ANALYSIS_SUGGESTIONS = 5
_MAX_ANALYSIS_PARTIES = 6
_ANALYSIS_TEMPERATURE = 0.2
_ANALYSIS_MAX_TOKENS = 1024
_PETICAO_ANALYSIS_PROMPT_TEMPLATE = (
    "Faça uma análise prévia desta petição considerando os metadados do processo "
    "e a lista de documentos anexados. Avalie consistência jurídica aparente, "
    "aderência jurisprudencial provável e qualidade/formatação documental.\n\n"
    "Responda SOMENTE com JSON válido, sem markdown, usando exatamente este formato:\n"
    "{"
    '"consistenciaJuridica": 0, '
    '"jurisprudencia": 0, '
    '"formatacao": 0, '
    '"pontuacaoGeral": 0, '
    '"feedback": "texto objetivo em português", '
    '"sugestoes": ["sugestão 1", "sugestão 2"]'
    "}\n\n"
    "Dados disponíveis:\n__PETICAO_CONTEXT__"
)


def _get_first_present_text(payload: dict[str, Any], *keys: str) -> str | None:
    """Return the first present payload field as stripped text, preserving falsy values."""
    for key in keys:
        if key in payload and payload[key] is not None:
            return str(payload[key]).strip()
    return None


def _normalize_analysis_score(value: Any, default: int) -> int:
    """Coerce AI scores to the 0-100 range expected by the frontend."""
    if not 0 <= default <= 100:
        raise ValueError(f"default parameter must be 0-100, got {default}")

    try:
        normalized = int(round(float(value)))
    except (TypeError, ValueError):
        normalized = default

    return max(0, min(100, normalized))


def _normalize_analysis_payload(
    payload: dict[str, Any],
    *,
    fallback_feedback: str,
    elapsed_ms: int,
    analyzed_at: datetime,
) -> dict[str, Any]:
    """Normalize RedatorAgent output to the JSON contract used by the UI."""
    consistencia = _normalize_analysis_score(
        payload.get("consistenciaJuridica", payload.get("consistencia_juridica")),
        70,
    )
    jurisprudencia = _normalize_analysis_score(
        payload.get("jurisprudencia"),
        65,
    )
    formatacao = _normalize_analysis_score(
        payload.get("formatacao"),
        75,
    )
    pontuacao_geral = _normalize_analysis_score(
        payload.get("pontuacaoGeral", payload.get("pontuacao_geral")),
        round((consistencia + jurisprudencia + formatacao) / 3),
    )

    raw_sugestoes = payload.get("sugestoes", [])
    if isinstance(raw_sugestoes, (tuple, set)):
        raw_sugestoes = list(raw_sugestoes)
    elif not isinstance(raw_sugestoes, list):
        raw_sugestoes = [raw_sugestoes] if raw_sugestoes else []

    sugestoes = [
        str(item).strip()
        for item in raw_sugestoes
        if str(item).strip()
    ][:_MAX_ANALYSIS_SUGGESTIONS]
    feedback = (
        _get_first_present_text(payload, "feedback", "resumo", "analise")
        or fallback_feedback
    )

    return {
        "consistenciaJuridica": consistencia,
        "jurisprudencia": jurisprudencia,
        "formatacao": formatacao,
        "pontuacaoGeral": pontuacao_geral,
        "feedback": feedback,
        "sugestoes": sugestoes,
        "analisadoEm": analyzed_at.isoformat(),
        "tempoAnaliseMs": max(elapsed_ms, 0),
    }


def _build_peticao_analysis_context(pet: Any, documentos: list[Any]) -> dict[str, Any]:
    """Build a safe, serializable context payload for AI analysis."""
    dados_basicos = pet.dados_basicos_json if isinstance(pet.dados_basicos_json, dict) else {}
    polos = dados_basicos.get("polos", [])
    partes: list[str] = []

    for polo in polos[:_MAX_ANALYSIS_PARTIES]:
        if not isinstance(polo, dict):
            continue
        nome = polo.get("nome") or polo.get("parte") or polo.get("parte_nome")
        papel = polo.get("tipo_polo") or polo.get("tipo") or polo.get("papel")
        if nome and papel:
            partes.append(f"{papel}: {nome}")
        elif nome:
            partes.append(str(nome))

    manifest = [
        {
            "nome": doc.nome_original,
            "tipo": getattr(doc.tipo_documento, "value", str(doc.tipo_documento)),
            "ordem": doc.ordem,
            "tamanhoBytes": doc.tamanho_bytes,
            "status": getattr(doc.status, "value", str(doc.status)),
            "sigiloso": doc.sigiloso,
        }
        for doc in documentos
    ]

    return {
        "cnj_number": pet.processo_numero,
        "court": pet.tribunal_id,
        "petition_type": getattr(pet.tipo_peticao, "value", str(pet.tipo_peticao)),
        "petition_subject": pet.assunto,
        "description": pet.descricao or pet.assunto,
        "parties": ", ".join(partes) if partes else "Não informado",
        "document_count": len(manifest),
        "documents": manifest,
    }



# --- Static reference data ---


@router.get("/tipos-documento")
async def get_tipos_documento_por_tribunal(
    tribunal_id: str = Query(..., min_length=1, max_length=20),
    _tenant_id: UUID = Depends(get_current_tenant_id),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Retorna os tipos de documento dispóniveis no PJe para o tribunal.

    Retorna a lista exata dos labels do select `cbTDDecoration:cbTD`
    capturada via RPA. Usar como valor no campo tipoPeticaoPje do formulário.
    """
    tipos = get_tipos_documento(tribunal_id)
    return {"tribunal_id": tribunal_id, "tipos": tipos, "total": len(tipos)}


@router.get("/tipos-documento-tpu")
async def get_tipos_documento_tpu(
    tribunal_id: str = Query(..., min_length=1, max_length=20),
    _tenant_id: UUID = Depends(get_current_tenant_id),
    _current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict:
    """Retorna tipos de documento da Tabela Processual Unificada (CNJ).

    Lê da tabela local `tpu_documentos` (populada e revalidada semanalmente
    pelo worker tpu_sync). Cada item: cod_item (int), nome (str), descricao (str).
    """
    result = await session.execute(
        select(TpuDocumento)
        .where(TpuDocumento.cod_item_pai.isnot(None))
        .order_by(TpuDocumento.nome)
    )
    docs = result.scalars().all()

    if not docs:
        raise HTTPException(
            status_code=503,
            detail="Tabela TPU de documentos ainda não sincronizada. Aguarde o sync automático ou acione manualmente.",
        )

    tipos = [
        {
            "cod_item": d.codigo,
            "nome": d.nome,
            "descricao": d.glossario or "",
        }
        for d in docs
    ]
    return {"tribunal_id": tribunal_id, "tipos": tipos, "total": len(tipos)}


# --- List ---


@router.get("", response_model=PeticaoListResponse)
async def list_peticoes(
    search: str | None = Query(None, max_length=200),
    status_filter: PeticaoStatus | None = Query(None, alias="status"),
    tribunal_id: str | None = Query(None, max_length=20),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> PeticaoListResponse:
    """List petitions with optional filters and pagination."""
    repo = PeticaoRepository(session, tenant_id)
    items, total = await repo.list_filtered(
        search=search,
        status=status_filter,
        tribunal_id=tribunal_id,
        skip=skip,
        limit=limit,
    )

    list_items = []
    for pet in items:
        item = PeticaoListItemResponse.model_validate(pet)
        item.quantidade_documentos = len(pet.documentos) if pet.documentos else 0
        list_items.append(item)

    return PeticaoListResponse(items=list_items, total=total)


# --- Create ---


@router.post("", response_model=PeticaoResponse, status_code=status.HTTP_201_CREATED)
async def create_peticao(
    data: PeticaoCreate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> PeticaoResponse:
    """Create a new petition in rascunho status."""
    pet = await _service.create(session, tenant_id, current_user.id, data)
    await session.commit()

    # Re-fetch to load relationships
    repo = PeticaoRepository(session, tenant_id)
    pet = await repo.get(pet.id)

    logger.info(
        "Petition created",
        extra={"peticao_id": str(pet.id), "tenant_id": str(tenant_id)},
    )
    return PeticaoResponse.model_validate(pet)


# --- Detail ---


@router.get("/{peticao_id}", response_model=PeticaoResponse)
async def get_peticao(
    peticao_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> PeticaoResponse:
    """Get petition detail with documents and events."""
    repo = PeticaoRepository(session, tenant_id)
    pet = await repo.get(peticao_id)
    if pet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Petição não encontrada",
        )
    return PeticaoResponse.model_validate(pet)


# --- Update ---


@router.patch("/{peticao_id}", response_model=PeticaoResponse)
async def update_peticao(
    peticao_id: UUID,
    data: PeticaoUpdate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> PeticaoResponse:
    """Update petition metadata. Only allowed when status is rascunho."""
    repo = PeticaoRepository(session, tenant_id)
    pet = await repo.get(peticao_id)
    if pet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Petição não encontrada",
        )
    if pet.status == PeticaoStatus.REJEITADA:
        # Auto-transition REJEITADA → RASCUNHO when editing
        await _service.transition_status(
            session, tenant_id, peticao_id,
            PeticaoStatus.RASCUNHO,
            "Petição reaberta para correção e reenvio",
        )
    elif pet.status != PeticaoStatus.RASCUNHO:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Apenas petições em rascunho podem ser editadas",
        )

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        return PeticaoResponse.model_validate(pet)

    # Serialize dados_basicos Pydantic model to JSON dict for JSONB column
    # Use by_alias=True so camelCase keys are stored in JSONB (frontend-readable)
    if "dados_basicos" in update_data and update_data["dados_basicos"] is not None:
        update_data.pop("dados_basicos")
        if data.dados_basicos is not None:
            update_data["dados_basicos_json"] = data.dados_basicos.model_dump(mode="json", by_alias=True)
    elif "dados_basicos" in update_data:
        update_data.pop("dados_basicos")

    updated = await repo.update(peticao_id, **update_data)
    await session.commit()

    # Re-fetch to load relationships
    pet = await repo.get(peticao_id)
    return PeticaoResponse.model_validate(pet)


# --- Delete ---


@router.delete("/{peticao_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_peticao(
    peticao_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> None:
    """Delete a petition. Only allowed when status is rascunho."""
    repo = PeticaoRepository(session, tenant_id)
    pet = await repo.get(peticao_id)
    if pet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Petição não encontrada",
        )
    if pet.status != PeticaoStatus.RASCUNHO:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Apenas petições em rascunho podem ser deletadas",
        )

    await repo.delete(peticao_id)
    await session.commit()

    logger.info(
        "Petition deleted",
        extra={"peticao_id": str(peticao_id), "tenant_id": str(tenant_id)},
    )


# --- Documents ---


# --- Direct Upload (browser → backend → S3) ---


@router.post(
    "/{peticao_id}/documentos/upload",
    response_model=PeticaoDocumentoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_documento(
    peticao_id: UUID,
    arquivo: UploadFile = File(...),
    tipo_documento: TipoDocumento = Form(...),
    ordem: int = Form(1),
    sigiloso: bool = Form(False),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> PeticaoDocumentoResponse:
    """Upload a PDF document through the backend (avoids browser CORS with S3)."""
    from domains.jusmonitoria.services.storage import upload_bytes_to_s3
    import hashlib as _hashlib
    import uuid as _uuid

    repo = PeticaoRepository(session, tenant_id)
    pet = await repo.get(peticao_id)
    if pet is None:
        raise HTTPException(status_code=404, detail="Petição não encontrada")
    if pet.status != PeticaoStatus.RASCUNHO:
        raise HTTPException(status_code=400, detail="Petição não está em rascunho")

    nome_original = arquivo.filename or "documento.pdf"
    if not nome_original.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Apenas arquivos PDF são aceitos")

    data = await arquivo.read()
    tamanho_bytes = len(data)

    max_size = settings.mni_max_file_size_mb * 1024 * 1024
    if tamanho_bytes > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo excede limite de {settings.mni_max_file_size_mb}MB",
        )

    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Arquivo não é um PDF válido")

    file_id = _uuid.uuid4().hex
    safe_name = nome_original.replace(" ", "_").replace("/", "_")
    s3_key = f"peticoes/{tenant_id}/{peticao_id}/{file_id}_{safe_name}"
    upload_bytes_to_s3(s3_key, data, content_type="application/pdf")

    hash_sha256 = _hashlib.sha256(data[:16]).hexdigest()

    doc_repo = PeticaoDocumentoRepository(session, tenant_id)
    doc = await doc_repo.create(
        peticao_id=peticao_id,
        nome_original=nome_original,
        tamanho_bytes=tamanho_bytes,
        tipo_documento=tipo_documento,
        ordem=ordem,
        s3_key=s3_key,
        hash_sha256=hash_sha256,
        status=DocumentoStatus.UPLOADED,
        sigiloso=sigiloso,
    )
    await session.commit()

    if settings.gemini_embedding_enabled:
        try:
            await generate_document_embedding.kiq(
                tenant_id=str(tenant_id),
                source_entity="peticao_documentos",
                source_id=str(doc.id),
                s3_key=s3_key,
            )
        except Exception as exc:
            taskiq_task_enqueue_failures_total.labels(
                task_name="generate_document_embedding",
                error_type=type(exc).__name__,
            ).inc()

    logger.info(
        "Document uploaded via backend",
        extra={"peticao_id": str(peticao_id), "doc_id": str(doc.id), "s3_key": s3_key},
    )
    return PeticaoDocumentoResponse.model_validate(doc)


# --- Presigned Upload (client-to-S3 direct) ---


class PresignUploadRequest(BaseModel):
    model_config = {"populate_by_name": True, "alias_generator": to_camel}

    nome_original: str = Field(..., min_length=1, max_length=500)
    tamanho_bytes: int = Field(..., gt=0)
    tipo_documento: TipoDocumento
    ordem: int = Field(1, ge=1)
    sigiloso: bool = False


class PresignUploadResponse(BaseModel):
    model_config = {"populate_by_name": True, "alias_generator": to_camel}

    upload_url: str
    s3_key: str


@router.post(
    "/{peticao_id}/documentos/presign-upload",
    response_model=PresignUploadResponse,
)
async def presign_upload(
    peticao_id: UUID,
    data: PresignUploadRequest,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> PresignUploadResponse:
    """Generate a presigned PUT URL so the frontend uploads directly to S3.

    Flow: frontend calls this → gets upload_url → PUTs PDF to S3 → calls confirm.
    """
    repo = PeticaoRepository(session, tenant_id)
    pet = await repo.get(peticao_id)
    if pet is None:
        raise HTTPException(status_code=404, detail="Petição não encontrada")
    if pet.status != PeticaoStatus.RASCUNHO:
        raise HTTPException(status_code=400, detail="Petição não está em rascunho")

    # Validate filename
    if not data.nome_original.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Apenas arquivos PDF são aceitos")

    max_size = settings.mni_max_file_size_mb * 1024 * 1024
    if data.tamanho_bytes > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo excede limite de {settings.mni_max_file_size_mb}MB",
        )

    result = _service.generate_upload_presign(tenant_id, peticao_id, data.nome_original)
    return PresignUploadResponse(**result)


class ConfirmUploadRequest(BaseModel):
    model_config = {"populate_by_name": True, "alias_generator": to_camel}

    s3_key: str = Field(..., min_length=1)
    nome_original: str = Field(..., min_length=1, max_length=500)
    tamanho_bytes: int = Field(..., gt=0)
    tipo_documento: TipoDocumento
    ordem: int = Field(1, ge=1)
    sigiloso: bool = False


@router.post(
    "/{peticao_id}/documentos/confirm",
    response_model=PeticaoDocumentoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def confirm_upload(
    peticao_id: UUID,
    data: ConfirmUploadRequest,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> PeticaoDocumentoResponse:
    """Confirm a direct S3 upload: validates PDF header, saves document metadata."""
    repo = PeticaoRepository(session, tenant_id)
    pet = await repo.get(peticao_id)
    if pet is None:
        raise HTTPException(status_code=404, detail="Petição não encontrada")
    if pet.status != PeticaoStatus.RASCUNHO:
        raise HTTPException(status_code=400, detail="Petição não está em rascunho")

    # Security: ensure s3_key belongs to this tenant+petition
    expected_prefix = f"peticoes/{tenant_id}/{peticao_id}/"
    if not data.s3_key.startswith(expected_prefix):
        raise HTTPException(status_code=403, detail="S3 key não pertence a esta petição")

    try:
        doc = await _service.confirm_documento(
            session, tenant_id, peticao_id,
            s3_key=data.s3_key,
            nome_original=data.nome_original,
            tamanho_bytes=data.tamanho_bytes,
            tipo_documento=data.tipo_documento,
            ordem=data.ordem,
            sigiloso=data.sigiloso,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await session.commit()

    if settings.gemini_embedding_enabled:
        try:
            await generate_document_embedding.kiq(
                tenant_id=str(tenant_id),
                source_entity="peticao_documentos",
                source_id=str(doc.id),
                s3_key=data.s3_key,
            )
        except Exception as exc:
            taskiq_task_enqueue_failures_total.labels(
                task_name="generate_document_embedding",
                error_type=type(exc).__name__,
            ).inc()
            logger.exception(
                "Failed to queue multimodal embedding for petition document",
                extra={"peticao_id": str(peticao_id), "doc_id": str(doc.id), "s3_key": data.s3_key},
            )

    logger.info(
        "Document confirmed (presigned upload)",
        extra={"peticao_id": str(peticao_id), "doc_id": str(doc.id), "s3_key": data.s3_key},
    )
    return PeticaoDocumentoResponse.model_validate(doc)


# --- Document Download (presigned GET) ---


@router.get("/{peticao_id}/documentos/{doc_id}/download")
async def download_documento(
    peticao_id: UUID,
    doc_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict:
    """Generate a presigned download URL for a petition document."""
    from domains.jusmonitoria.services.storage import generate_presigned_download_url

    doc_repo = PeticaoDocumentoRepository(session, tenant_id)
    doc = await doc_repo.get(doc_id)
    if doc is None or doc.peticao_id != peticao_id:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    presigned = generate_presigned_download_url(doc.s3_key)
    return {"download_url": presigned, "nome_original": doc.nome_original}


@router.delete(
    "/{peticao_id}/documentos/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_documento(
    peticao_id: UUID,
    doc_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> None:
    """Remove a document from a petition."""
    # Verify petition
    pet_repo = PeticaoRepository(session, tenant_id)
    pet = await pet_repo.get(peticao_id)
    if pet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Petição não encontrada",
        )
    if pet.status != PeticaoStatus.RASCUNHO:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Documentos só podem ser removidos de petições em rascunho",
        )

    # Verify document belongs to petition
    doc_repo = PeticaoDocumentoRepository(session, tenant_id)
    doc = await doc_repo.get(doc_id)
    if doc is None or doc.peticao_id != peticao_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento não encontrado",
        )

    # Delete from S3
    try:
        from domains.jusmonitoria.services.storage import delete_s3_object
        delete_s3_object(doc.s3_key)
    except Exception as e:
        logger.warning("Failed to delete S3 object %s: %s", doc.s3_key, e)

    await doc_repo.delete(doc_id)
    await session.commit()


# --- Events ---


@router.get("/{peticao_id}/eventos", response_model=list[PeticaoEventoResponse])
async def list_eventos(
    peticao_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> list[PeticaoEventoResponse]:
    """List petition status events (timeline)."""
    # Verify petition exists
    pet_repo = PeticaoRepository(session, tenant_id)
    pet = await pet_repo.get(peticao_id)
    if pet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Petição não encontrada",
        )

    evento_repo = PeticaoEventoRepository(session, tenant_id)
    eventos = await evento_repo.list_by_peticao(peticao_id)
    return [PeticaoEventoResponse.model_validate(e) for e in eventos]


# --- Consultar Processo (MNI read-only) ---


@router.post("/consultar-processo")
async def consultar_processo(
    data: ConsultarProcessoRequest,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict:
    """
    Consult a process via MNI 2.2.2 consultarProcesso.

    This is a READ-ONLY operation — no petition is filed, no data is modified.
    Returns process header, parties (polos), movements, and judging body.
    Requires a valid A1 certificate with mTLS.
    """
    import asyncio

    from domains.jusmonitoria.api.v1.endpoints.tribunais import get_tribunal_config
    from domains.jusmonitoria.services.peticoes.mni_client import MniSoapClient
    from domains.jusmonitoria.db.repositories.certificado_digital import CertificadoDigitalRepository

    # Load certificate
    cert_repo = CertificadoDigitalRepository(session, tenant_id)
    cert = await cert_repo.get(data.certificado_id)
    if cert is None or cert.revogado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificado não encontrado ou revogado",
        )

    # Resolve tribunal WSDL
    tribunal = get_tribunal_config(data.tribunal_id)
    if tribunal is None or not tribunal.get("wsdlEndpoint"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tribunal '{data.tribunal_id}' sem endpoint WSDL configurado",
        )

    from domains.jusmonitoria.services.certificados.crypto import CertificateCryptoService
    crypto = CertificateCryptoService(settings.encrypt_key)
    mni = MniSoapClient(crypto)

    cpf = cert.titular_cpf_cnpj.replace(".", "").replace("-", "").replace("/", "")

    result = await asyncio.to_thread(
        mni.consultar_processo,
        wsdl_url=tribunal["wsdlEndpoint"],
        pfx_encrypted=cert.pfx_encrypted,
        pfx_password_encrypted=cert.pfx_password_encrypted,
        numero_processo=data.numero_processo,
        id_consultante=cpf,
    )

    logger.info(
        "consultarProcesso called",
        extra={
            "processo": data.numero_processo,
            "tribunal": data.tribunal_id,
            "sucesso": result.get("sucesso"),
        },
    )

    return result


# --- Filing (Phase 2C) ---


@router.post("/{peticao_id}/protocolar", status_code=status.HTTP_202_ACCEPTED)
async def protocolar_peticao(
    peticao_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict:
    """
    Initiate MNI electronic filing pipeline.

    Validates the petition is ready, transitions to VALIDANDO,
    and enqueues the filing worker task.
    """
    # Validate readiness
    errors = await _service.validate_for_filing(session, tenant_id, peticao_id)
    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Petição não está pronta para protocolar", "errors": errors},
        )

    # Transition rascunho → validando
    try:
        await _service.transition_status(
            session, tenant_id, peticao_id,
            PeticaoStatus.VALIDANDO,
            "Iniciando validação para protocolo",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await session.commit()

    # Enqueue filing worker
    try:
        from domains.jusmonitoria.tasks.tasks.peticao_protocolar import protocolar_peticao_task
        await protocolar_peticao_task.kiq(
            peticao_id=str(peticao_id),
            tenant_id=str(tenant_id),
        )
    except Exception as e:
        logger.error(
            "Failed to enqueue filing task",
            extra={"peticao_id": str(peticao_id), "error": str(e)},
        )
        # Revert status
        await _service.transition_status(
            session, tenant_id, peticao_id,
            PeticaoStatus.RASCUNHO,
            "Falha ao enfileirar tarefa de protocolo",
            detalhes=str(e),
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao iniciar protocolo. Tente novamente.",
        )

    return {"message": "Protocolo iniciado", "peticaoId": str(peticao_id)}


# --- Validation ---


@router.post("/{peticao_id}/analise-ia", status_code=status.HTTP_202_ACCEPTED)
async def analise_ia(
    peticao_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict:
    """Request AI analysis of petition documents. Stores result in analise_ia JSONB field."""
    repo = PeticaoRepository(session, tenant_id)
    pet = await repo.get(peticao_id)
    if pet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Petição não encontrada",
        )

    doc_repo = PeticaoDocumentoRepository(session, tenant_id)
    documentos = await doc_repo.list_by_peticao(peticao_id)
    if not documentos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Envie ao menos um documento antes de solicitar a análise IA.",
        )

    peticao_context = _build_peticao_analysis_context(pet, documentos)
    prompt = _PETICAO_ANALYSIS_PROMPT_TEMPLATE.replace(
        "__PETICAO_CONTEXT__",
        json.dumps(peticao_context, ensure_ascii=False),
    )

    redator = RedatorAgent(session, tenant_id)
    analyzed_at = datetime.now(timezone.utc)
    start_time = time.monotonic()
    try:
        raw_analysis = await redator.execute(
            user_message=prompt,
            context={"peticao": peticao_context},
            temperature=_ANALYSIS_TEMPERATURE,
            max_tokens=_ANALYSIS_MAX_TOKENS,
            use_case="document",
        )
    except Exception as exc:
        logger.exception(
            "Failed to generate petition AI analysis",
            extra={
                "tenant_id": str(tenant_id),
                "peticao_id": str(peticao_id),
                "user_id": str(current_user.id),
                "error": str(exc),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao gerar análise IA da petição. Tente novamente em instantes.",
        ) from exc

    elapsed_ms = int((time.monotonic() - start_time) * 1000)
    success_fallback_feedback = "Análise gerada pelo RedatorAgent com base nos metadados da petição."

    try:
        analysis_payload = redator.parse_json_response(raw_analysis)
        fallback_feedback = success_fallback_feedback
    except ValueError:
        logger.warning(
            "Petition AI analysis returned non-JSON payload; normalizing text response",
            extra={"tenant_id": str(tenant_id), "peticao_id": str(peticao_id)},
        )
        analysis_payload = {"feedback": raw_analysis, "sugestoes": []}
        fallback_feedback = raw_analysis

    analise = _normalize_analysis_payload(
        analysis_payload,
        fallback_feedback=fallback_feedback,
        elapsed_ms=elapsed_ms,
        analyzed_at=analyzed_at,
    )
    await repo.update(peticao_id, analise_ia=analise)
    await session.commit()

    return {"message": "Análise solicitada", "peticaoId": str(peticao_id)}


@router.get("/{peticao_id}/validar")
async def validar_peticao(
    peticao_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict:
    """Check if petition is ready for filing. Returns validation errors."""
    errors = await _service.validate_for_filing(session, tenant_id, peticao_id)
    return {
        "pronta": len(errors) == 0,
        "errors": errors,
    }
