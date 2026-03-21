"""Dashboard API endpoints for Central Operacional."""

from datetime import date, datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import get_current_user
from domains.jusmonitoria.db.models.case_movement import CaseMovement
from domains.jusmonitoria.db.models.client import Client
from domains.jusmonitoria.db.models.legal_case import LegalCase
from domains.jusmonitoria.db.models.user import User
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.schemas.dashboard import (
    AttentionCaseItem,
    DashboardAttentionResponse,
    DashboardFilters,
    DashboardGoodNewsResponse,
    DashboardMetricsResponse,
    DashboardNoiseResponse,
    DashboardUrgentResponse,
    GoodNewsItem,
    NoiseItem,
    OfficeMetrics,
    UrgentCaseItem,
)
from domains.jusmonitoria.schemas.user_preference import (
    DashboardPreferences,
    DashboardPreferencesUpdate,
    UserPreferenceCreate,
    UserPreferenceResponse,
    UserPreferenceUpdate,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/urgent", response_model=DashboardUrgentResponse)
async def get_urgent_cases(
    limit: int = Query(default=20, ge=1, le=100),
    assigned_to: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Get urgent cases (deadline < 3 days).
    
    Returns cases with approaching deadlines that require immediate attention.
    """
    tenant_id = current_user.tenant_id
    today = date.today()
    urgent_threshold = today + timedelta(days=3)
    
    # Build query
    query = (
        select(LegalCase, Client)
        .join(Client, LegalCase.client_id == Client.id)
        .where(
            and_(
                LegalCase.tenant_id == tenant_id,
                LegalCase.monitoring_enabled == True,
                LegalCase.next_deadline.isnot(None),
                LegalCase.next_deadline <= urgent_threshold,
                LegalCase.next_deadline >= today,
            )
        )
    )
    
    # Apply filters
    if assigned_to:
        query = query.where(Client.assigned_to == assigned_to)
    
    # Order by deadline (most urgent first)
    query = query.order_by(LegalCase.next_deadline.asc()).limit(limit)
    
    result = await db.execute(query)
    rows = result.all()
    
    # Build response items
    items = []
    for case, client in rows:
        days_remaining = (case.next_deadline - today).days
        items.append(
            UrgentCaseItem(
                case_id=case.id,
                cnj_number=case.cnj_number,
                client_id=client.id,
                client_name=client.full_name,
                next_deadline=case.next_deadline,
                days_remaining=days_remaining,
                case_type=case.case_type,
                court=case.court,
                last_movement_date=case.last_movement_date,
            )
        )
    
    return DashboardUrgentResponse(items=items, total=len(items))


@router.get("/attention", response_model=DashboardAttentionResponse)
async def get_attention_cases(
    limit: int = Query(default=20, ge=1, le=100),
    assigned_to: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Get cases needing attention (no movement > 30 days).
    
    Returns cases that have been stagnant and may require action.
    """
    tenant_id = current_user.tenant_id
    today = date.today()
    attention_threshold = today - timedelta(days=30)
    
    # Build query
    query = (
        select(LegalCase, Client)
        .join(Client, LegalCase.client_id == Client.id)
        .where(
            and_(
                LegalCase.tenant_id == tenant_id,
                LegalCase.monitoring_enabled == True,
                LegalCase.last_movement_date.isnot(None),
                LegalCase.last_movement_date <= attention_threshold,
            )
        )
    )
    
    # Apply filters
    if assigned_to:
        query = query.where(Client.assigned_to == assigned_to)
    
    # Order by last movement date (oldest first)
    query = query.order_by(LegalCase.last_movement_date.asc()).limit(limit)
    
    result = await db.execute(query)
    rows = result.all()
    
    # Build response items
    items = []
    for case, client in rows:
        days_since = (today - case.last_movement_date).days if case.last_movement_date else 0
        items.append(
            AttentionCaseItem(
                case_id=case.id,
                cnj_number=case.cnj_number,
                client_id=client.id,
                client_name=client.full_name,
                last_movement_date=case.last_movement_date,
                days_since_movement=days_since,
                case_type=case.case_type,
                court=case.court,
                status=case.status,
            )
        )
    
    return DashboardAttentionResponse(items=items, total=len(items))


@router.get("/good-news", response_model=DashboardGoodNewsResponse)
async def get_good_news(
    limit: int = Query(default=20, ge=1, le=100),
    days: int = Query(default=7, ge=1, le=30, description="Number of days to look back"),
    assigned_to: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Get good news (favorable decisions and important positive movements).
    
    Returns movements classified as important and positive.
    """
    tenant_id = current_user.tenant_id
    since_date = date.today() - timedelta(days=days)
    
    # Keywords that indicate good news
    good_news_keywords = [
        "deferido",
        "procedente",
        "favorável",
        "ganho",
        "vitória",
        "êxito",
        "homologado",
        "aprovado",
    ]
    
    # Build query for important movements with positive indicators
    query = (
        select(CaseMovement, LegalCase, Client)
        .join(LegalCase, CaseMovement.legal_case_id == LegalCase.id)
        .join(Client, LegalCase.client_id == Client.id)
        .where(
            and_(
                CaseMovement.tenant_id == tenant_id,
                CaseMovement.movement_date >= since_date,
                CaseMovement.is_important == True,
            )
        )
    )
    
    # Apply filters
    if assigned_to:
        query = query.where(Client.assigned_to == assigned_to)
    
    # Order by date (most recent first)
    query = query.order_by(CaseMovement.movement_date.desc()).limit(limit * 2)
    
    result = await db.execute(query)
    rows = result.all()
    
    # Filter for good news based on keywords
    items = []
    for movement, case, client in rows:
        description_lower = movement.description.lower()
        is_good_news = any(keyword in description_lower for keyword in good_news_keywords)
        
        if is_good_news:
            items.append(
                GoodNewsItem(
                    case_id=case.id,
                    cnj_number=case.cnj_number,
                    client_id=client.id,
                    client_name=client.full_name,
                    movement_id=movement.id,
                    movement_date=movement.movement_date,
                    movement_type=movement.movement_type,
                    description=movement.description,
                    ai_summary=movement.ai_summary,
                )
            )
            
            if len(items) >= limit:
                break
    
    return DashboardGoodNewsResponse(items=items, total=len(items))


@router.get("/noise", response_model=DashboardNoiseResponse)
async def get_noise(
    limit: int = Query(default=20, ge=1, le=100),
    days: int = Query(default=7, ge=1, le=30, description="Number of days to look back"),
    assigned_to: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Get noise (low-priority, irrelevant movements).
    
    Returns movements classified as not important and not requiring action.
    """
    tenant_id = current_user.tenant_id
    since_date = date.today() - timedelta(days=days)
    
    # Build query for non-important movements
    query = (
        select(CaseMovement, LegalCase, Client)
        .join(LegalCase, CaseMovement.legal_case_id == LegalCase.id)
        .join(Client, LegalCase.client_id == Client.id)
        .where(
            and_(
                CaseMovement.tenant_id == tenant_id,
                CaseMovement.movement_date >= since_date,
                CaseMovement.is_important == False,
                CaseMovement.requires_action == False,
            )
        )
    )
    
    # Apply filters
    if assigned_to:
        query = query.where(Client.assigned_to == assigned_to)
    
    # Order by date (most recent first)
    query = query.order_by(CaseMovement.movement_date.desc()).limit(limit)
    
    result = await db.execute(query)
    rows = result.all()
    
    # Build response items
    items = []
    for movement, case, client in rows:
        items.append(
            NoiseItem(
                case_id=case.id,
                cnj_number=case.cnj_number,
                client_id=client.id,
                client_name=client.full_name,
                movement_id=movement.id,
                movement_date=movement.movement_date,
                movement_type=movement.movement_type,
                description=movement.description,
            )
        )
    
    return DashboardNoiseResponse(items=items, total=len(items))


@router.get("/metrics", response_model=DashboardMetricsResponse)
async def get_metrics(
    days: int = Query(default=30, ge=7, le=90, description="Period in days"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Get office metrics with trends.
    
    Returns key performance indicators comparing current period with previous period.
    """
    from domains.jusmonitoria.services.dashboard import MetricsCalculator
    
    tenant_id = current_user.tenant_id
    
    # Create metrics calculator
    calculator = MetricsCalculator(db, tenant_id)
    
    # Calculate metrics with trends
    metrics_data = await calculator.calculate_metrics_with_trends(days)
    
    # Build response
    metrics = OfficeMetrics(
        conversion_rate=metrics_data["conversion_rate"],
        conversion_rate_change=metrics_data["conversion_rate_change"],
        avg_response_time_hours=metrics_data["avg_response_time_hours"],
        avg_response_time_change=metrics_data["avg_response_time_change"],
        satisfaction_score=metrics_data["satisfaction_score"],
        satisfaction_score_change=metrics_data["satisfaction_score_change"],
        total_active_cases=metrics_data["total_active_cases"],
        new_cases_this_period=metrics_data["new_cases_this_period"],
        total_active_clients=metrics_data["total_active_clients"],
        new_clients_this_period=metrics_data["new_clients_this_period"],
    )
    
    return DashboardMetricsResponse(
        metrics=metrics,
        period_start=metrics_data["period_start"],
        period_end=metrics_data["period_end"],
        comparison_period_start=metrics_data["comparison_period_start"],
        comparison_period_end=metrics_data["comparison_period_end"],
    )




@router.get("/preferences", response_model=DashboardPreferences)
async def get_dashboard_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Get user's dashboard preferences.
    
    Returns the user's saved dashboard preferences or defaults if not set.
    """
    from domains.jusmonitoria.db.models.user_preference import UserPreference
    
    tenant_id = current_user.tenant_id
    user_id = current_user.id
    
    # Query for dashboard preferences
    query = select(UserPreference).where(
        and_(
            UserPreference.tenant_id == tenant_id,
            UserPreference.user_id == user_id,
            UserPreference.preference_key == "dashboard",
        )
    )
    
    result = await db.execute(query)
    preference = result.scalar_one_or_none()
    
    if preference:
        # Return saved preferences
        return DashboardPreferences(**preference.preference_value)
    else:
        # Return default preferences
        return DashboardPreferences()


@router.put("/preferences", response_model=DashboardPreferences)
async def update_dashboard_preferences(
    preferences: DashboardPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Update user's dashboard preferences.
    
    Saves or updates the user's dashboard preferences.
    """
    from domains.jusmonitoria.db.models.user_preference import UserPreference
    from sqlalchemy import insert
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    
    tenant_id = current_user.tenant_id
    user_id = current_user.id
    
    # Get existing preferences or defaults
    query = select(UserPreference).where(
        and_(
            UserPreference.tenant_id == tenant_id,
            UserPreference.user_id == user_id,
            UserPreference.preference_key == "dashboard",
        )
    )
    
    result = await db.execute(query)
    existing = result.scalar_one_or_none()
    
    # Merge with existing or defaults
    if existing:
        current_prefs = DashboardPreferences(**existing.preference_value)
    else:
        current_prefs = DashboardPreferences()
    
    # Update with provided values
    update_data = preferences.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(current_prefs, key, value)
    
    # Upsert preference
    stmt = pg_insert(UserPreference).values(
        tenant_id=tenant_id,
        user_id=user_id,
        preference_key="dashboard",
        preference_value=current_prefs.model_dump(),
    )
    
    stmt = stmt.on_conflict_do_update(
        constraint="uq_user_preferences_tenant_user_key",
        set_={"preference_value": current_prefs.model_dump(), "updated_at": func.now()},
    )
    
    await db.execute(stmt)
    await db.commit()
    
    return current_prefs


@router.get("/summary", response_model=dict)
async def get_dashboard_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    Get complete dashboard summary with all counts.
    
    Returns a summary of all dashboard sections with counts.
    Useful for overview widgets and notifications.
    """
    from domains.jusmonitoria.services.dashboard import DashboardAggregator
    
    tenant_id = current_user.tenant_id
    
    # Create aggregator
    aggregator = DashboardAggregator(db, tenant_id)
    
    # Get summary
    summary = await aggregator.get_dashboard_summary()

    return summary


@router.get("/team-members")
async def get_team_members(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_jusmonitoria_session),
):
    """
    List team members (lawyers) in the current tenant for filter dropdowns.
    Returns id and full_name only.
    """
    query = (
        select(User.id, User.full_name)
        .where(User.tenant_id == current_user.tenant_id)
        .where(User.is_active == True)
        .order_by(User.full_name)
    )
    result = await db.execute(query)
    members = [{"id": str(row.id), "full_name": row.full_name} for row in result.all()]
    return {"items": members}
