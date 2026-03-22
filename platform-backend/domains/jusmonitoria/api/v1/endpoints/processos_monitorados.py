"""API endpoints for monitored legal processes (Casos)."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import get_current_tenant_id, get_current_user
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.db.repositories.processo_monitorado import ProcessoMonitoradoRepository
from domains.jusmonitoria.schemas.processo_monitorado import (
    ProcessoMonitoradoCreate,
    ProcessoMonitoradoListResponse,
    ProcessoMonitoradoResponse,
    ProcessoMonitoradoUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/processos-monitorados", tags=["processos-monitorados"])


@router.get("", response_model=ProcessoMonitoradoListResponse)
async def list_processos_monitorados(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ProcessoMonitoradoListResponse:
    """List all monitored processes for the current tenant."""
    repo = ProcessoMonitoradoRepository(session, tenant_id)
    items, total = await repo.list_all(skip=skip, limit=limit)
    return ProcessoMonitoradoListResponse(
        items=[ProcessoMonitoradoResponse.model_validate(p) for p in items],
        total=total,
    )


@router.post("", response_model=ProcessoMonitoradoResponse, status_code=status.HTTP_201_CREATED)
async def create_processo_monitorado(
    data: ProcessoMonitoradoCreate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ProcessoMonitoradoResponse:
    """Add a new process to monitor."""
    repo = ProcessoMonitoradoRepository(session, tenant_id)

    # Normalize number
    numero_clean = data.numero.replace(".", "").replace("-", "").replace(" ", "")

    # Check for duplicates
    existing = await repo.get_by_numero(numero_clean)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Processo {data.numero} já está sendo monitorado",
        )

    processo = await repo.create(
        numero=numero_clean,
        apelido=data.apelido,
        criado_por=current_user.id,
    )
    await session.commit()
    return ProcessoMonitoradoResponse.model_validate(processo)


@router.get("/{id}", response_model=ProcessoMonitoradoResponse)
async def get_processo_monitorado(
    id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ProcessoMonitoradoResponse:
    """Get a single monitored process."""
    repo = ProcessoMonitoradoRepository(session, tenant_id)
    processo = await repo.get(id)
    if not processo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    return ProcessoMonitoradoResponse.model_validate(processo)


@router.patch("/{id}", response_model=ProcessoMonitoradoResponse)
async def update_processo_monitorado(
    id: UUID,
    data: ProcessoMonitoradoUpdate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ProcessoMonitoradoResponse:
    """Update a monitored process (apelido)."""
    repo = ProcessoMonitoradoRepository(session, tenant_id)
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar")
    processo = await repo.update(id, **update_data)
    if not processo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    await session.commit()
    return ProcessoMonitoradoResponse.model_validate(processo)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_processo_monitorado(
    id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> None:
    """Remove a monitored process."""
    repo = ProcessoMonitoradoRepository(session, tenant_id)
    deleted = await repo.delete(id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    await session.commit()


@router.post("/{id}/consultar", response_model=ProcessoMonitoradoResponse)
async def consultar_datajud(
    id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ProcessoMonitoradoResponse:
    """Consult DataJud for a monitored process and save the result."""
    from domains.jusmonitoria.services.datajud_service import consultar_datajud as _consultar

    repo = ProcessoMonitoradoRepository(session, tenant_id)
    processo = await repo.get(id)
    if not processo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

    result = await _consultar(numero_processo=processo.numero)

    total_mov = 0
    if result.get("sucesso") and result.get("processo"):
        total_mov = len(result["processo"].get("movimentos") or [])

    updated = await repo.atualizar_datajud(id, dados=result, total_movimentacoes=total_mov)
    await session.commit()

    return ProcessoMonitoradoResponse.model_validate(updated)


@router.post("/{id}/visto", response_model=ProcessoMonitoradoResponse)
async def marcar_visto(
    id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ProcessoMonitoradoResponse:
    """Mark all new movements as seen."""
    repo = ProcessoMonitoradoRepository(session, tenant_id)
    processo = await repo.marcar_visto(id)
    if not processo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    await session.commit()
    return ProcessoMonitoradoResponse.model_validate(processo)
