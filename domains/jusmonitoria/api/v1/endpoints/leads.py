"""API endpoints for Lead management."""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import get_current_user, get_current_tenant_id
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.lead import Lead, LeadSource, LeadStage, LeadStatus
from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.db.repositories.lead import LeadRepository
from domains.jusmonitoria.schemas.lead import (
    LeadCreate,
    LeadListResponse,
    LeadResponse,
    LeadScoreUpdate,
    LeadStageUpdate,
    LeadUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("", response_model=LeadListResponse)
async def list_leads(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of records to return"),
    status: Optional[LeadStatus] = Query(None, description="Filter by status"),
    stage: Optional[LeadStage] = Query(None, description="Filter by stage"),
    source: Optional[LeadSource] = Query(None, description="Filter by source"),
    score_min: Optional[int] = Query(None, ge=0, le=100, description="Minimum score"),
    assigned_to: Optional[UUID] = Query(None, description="Filter by assigned user"),
    date_from: Optional[datetime] = Query(None, description="Filter by created date from"),
    date_to: Optional[datetime] = Query(None, description="Filter by created date to"),
    search: Optional[str] = Query(None, description="Search by name, email, or phone"),
    sort_by: str = Query("created_at", description="Sort field (created_at, score, updated_at)"),
    sort_order: str = Query("desc", description="Sort order (asc, desc)"),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> LeadListResponse:
    """
    List leads with filtering, pagination, and sorting.
    
    Filters:
    - status: Filter by lead status
    - stage: Filter by funnel stage
    - source: Filter by acquisition source
    - score_min: Minimum lead score
    - assigned_to: Filter by assigned user
    - date_from/date_to: Filter by creation date range
    - search: Search in name, email, phone
    
    Sorting:
    - sort_by: Field to sort by (created_at, score, updated_at)
    - sort_order: Sort direction (asc, desc)
    """
    # Build query with tenant filter
    query = select(Lead).where(Lead.tenant_id == tenant_id)
    
    # Apply filters
    filters = []
    
    if status:
        filters.append(Lead.status == status)
    
    if stage:
        filters.append(Lead.stage == stage)
    
    if source:
        filters.append(Lead.source == source)
    
    if score_min is not None:
        filters.append(Lead.score >= score_min)
    
    if assigned_to:
        filters.append(Lead.assigned_to == assigned_to)
    
    if date_from:
        filters.append(Lead.created_at >= date_from)
    
    if date_to:
        filters.append(Lead.created_at <= date_to)
    
    if search:
        search_pattern = f"%{search}%"
        filters.append(
            or_(
                Lead.full_name.ilike(search_pattern),
                Lead.email.ilike(search_pattern),
                Lead.phone.ilike(search_pattern),
            )
        )
    
    if filters:
        query = query.where(and_(*filters))
    
    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total = total_result.scalar_one()
    
    # Apply sorting
    sort_field = getattr(Lead, sort_by, Lead.created_at)
    if sort_order.lower() == "asc":
        query = query.order_by(sort_field.asc())
    else:
        query = query.order_by(sort_field.desc())
    
    # Apply pagination
    query = query.offset(skip).limit(limit)
    
    # Execute query
    result = await session.execute(query)
    leads = result.scalars().all()
    
    logger.info(
        "Listed leads",
        extra={
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
            "count": len(leads),
            "total": total,
            "filters": {
                "status": status,
                "stage": stage,
                "source": source,
                "score_min": score_min,
            },
        },
    )
    
    return LeadListResponse(
        items=[LeadResponse.model_validate(lead) for lead in leads],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(
    lead_data: LeadCreate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> LeadResponse:
    """
    Create a new lead.
    
    The lead will be automatically associated with the current tenant.
    """
    repo = LeadRepository(session, tenant_id)
    
    # Create lead
    lead = Lead(
        tenant_id=tenant_id,
        full_name=lead_data.full_name,
        phone=lead_data.phone,
        email=lead_data.email,
        source=lead_data.source,
        chatwit_contact_id=lead_data.chatwit_contact_id,
        stage=lead_data.stage,
        score=lead_data.score,
        assigned_to=lead_data.assigned_to,
        status=LeadStatus.ACTIVE,
        metadata=lead_data.metadata,
    )
    
    created_lead = await repo.create(lead)
    await session.commit()
    await session.refresh(created_lead)
    
    logger.info(
        "Created lead",
        extra={
            "lead_id": str(created_lead.id),
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
            "source": lead_data.source,
        },
    )
    
    return LeadResponse.model_validate(created_lead)


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> LeadResponse:
    """
    Get a specific lead by ID.
    
    Returns 404 if lead not found or doesn't belong to tenant.
    """
    repo = LeadRepository(session, tenant_id)
    lead = await repo.get(lead_id)
    
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lead {lead_id} not found",
        )
    
    return LeadResponse.model_validate(lead)


@router.put("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: UUID,
    lead_data: LeadUpdate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> LeadResponse:
    """
    Update a lead.
    
    Only provided fields will be updated. Returns 404 if lead not found.
    """
    repo = LeadRepository(session, tenant_id)
    lead = await repo.get(lead_id)
    
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lead {lead_id} not found",
        )
    
    # Update fields
    update_data = lead_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(lead, field, value)
    
    await session.commit()
    await session.refresh(lead)
    
    logger.info(
        "Updated lead",
        extra={
            "lead_id": str(lead_id),
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
            "updated_fields": list(update_data.keys()),
        },
    )
    
    return LeadResponse.model_validate(lead)


@router.patch("/{lead_id}/stage", response_model=LeadResponse)
async def update_lead_stage(
    lead_id: UUID,
    stage_data: LeadStageUpdate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> LeadResponse:
    """
    Update lead stage in the funnel.
    
    This endpoint is used for drag-and-drop operations in the Kanban board.
    Validates transitions using the state machine.
    """
    from domains.jusmonitoria.services.crm.lead_state_machine import (
        InvalidTransitionError,
        LeadStateMachine,
    )
    
    state_machine = LeadStateMachine(session, tenant_id)
    
    try:
        lead = await state_machine.transition(
            lead_id=lead_id,
            to_stage=stage_data.stage,
            user_id=current_user.id,
            reason="Manual stage update via API",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except InvalidTransitionError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid transition: {str(e)}",
        )
    
    await session.commit()
    await session.refresh(lead)
    
    logger.info(
        "Updated lead stage",
        extra={
            "lead_id": str(lead_id),
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
            "new_stage": stage_data.stage,
        },
    )
    
    return LeadResponse.model_validate(lead)


@router.patch("/{lead_id}/score", response_model=LeadResponse)
async def update_lead_score(
    lead_id: UUID,
    score_data: LeadScoreUpdate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> LeadResponse:
    """
    Update lead score.
    
    Score is typically updated by AI analysis but can be manually adjusted.
    """
    repo = LeadRepository(session, tenant_id)
    lead = await repo.update_score(lead_id, score_data.score)
    
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lead {lead_id} not found",
        )
    
    await session.commit()
    await session.refresh(lead)
    
    logger.info(
        "Updated lead score",
        extra={
            "lead_id": str(lead_id),
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
            "new_score": score_data.score,
        },
    )
    
    return LeadResponse.model_validate(lead)


@router.get("/{lead_id}/stage-history")
async def get_lead_stage_history(
    lead_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> list[dict]:
    """
    Get stage transition history for a lead.
    
    Returns a list of all stage transitions with timestamps and users.
    """
    from domains.jusmonitoria.services.crm.lead_state_machine import LeadStateMachine
    
    state_machine = LeadStateMachine(session, tenant_id)
    
    try:
        history = await state_machine.get_stage_history(lead_id)
        return history
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.get("/{lead_id}/valid-stages")
async def get_valid_next_stages(
    lead_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict:
    """
    Get valid next stages for a lead.
    
    Returns the current stage and list of valid next stages.
    """
    from domains.jusmonitoria.services.crm.lead_state_machine import LeadStateMachine
    
    repo = LeadRepository(session, tenant_id)
    lead = await repo.get(lead_id)
    
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lead {lead_id} not found",
        )
    
    state_machine = LeadStateMachine(session, tenant_id)
    valid_stages = state_machine.get_valid_next_stages(lead.stage)
    
    return {
        "current_stage": lead.stage.value,
        "valid_next_stages": [stage.value for stage in valid_stages],
    }


@router.post("/{lead_id}/calculate-score", response_model=LeadResponse)
async def calculate_lead_score(
    lead_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> LeadResponse:
    """
    Manually trigger lead score calculation.
    
    Analyzes urgency, case type, engagement, and completeness to calculate
    a quality score (0-100).
    """
    from domains.jusmonitoria.services.crm.lead_scorer import LeadScorer
    
    scorer = LeadScorer(session, tenant_id)
    
    try:
        lead = await scorer.update_lead_score(lead_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    
    await session.commit()
    await session.refresh(lead)
    
    logger.info(
        "Manually calculated lead score",
        extra={
            "lead_id": str(lead_id),
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
            "score": lead.score,
        },
    )
    
    return LeadResponse.model_validate(lead)


@router.post("/{lead_id}/convert", response_model=dict, status_code=status.HTTP_200_OK)
async def convert_lead_to_client(
    lead_id: UUID,
    client_data: Optional[dict] = None,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict:
    """
    Convert a lead to a client.

    Atomically creates a Client from the Lead data and marks the lead as converted.
    Also updates the identifier in Chatwit from jm_lead_X to jm_client_Y.
    """
    from domains.jusmonitoria.db.models.client import Client, ClientStatus
    from domains.jusmonitoria.db.repositories.client import ClientRepository

    lead_repo = LeadRepository(session, tenant_id)
    lead = await lead_repo.get(lead_id)

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lead {lead_id} not found",
        )

    if lead.status == LeadStatus.CONVERTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lead already converted",
        )

    # Create client from lead data (allow overrides via client_data)
    overrides = client_data or {}
    client_repo = ClientRepository(session, tenant_id)
    client = await client_repo.create(
        full_name=overrides.get("full_name", lead.full_name),
        email=overrides.get("email", lead.email),
        phone=overrides.get("phone", lead.phone),
        cpf_cnpj=overrides.get("cpf_cnpj"),
        chatwit_contact_id=lead.chatwit_contact_id,
        lead_id=lead.id,
        assigned_to=overrides.get("assigned_to", lead.assigned_to),
        status=ClientStatus.ACTIVE,
        health_score=100,
    )

    # Mark lead as converted
    await lead_repo.mark_as_converted(lead.id, client.id)
    await session.commit()

    # Update identifier in Chatwit (jm_lead → jm_client)
    if lead.chatwit_contact_id:
        from domains.jusmonitoria.services.chatwit_client import sync_identifier_to_chatwit
        # Get bot token from tenant settings
        from domains.jusmonitoria.db.models.tenant import Tenant
        tenant_result = await session.execute(
            select(Tenant).where(Tenant.id == tenant_id)
        )
        tenant = tenant_result.scalar_one_or_none()
        if tenant and tenant.settings:
            metadata = {
                "chatwit_base_url": tenant.settings.get("chatwit_base_url", ""),
                "account_id": tenant.chatwit_account_id,
                "chatwit_agent_bot_token": tenant.settings.get("chatwit_agent_bot_token", ""),
            }
            await sync_identifier_to_chatwit(
                entity_id=str(client.id),
                chatwit_contact_id=lead.chatwit_contact_id,
                metadata=metadata,
                entity_type="client",
            )

    # Publish events
    from domains.jusmonitoria.tasks.events.bus import publish
    from domains.jusmonitoria.tasks.events.types import LeadConvertedEvent, ClientCreatedEvent
    await publish(LeadConvertedEvent(
        tenant_id=tenant_id,
        lead_id=lead.id,
        client_id=client.id,
    ))
    await publish(ClientCreatedEvent(
        tenant_id=tenant_id,
        client_id=client.id,
        from_lead_id=lead.id,
    ))

    logger.info(
        "Lead converted to client",
        extra={
            "lead_id": str(lead_id),
            "client_id": str(client.id),
            "tenant_id": str(tenant_id),
        },
    )

    return {
        "status": "converted",
        "lead_id": str(lead.id),
        "client_id": str(client.id),
    }


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> None:
    """
    Delete a lead.
    
    This performs a hard delete. Consider using status update to ARCHIVED instead.
    """
    repo = LeadRepository(session, tenant_id)
    lead = await repo.get(lead_id)
    
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lead {lead_id} not found",
        )
    
    await repo.delete(lead_id)
    await session.commit()
    
    logger.info(
        "Deleted lead",
        extra={
            "lead_id": str(lead_id),
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
        },
    )
