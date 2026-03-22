"""API endpoints for Financial management."""

import logging
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import get_current_tenant_id, get_current_user
from domains.jusmonitoria.services.cobranca_service import CobrancaService
from domains.jusmonitoria.services.financeiro_service import FinanceiroService
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.fatura import Fatura, StatusFatura
from domains.jusmonitoria.db.models.lancamento import Lancamento, TipoLancamento
from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.db.repositories.fatura import FaturaRepository
from domains.jusmonitoria.db.repositories.lancamento import LancamentoRepository
from domains.jusmonitoria.schemas.fatura import FaturaCreate, FaturaListResponse, FaturaResponse, FaturaUpdate
from domains.jusmonitoria.schemas.financeiro import (
    DashboardFinanceiroResponse,
    LancamentoCreate,
    LancamentoListResponse,
    LancamentoResponse,
    ResumoReceitas,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/financeiro", tags=["financeiro"])


def _lancamento_to_response(lancamento) -> LancamentoResponse:
    """Convert Lancamento model to response with client/contrato names."""
    resp = LancamentoResponse.model_validate(lancamento)
    if lancamento.client:
        resp.client_name = lancamento.client.full_name
    if lancamento.contrato:
        resp.contrato_titulo = lancamento.contrato.titulo
    return resp


def _fatura_to_response(fatura) -> FaturaResponse:
    """Convert Fatura model to response."""
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


@router.get("/dashboard", response_model=DashboardFinanceiroResponse)
async def get_dashboard(
    meses: int = Query(6, ge=1, le=24, description="Número de meses para o histórico"),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> DashboardFinanceiroResponse:
    """Get financial dashboard with metrics and charts."""
    service = FinanceiroService(session, tenant_id)
    data = await service.get_dashboard(meses)
    return DashboardFinanceiroResponse(
        resumo=ResumoReceitas(**data["resumo"]),
        contratos_ativos=data["contratos_ativos"],
        faturas_pendentes=data["faturas_pendentes"],
        faturas_vencidas=data["faturas_vencidas"],
        receita_por_mes=data["receita_por_mes"],
    )


@router.post("/faturas", response_model=FaturaResponse, status_code=status.HTTP_201_CREATED)
async def create_fatura(
    data: FaturaCreate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> FaturaResponse:
    """Create a new invoice."""
    repo = FaturaRepository(session, tenant_id)

    # Generate invoice number: FAT-YYYY-NNNN
    from datetime import datetime as dt
    year = dt.now().year
    count_query = select(func.count(Fatura.id)).where(
        Fatura.tenant_id == tenant_id,
        func.extract("year", Fatura.created_at) == year,
    )
    count_result = await session.execute(count_query)
    seq = (count_result.scalar_one() or 0) + 1
    numero = f"FAT-{year}-{seq:04d}"

    fatura = await repo.create(
        numero=numero,
        **data.model_dump(exclude_unset=True),
    )
    await session.commit()
    return _fatura_to_response(fatura)


@router.get("/faturas", response_model=FaturaListResponse)
async def list_faturas(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status_filter: Optional[StatusFatura] = Query(None, alias="status"),
    client_id: Optional[UUID] = Query(None),
    contrato_id: Optional[UUID] = Query(None),
    data_inicio: Optional[date] = Query(None),
    data_fim: Optional[date] = Query(None),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> FaturaListResponse:
    """List invoices with filters."""
    repo = FaturaRepository(session, tenant_id)

    # Build filters
    query = select(Fatura).where(Fatura.tenant_id == tenant_id)
    if status_filter:
        query = query.where(Fatura.status == status_filter)
    if client_id:
        query = query.where(Fatura.client_id == client_id)
    if contrato_id:
        query = query.where(Fatura.contrato_id == contrato_id)
    if data_inicio:
        query = query.where(Fatura.data_vencimento >= data_inicio)
    if data_fim:
        query = query.where(Fatura.data_vencimento <= data_fim)

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    count_result = await session.execute(count_query)
    total = count_result.scalar_one()

    # Paginate
    query = query.order_by(Fatura.data_vencimento.desc()).offset(skip).limit(limit)
    result = await session.execute(query)
    items = list(result.scalars().all())

    return FaturaListResponse(
        items=[_fatura_to_response(f) for f in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.put("/faturas/{fatura_id}", response_model=FaturaResponse)
async def update_fatura(
    fatura_id: UUID,
    data: FaturaUpdate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> FaturaResponse:
    """Update an invoice (e.g., register payment)."""
    repo = FaturaRepository(session, tenant_id)
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    # If marking as paid and no payment date, set today
    if update_data.get("status") == StatusFatura.PAGA and "data_pagamento" not in update_data:
        update_data["data_pagamento"] = date.today()

    # If setting valor_pago equal to valor, auto-mark as paid
    fatura = await repo.get(fatura_id)
    if not fatura:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")

    if "valor_pago" in update_data and update_data["valor_pago"] >= fatura.valor:
        update_data.setdefault("status", StatusFatura.PAGA)
        update_data.setdefault("data_pagamento", date.today())

    updated = await repo.update(fatura_id, **update_data)
    if not updated:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")

    await session.commit()
    return _fatura_to_response(updated)


@router.post("/faturas/{fatura_id}/enviar-cobranca")
async def enviar_cobranca_fatura(
    fatura_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
):
    """Send a payment reminder for a specific invoice via Chatwit."""
    service = CobrancaService(session, tenant_id)
    cobranca = await service.enviar_cobranca_fatura(fatura_id)
    if not cobranca:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")
    await session.commit()
    return {
        "message": "Cobrança enviada com sucesso" if cobranca.status.value == "enviado" else "Falha ao enviar cobrança",
        "status": cobranca.status.value,
        "cobranca_id": str(cobranca.id),
    }


@router.get("/lancamentos", response_model=LancamentoListResponse)
async def list_lancamentos(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    tipo: Optional[TipoLancamento] = Query(None),
    client_id: Optional[UUID] = Query(None),
    contrato_id: Optional[UUID] = Query(None),
    data_inicio: Optional[date] = Query(None),
    data_fim: Optional[date] = Query(None),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> LancamentoListResponse:
    """List financial transactions."""
    query = select(Lancamento).where(Lancamento.tenant_id == tenant_id)
    if tipo:
        query = query.where(Lancamento.tipo == tipo)
    if client_id:
        query = query.where(Lancamento.client_id == client_id)
    if contrato_id:
        query = query.where(Lancamento.contrato_id == contrato_id)
    if data_inicio:
        query = query.where(Lancamento.data_lancamento >= data_inicio)
    if data_fim:
        query = query.where(Lancamento.data_lancamento <= data_fim)

    count_query = select(func.count()).select_from(query.subquery())
    count_result = await session.execute(count_query)
    total = count_result.scalar_one()

    query = query.order_by(Lancamento.data_lancamento.desc()).offset(skip).limit(limit)
    result = await session.execute(query)
    items = list(result.scalars().all())

    return LancamentoListResponse(
        items=[_lancamento_to_response(i) for i in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/lancamentos/{lancamento_id}", response_model=LancamentoResponse)
async def get_lancamento(
    lancamento_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> LancamentoResponse:
    """Get a specific financial transaction by ID."""
    repo = LancamentoRepository(session, tenant_id)
    lancamento = await repo.get(lancamento_id)
    if not lancamento:
        raise HTTPException(status_code=404, detail="Lancamento nao encontrado")
    return _lancamento_to_response(lancamento)


@router.post("/lancamentos", response_model=LancamentoResponse, status_code=status.HTTP_201_CREATED)
async def create_lancamento(
    data: LancamentoCreate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> LancamentoResponse:
    """Create a financial transaction."""
    repo = LancamentoRepository(session, tenant_id)
    lancamento = await repo.create(**data.model_dump(exclude_unset=True))
    await session.commit()
    return _lancamento_to_response(lancamento)


@router.get("/relatorios/excel")
async def relatorio_excel(
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    client_id: Optional[UUID] = Query(None),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
):
    """Generate and download financial report as Excel."""
    service = FinanceiroService(session, tenant_id)
    output = await service.gerar_relatorio_excel(data_inicio, data_fim, client_id)
    filename = f"relatorio_financeiro_{data_inicio}_{data_fim}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/relatorios/pdf")
async def relatorio_pdf(
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    client_id: Optional[UUID] = Query(None),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
):
    """Generate and download financial report as PDF."""
    service = FinanceiroService(session, tenant_id)
    output = await service.gerar_relatorio_pdf(data_inicio, data_fim, client_id)
    filename = f"relatorio_financeiro_{data_inicio}_{data_fim}.pdf"
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
