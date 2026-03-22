"""Global search endpoint for Command Palette."""

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import get_current_tenant_id, get_current_user
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.client import Client
from domains.jusmonitoria.db.models.legal_case import LegalCase
from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.schemas.search import GlobalSearchResponse, SearchResultItem

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=GlobalSearchResponse)
async def global_search(
    q: str = Query(..., min_length=2, max_length=100, description="Search term"),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> GlobalSearchResponse:
    """
    Search clients and legal cases for the Command Palette.

    Returns up to 5 clients and 5 legal cases matching the term,
    strictly scoped to the authenticated user's tenant.
    """
    pattern = f"%{q}%"

    client_query = (
        select(Client)
        .where(Client.tenant_id == tenant_id)
        .where(
            or_(
                Client.full_name.ilike(pattern),
                Client.cpf_cnpj.ilike(pattern),
                Client.email.ilike(pattern),
            )
        )
        .limit(5)
    )

    case_query = (
        select(LegalCase)
        .where(LegalCase.tenant_id == tenant_id)
        .where(
            or_(
                LegalCase.cnj_number.ilike(pattern),
                LegalCase.subject.ilike(pattern),
                LegalCase.plaintiff.ilike(pattern),
                LegalCase.defendant.ilike(pattern),
            )
        )
        .limit(5)
    )

    client_result, case_result = await asyncio.gather(
        session.execute(client_query),
        session.execute(case_query),
    )

    clients = [
        SearchResultItem(
            id=c.id,
            type="client",
            label=c.full_name,
            subtitle=c.cpf_cnpj or c.email,
        )
        for c in client_result.scalars().all()
    ]

    legal_cases = [
        SearchResultItem(
            id=lc.id,
            type="legal_case",
            label=lc.cnj_number,
            subtitle=lc.subject,
        )
        for lc in case_result.scalars().all()
    ]

    return GlobalSearchResponse(clients=clients, legal_cases=legal_cases)
