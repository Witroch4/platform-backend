"""API endpoints for Client management."""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import get_current_user, get_current_tenant_id
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.client import Client, ClientStatus
from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.db.repositories.client import ClientRepository
from domains.jusmonitoria.db.repositories.client_automation import ClientAutomationRepository
from domains.jusmonitoria.db.repositories.client_note import ClientNoteRepository
from domains.jusmonitoria.schemas.client import (
    ClientAutomationConfig,
    ClientAutomationResponse,
    ClientCreate,
    ClientHealthResponse,
    ClientListResponse,
    ClientNoteCreate,
    ClientNoteResponse,
    ClientResponse,
    ClientUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=ClientListResponse)
async def list_clients(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of records to return"),
    status: Optional[ClientStatus] = Query(None, description="Filter by status"),
    assigned_to: Optional[UUID] = Query(None, description="Filter by assigned user"),
    health_score_max: Optional[int] = Query(None, ge=0, le=100, description="Maximum health score"),
    date_from: Optional[datetime] = Query(None, description="Filter by created date from"),
    date_to: Optional[datetime] = Query(None, description="Filter by created date to"),
    search: Optional[str] = Query(None, description="Search by name, email, phone, or CPF/CNPJ"),
    sort_by: str = Query("created_at", description="Sort field (created_at, full_name, health_score)"),
    sort_order: str = Query("desc", description="Sort order (asc, desc)"),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ClientListResponse:
    """
    List clients with filtering, pagination, and sorting.
    
    Filters:
    - status: Filter by client status
    - assigned_to: Filter by assigned user
    - health_score_max: Maximum health score (for finding at-risk clients)
    - date_from/date_to: Filter by creation date range
    - search: Search in name, email, phone, CPF/CNPJ
    
    Sorting:
    - sort_by: Field to sort by (created_at, full_name, health_score)
    - sort_order: Sort direction (asc, desc)
    """
    # Build query with tenant filter
    query = select(Client).where(Client.tenant_id == tenant_id)
    
    # Apply filters
    filters = []
    
    if status:
        filters.append(Client.status == status)
    
    if assigned_to:
        filters.append(Client.assigned_to == assigned_to)
    
    if health_score_max is not None:
        filters.append(Client.health_score <= health_score_max)
    
    if date_from:
        filters.append(Client.created_at >= date_from)
    
    if date_to:
        filters.append(Client.created_at <= date_to)
    
    if search:
        search_pattern = f"%{search}%"
        filters.append(
            or_(
                Client.full_name.ilike(search_pattern),
                Client.email.ilike(search_pattern),
                Client.phone.ilike(search_pattern),
                Client.cpf_cnpj.ilike(search_pattern),
            )
        )
    
    if filters:
        query = query.where(and_(*filters))
    
    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total = total_result.scalar_one()
    
    # Apply sorting
    sort_field = getattr(Client, sort_by, Client.created_at)
    if sort_order.lower() == "asc":
        query = query.order_by(sort_field.asc())
    else:
        query = query.order_by(sort_field.desc())
    
    # Apply pagination
    query = query.offset(skip).limit(limit)
    
    # Execute query
    result = await session.execute(query)
    clients = result.scalars().all()
    
    logger.info(
        "Listed clients",
        extra={
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
            "count": len(clients),
            "total": total,
        },
    )
    
    return ClientListResponse(
        items=[ClientResponse.model_validate(client) for client in clients],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    client_data: ClientCreate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ClientResponse:
    """
    Create a new client.
    
    The client will be automatically associated with the current tenant.
    Optionally link to a lead if this is a conversion.
    """
    repo = ClientRepository(session, tenant_id)
    
    # Check for duplicate CPF/CNPJ if provided
    if client_data.cpf_cnpj:
        existing = await repo.get_by_cpf_cnpj(client_data.cpf_cnpj)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Client with CPF/CNPJ {client_data.cpf_cnpj} already exists",
            )
    
    # Create client
    client = await repo.create(
        full_name=client_data.full_name,
        cpf_cnpj=client_data.cpf_cnpj,
        email=client_data.email,
        phone=client_data.phone,
        address=client_data.address,
        chatwit_contact_id=client_data.chatwit_contact_id,
        assigned_to=client_data.assigned_to,
        lead_id=client_data.lead_id,
        notes=client_data.notes,
        custom_fields=client_data.custom_fields,
        status=ClientStatus.ACTIVE,
        health_score=100,  # Start with perfect health
    )
    
    await session.commit()
    await session.refresh(client)
    
    logger.info(
        "Created client",
        extra={
            "client_id": str(client.id),
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
            "from_lead": client_data.lead_id is not None,
        },
    )
    
    return ClientResponse.model_validate(client)


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ClientResponse:
    """
    Get a specific client by ID.
    
    Returns 404 if client not found or doesn't belong to tenant.
    """
    repo = ClientRepository(session, tenant_id)
    client = await repo.get(client_id)
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client {client_id} not found",
        )
    
    return ClientResponse.model_validate(client)


@router.put("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: UUID,
    client_data: ClientUpdate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ClientResponse:
    """
    Update a client.
    
    Only provided fields will be updated. Returns 404 if client not found.
    """
    repo = ClientRepository(session, tenant_id)
    client = await repo.get(client_id)
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client {client_id} not found",
        )
    
    # Check for duplicate CPF/CNPJ if being updated
    if client_data.cpf_cnpj and client_data.cpf_cnpj != client.cpf_cnpj:
        existing = await repo.get_by_cpf_cnpj(client_data.cpf_cnpj)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Client with CPF/CNPJ {client_data.cpf_cnpj} already exists",
            )
    
    # Update fields
    update_data = client_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(client, field, value)
    
    await session.commit()
    await session.refresh(client)
    
    logger.info(
        "Updated client",
        extra={
            "client_id": str(client_id),
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
            "updated_fields": list(update_data.keys()),
        },
    )
    
    return ClientResponse.model_validate(client)


@router.get("/{client_id}/timeline")
async def get_client_timeline(
    client_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    date_from: Optional[datetime] = Query(None, description="Filter by date from"),
    date_to: Optional[datetime] = Query(None, description="Filter by date to"),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> dict:
    """
    Get timeline of events for a client.
    
    Aggregates all events related to the client:
    - Case movements
    - Messages
    - Notes
    - Automations
    - Status changes
    
    Returns events in chronological order with pagination.
    """
    from domains.jusmonitoria.services.crm.timeline import TimelineService
    
    # Verify client exists and belongs to tenant
    repo = ClientRepository(session, tenant_id)
    client = await repo.get(client_id)
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client {client_id} not found",
        )
    
    # Get timeline events
    timeline_service = TimelineService(session, tenant_id)
    events = await timeline_service.get_client_timeline(
        client_id=client_id,
        skip=skip,
        limit=limit,
        event_type=event_type,
        date_from=date_from,
        date_to=date_to,
    )
    
    return events


@router.get("/{client_id}/health", response_model=ClientHealthResponse)
async def get_client_health(
    client_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ClientHealthResponse:
    """
    Get client health dashboard.
    
    Calculates health score based on:
    - Activity level
    - Case status
    - Response time
    - Risk factors
    
    Returns alerts and recommendations for action.
    """
    from domains.jusmonitoria.services.crm.health_dashboard import HealthDashboardService
    
    # Verify client exists and belongs to tenant
    repo = ClientRepository(session, tenant_id)
    client = await repo.get(client_id)
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client {client_id} not found",
        )
    
    # Get health dashboard
    health_service = HealthDashboardService(session, tenant_id)
    health_data = await health_service.get_client_health(client_id)
    
    return health_data


@router.post("/{client_id}/notes", response_model=ClientNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_client_note(
    client_id: UUID,
    note_data: ClientNoteCreate,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ClientNoteResponse:
    """
    Create a note for a client.
    
    Supports markdown formatting and @mentions.
    Mentioned users will receive notifications.
    """
    # Verify client exists and belongs to tenant
    client_repo = ClientRepository(session, tenant_id)
    client = await client_repo.get(client_id)
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client {client_id} not found",
        )
    
    # Create note with automatic mention extraction
    note_repo = ClientNoteRepository(session, tenant_id)
    note = await note_repo.create_with_mentions(
        client_id=client_id,
        author_id=current_user.id,
        content=note_data.content,
    )
    
    await session.commit()
    await session.refresh(note)
    
    # Send notifications to mentioned users
    if note.mentions:
        from domains.jusmonitoria.services.notification_service import NotificationService

        notification_service = NotificationService(session)
        for mentioned_user_id in note.mentions:
            try:
                await notification_service.create_mention_notification(
                    tenant_id=tenant_id,
                    user_id=UUID(mentioned_user_id),
                    mentioned_by_user_id=current_user.id,
                    mentioned_by_name=current_user.full_name,
                    client_id=client_id,
                    client_name=client.full_name,
                    note_preview=note_data.content[:200],
                )
            except Exception as e:
                logger.warning(
                    "Failed to send mention notification",
                    extra={"mentioned_user_id": mentioned_user_id, "error": str(e)},
                )

    logger.info(
        "Created client note",
        extra={
            "note_id": str(note.id),
            "client_id": str(client_id),
            "tenant_id": str(tenant_id),
            "author_id": str(current_user.id),
            "mentions_count": len(note.mentions),
        },
    )
    
    return ClientNoteResponse.model_validate(note)


@router.get("/{client_id}/notes", response_model=list[ClientNoteResponse])
async def list_client_notes(
    client_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> list[ClientNoteResponse]:
    """
    List all notes for a client.
    
    Returns notes in reverse chronological order.
    """
    # Verify client exists and belongs to tenant
    client_repo = ClientRepository(session, tenant_id)
    client = await client_repo.get(client_id)
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client {client_id} not found",
        )
    
    # Get notes
    note_repo = ClientNoteRepository(session, tenant_id)
    notes = await note_repo.get_by_client(client_id, skip=skip, limit=limit)
    
    return [ClientNoteResponse.model_validate(note) for note in notes]


@router.get("/{client_id}/automations", response_model=ClientAutomationResponse)
async def get_client_automations(
    client_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ClientAutomationResponse:
    """
    Get automation configuration for a client.
    
    Returns current state of all automation toggles.
    """
    # Verify client exists and belongs to tenant
    client_repo = ClientRepository(session, tenant_id)
    client = await client_repo.get(client_id)
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client {client_id} not found",
        )
    
    # Get or create automation config
    automation_repo = ClientAutomationRepository(session, tenant_id)
    config = await automation_repo.get_or_create(client_id)
    
    return ClientAutomationResponse(
        client_id=client_id,
        briefing_matinal=config.briefing_matinal,
        alertas_urgentes=config.alertas_urgentes,
        resumo_semanal=config.resumo_semanal,
        updated_at=config.updated_at,
    )


@router.put("/{client_id}/automations", response_model=ClientAutomationResponse)
async def update_client_automations(
    client_id: UUID,
    automation_data: ClientAutomationConfig,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> ClientAutomationResponse:
    """
    Update automation configuration for a client.
    
    Enables or disables specific automations:
    - briefing_matinal: Daily morning briefing
    - alertas_urgentes: Urgent alerts
    - resumo_semanal: Weekly summary
    """
    # Verify client exists and belongs to tenant
    client_repo = ClientRepository(session, tenant_id)
    client = await client_repo.get(client_id)
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client {client_id} not found",
        )
    
    # Update automation config
    automation_repo = ClientAutomationRepository(session, tenant_id)
    config = await automation_repo.update_config(
        client_id=client_id,
        briefing_matinal=automation_data.briefing_matinal,
        alertas_urgentes=automation_data.alertas_urgentes,
        resumo_semanal=automation_data.resumo_semanal,
    )
    
    await session.commit()
    await session.refresh(config)
    
    logger.info(
        "Updated client automations",
        extra={
            "client_id": str(client_id),
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
            "config": {
                "briefing_matinal": config.briefing_matinal,
                "alertas_urgentes": config.alertas_urgentes,
                "resumo_semanal": config.resumo_semanal,
            },
        },
    )
    
    return ClientAutomationResponse(
        client_id=client_id,
        briefing_matinal=config.briefing_matinal,
        alertas_urgentes=config.alertas_urgentes,
        resumo_semanal=config.resumo_semanal,
        updated_at=config.updated_at,
    )


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: UUID,
    tenant_id: UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> None:
    """
    Delete a client.
    
    This performs a hard delete. Consider using status update to INACTIVE instead.
    """
    repo = ClientRepository(session, tenant_id)
    client = await repo.get(client_id)
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client {client_id} not found",
        )
    
    await repo.delete(client_id)
    await session.commit()
    
    logger.info(
        "Deleted client",
        extra={
            "client_id": str(client_id),
            "tenant_id": str(tenant_id),
            "user_id": str(current_user.id),
        },
    )
