"""API endpoints for Contract management."""

import logging
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import get_current_tenant_id, get_current_user
from domains.jusmonitoria.services.contrato_document_service import ContratoDocumentService
from domains.jusmonitoria.services.contrato_service import ContratoService
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.contrato import StatusContrato, TipoContrato
from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.db.repositories.contrato import ContratoRepository
from domains.jusmonitoria.db.repositories.fatura import FaturaRepository
from domains.jusmonitoria.schemas.contrato import (
    ContratoCreate,
    ContratoListResponse,
    ContratoResponse,
    ContratoUpdate,
)
from domains.jusmonitoria.schemas.fatura import FaturaListResponse, FaturaResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contratos", tags=["contratos"])


def _contrato_to_response(contrato) -> ContratoResponse:
    """Convert a Contrato model to response schema."""
    return ContratoResponse(
        id=contrato.id,
        tenant_id=contrato.tenant_id,
        numero_contrato=contrato.numero_contrato,
        titulo=contrato.titulo,
        descricao=contrato.descricao,
        tipo=contrato.tipo,
        status=contrato.status,
        client_id=contrato.client_id,
        client_name=contrato.client.full_name if contrato.client else None,
        assigned_to=contrato.assigned_to,
        assigned_user_name=contrato.assigned_user.full_name if contrato.assigned_user else None,
        valor_total=contrato.valor_total,
        valor_mensal=contrato.valor_mensal,
        valor_entrada=contrato.valor_entrada,
        percentual_exito=contrato.percentual_exito,
        indice_reajuste=contrato.indice_reajuste,
        data_inicio=contrato.data_inicio,
        data_vencimento=contrato.data_vencimento,
        data_assinatura=contrato.data_assinatura,
        dia_vencimento_fatura=contrato.dia_vencimento_fatura,
        dias_lembrete_antes=contrato.dias_lembrete_antes,
        dias_cobranca_apos=contrato.dias_cobranca_apos or [1, 7, 15],
        conteudo_html=contrato.conteudo_html,
        clausulas=contrato.clausulas,
        observacoes=contrato.observacoes,
        documento_url=contrato.documento_url,
        created_at=contrato.created_at,
        updated_at=contrato.updated_at,
    )


def _fatura_to_response(fatura) -> FaturaResponse:
    """Convert a Fatura model to response schema."""
    return FaturaResponse(
        id=fatura.id,
        tenant_id=fatura.tenant_id,
        contrato_id=fatura.contrato_id,
        client_id=fatura.client_id,
        client_name=fatura.client.full_name if fatura.client else None,
        contrato_titulo=fatura.contrato.titulo if fatura.contrato else None,
        numero=fatura.numero,
        referencia=fatura.referencia,
        valor=fatura.valor,
        valor_pago=fatura.valor_pago,
        data_vencimento=fatura.data_vencimento,
        data_pagamento=fatura.data_pagamento,
        status=fatura.status,
        forma_pagamento=fatura.forma_pagamento,
        observacoes=fatura.observacoes,
        nosso_numero=fatura.nosso_numero,
        created_at=fatura.created_at,
        updated_at=fatura.updated_at,
    )


@router.get("", response_model=ContratoListResponse)
async def list_contratos(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status_filter: Optional[StatusContrato] = Query(None, alias="status"),
    tipo: Optional[TipoContrato] = Query(None),
    client_id: Optional[UUID] = Query(None),
    assigned_to: Optional[UUID] = Query(None),
    search: Optional[str] = Query(None),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ContratoListResponse:
    """List contracts with filtering and pagination."""
    repo = ContratoRepository(session, tenant_id)
    items, total = await repo.search(
        search=search,
        status=status_filter,
        client_id=client_id,
        assigned_to=assigned_to,
        skip=skip,
        limit=limit,
    )

    return ContratoListResponse(
        items=[_contrato_to_response(c) for c in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=ContratoResponse, status_code=status.HTTP_201_CREATED)
async def create_contrato(
    data: ContratoCreate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ContratoResponse:
    """Create a new contract."""
    service = ContratoService(session, tenant_id)
    contrato = await service.criar_contrato(**data.model_dump(exclude_unset=True))
    await session.commit()
    return _contrato_to_response(contrato)


@router.get("/{contrato_id}", response_model=ContratoResponse)
async def get_contrato(
    contrato_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ContratoResponse:
    """Get contract details."""
    repo = ContratoRepository(session, tenant_id)
    contrato = await repo.get(contrato_id)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")
    return _contrato_to_response(contrato)


@router.put("/{contrato_id}", response_model=ContratoResponse)
async def update_contrato(
    contrato_id: UUID,
    data: ContratoUpdate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ContratoResponse:
    """Update an existing contract."""
    repo = ContratoRepository(session, tenant_id)
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    contrato = await repo.update(contrato_id, **update_data)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")

    await session.commit()
    return _contrato_to_response(contrato)


@router.delete("/{contrato_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contrato(
    contrato_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
):
    """Delete a contract (soft delete by setting status to cancelado)."""
    repo = ContratoRepository(session, tenant_id)
    contrato = await repo.update(contrato_id, status=StatusContrato.CANCELADO)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")
    await session.commit()


@router.post("/{contrato_id}/gerar-faturas", response_model=list[FaturaResponse])
async def gerar_faturas(
    contrato_id: UUID,
    ano: int = Query(..., ge=2020, le=2100),
    mes: int = Query(..., ge=1, le=12),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> list[FaturaResponse]:
    """Generate invoices for a specific contract and month."""
    service = ContratoService(session, tenant_id)
    faturas = await service.gerar_faturas_mes(ano, mes, contrato_id=contrato_id)
    await session.commit()

    if not faturas:
        raise HTTPException(
            status_code=400,
            detail="Nenhuma fatura gerada. Verifique se o contrato está ativo e tem valor mensal definido.",
        )

    return [_fatura_to_response(f) for f in faturas]


@router.get("/{contrato_id}/faturas", response_model=FaturaListResponse)
async def list_contrato_faturas(
    contrato_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> FaturaListResponse:
    """List invoices for a specific contract."""
    repo = FaturaRepository(session, tenant_id)
    items = await repo.list_by_contrato(contrato_id, skip=skip, limit=limit)
    total = await repo.count(filters={"contrato_id": contrato_id})

    return FaturaListResponse(
        items=[_fatura_to_response(f) for f in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/{contrato_id}/exportar/pdf")
async def exportar_pdf(
    contrato_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
):
    """Export contract as PDF document."""
    try:
        service = ContratoDocumentService(session, tenant_id)
        pdf_bytes = await service.generate_pdf(contrato_id)

        repo = ContratoRepository(session, tenant_id)
        contrato = await repo.get(contrato_id)
        filename = f"contrato_{contrato.numero_contrato}.pdf" if contrato else "contrato.pdf"

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{contrato_id}/exportar/docx")
async def exportar_docx(
    contrato_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
):
    """Export contract as DOCX document."""
    try:
        service = ContratoDocumentService(session, tenant_id)
        docx_bytes = await service.generate_docx(contrato_id)

        repo = ContratoRepository(session, tenant_id)
        contrato = await repo.get(contrato_id)
        filename = f"contrato_{contrato.numero_contrato}.docx" if contrato else "contrato.docx"

        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{contrato_id}/enviar")
async def enviar_contrato(
    contrato_id: UUID,
    canal: str = Query("todos", description="Canal de envio: 'chatwit', 'email', ou 'todos'"),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
):
    """Send contract to client via ChatWoot (WhatsApp) and/or email.

    Generates a PDF, creates a download URL, and sends to the client
    through the selected channels.
    """
    from platform_core.config import settings

    service = ContratoDocumentService(session, tenant_id)

    # Build the PDF download URL from frontend URL (since backend may not be directly accessible)
    base_url = settings.frontend_url.rstrip("/")
    pdf_url = f"{base_url}/api/contratos/{contrato_id}/exportar/pdf"

    results = {"chatwit": None, "email": None}

    if canal in ("chatwit", "todos"):
        try:
            result = await service.send_to_client_chatwit(contrato_id, pdf_url)
            results["chatwit"] = {"status": "enviado", "detail": result}
        except ValueError as e:
            results["chatwit"] = {"status": "erro", "detail": str(e)}
        except Exception as e:
            logger.error("erro_envio_chatwit", extra={"error": str(e), "contrato_id": str(contrato_id)})
            results["chatwit"] = {"status": "erro", "detail": str(e)}

    if canal in ("email", "todos"):
        try:
            success = await service.send_to_client_email(contrato_id, pdf_url)
            results["email"] = {
                "status": "enviado" if success else "erro",
                "detail": "E-mail enviado com sucesso" if success else "Falha no envio",
            }
        except ValueError as e:
            results["email"] = {"status": "erro", "detail": str(e)}
        except Exception as e:
            logger.error("erro_envio_email", extra={"error": str(e), "contrato_id": str(contrato_id)})
            results["email"] = {"status": "erro", "detail": str(e)}

    return results
