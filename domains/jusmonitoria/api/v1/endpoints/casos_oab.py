"""API endpoints for OAB-scraped cases."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import get_current_tenant_id, get_current_user
from domains.jusmonitoria.services.caso_oab_service import (
    cancel_sync,
    enqueue_sync_all_oabs,
    enqueue_sync_oab,
    get_all_sync_statuses,
    get_sync_status,
)
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.db.repositories.caso_oab import CasoOABRepository
from domains.jusmonitoria.schemas.caso_oab import (
    CasoOABCreate,
    CasoOABDetail,
    CasoOABListItem,
    CasoOABListResponse,
    SyncAllTriggerResponse,
    SyncStatusAllResponse,
    SyncStatusResponse,
    SyncTriggerResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/casos-oab", tags=["casos-oab"])


@router.get("", response_model=CasoOABListResponse)
async def list_casos(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> CasoOABListResponse:
    """List all OAB-scraped cases for the current tenant."""
    repo = CasoOABRepository(session, tenant_id)
    items, total = await repo.list_all(skip=skip, limit=limit)
    return CasoOABListResponse(
        items=[CasoOABListItem.model_validate(p) for p in items],
        total=total,
    )


@router.get("/sync-status", response_model=SyncStatusResponse)
async def get_sync_status_endpoint(
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> SyncStatusResponse:
    """Get the sync status for the current user's OAB."""
    if not current_user.oab_number or not current_user.oab_state:
        return SyncStatusResponse(
            status="no_oab",
            oab_numero=None,
            oab_uf=None,
        )

    result = await get_sync_status(
        session, tenant_id, current_user.oab_number, current_user.oab_state,
    )
    return SyncStatusResponse(**result)


@router.get("/sync-status-all", response_model=SyncStatusAllResponse)
async def get_sync_status_all_endpoint(
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> SyncStatusAllResponse:
    """Get sync status for ALL active OABs of the current user."""
    statuses_raw = await get_all_sync_statuses(
        session=session,
        tenant_id=tenant_id,
        user_id=current_user.id,
    )
    statuses = [SyncStatusResponse(**s) for s in statuses_raw]
    any_running = any(s.status == "running" for s in statuses)
    return SyncStatusAllResponse(statuses=statuses, any_running=any_running)


@router.get("/{caso_id}", response_model=CasoOABDetail)
async def get_caso_detail(
    caso_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> CasoOABDetail:
    """Get full case detail with partes, movimentacoes, and documentos."""
    repo = CasoOABRepository(session, tenant_id)
    caso = await repo.get(caso_id)
    if not caso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso não encontrado")
    return CasoOABDetail.model_validate(caso)


@router.post("", response_model=CasoOABListItem, status_code=status.HTTP_201_CREATED)
async def create_caso(
    data: CasoOABCreate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> CasoOABListItem:
    """Manually add a process by CNJ number."""
    repo = CasoOABRepository(session, tenant_id)

    numero_clean = data.numero.replace(".", "").replace("-", "").replace(" ", "")

    existing = await repo.get_by_numero(numero_clean)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Processo {data.numero} já existe nos seus casos",
        )

    oab_numero = current_user.oab_number or ""
    oab_uf = current_user.oab_state or ""

    caso = await repo.create(
        numero=numero_clean,
        oab_numero=oab_numero,
        oab_uf=oab_uf,
        tribunal="trf1",
        criado_por=current_user.id,
    )
    await session.commit()
    return CasoOABListItem.model_validate(caso)


@router.delete("/{caso_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_caso(
    caso_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> None:
    """Remove a case."""
    repo = CasoOABRepository(session, tenant_id)
    deleted = await repo.delete(caso_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso não encontrado")
    await session.commit()


@router.post("/sync", response_model=SyncTriggerResponse)
async def trigger_sync(
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> SyncTriggerResponse:
    """Trigger manual OAB sync using the current user's OAB from their profile."""
    if not current_user.oab_number or not current_user.oab_state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Configure seu número OAB no perfil antes de sincronizar.",
        )

    result = await enqueue_sync_oab(
        session=session,
        tenant_id=tenant_id,
        oab_numero=current_user.oab_number,
        oab_uf=current_user.oab_state,
        user_id=current_user.id,
    )
    return SyncTriggerResponse(**result)


@router.post("/sync/cancel")
async def cancel_sync_endpoint(
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict:
    """Cancel a running OAB sync."""
    if not current_user.oab_number or not current_user.oab_state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhuma OAB configurada.",
        )

    return await cancel_sync(
        session=session,
        tenant_id=tenant_id,
        oab_numero=current_user.oab_number,
        oab_uf=current_user.oab_state,
    )


@router.post("/sync-all", response_model=SyncAllTriggerResponse)
async def trigger_sync_all(
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> SyncAllTriggerResponse:
    """Trigger sync for ALL active OABs of the current user."""
    result = await enqueue_sync_all_oabs(
        session=session,
        tenant_id=tenant_id,
        user_id=current_user.id,
    )
    return SyncAllTriggerResponse(**result)


@router.post("/{caso_id}/visto", response_model=CasoOABListItem)
async def marcar_visto(
    caso_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> CasoOABListItem:
    """Mark all new movements as seen."""
    repo = CasoOABRepository(session, tenant_id)
    caso = await repo.marcar_visto(caso_id)
    if not caso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso não encontrado")
    await session.commit()
    return CasoOABListItem.model_validate(caso)
