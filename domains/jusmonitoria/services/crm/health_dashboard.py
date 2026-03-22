"""Health dashboard service for client health monitoring."""

import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.client import Client
from domains.jusmonitoria.db.models.legal_case import LegalCase
from domains.jusmonitoria.db.models.timeline_event import TimelineEvent

logger = logging.getLogger(__name__)


class HealthDashboardService:
    """
    Service for calculating and monitoring client health.
    
    Health score is based on:
    - Activity level (recent interactions)
    - Case status (active vs stalled)
    - Response time
    - Risk factors (missed deadlines, etc.)
    """
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize service.
        
        Args:
            session: Async database session
            tenant_id: Tenant ID for isolation
        """
        self.session = session
        self.tenant_id = tenant_id
    
    async def get_client_health(
        self,
        client_id: UUID,
    ) -> dict:
        """
        Get comprehensive health dashboard for a client.
        
        Args:
            client_id: Client UUID
            
        Returns:
            Dictionary with health score, alerts, recommendations, and metrics
        """
        # Get client
        client_query = select(Client).where(
            and_(
                Client.id == client_id,
                Client.tenant_id == self.tenant_id,
            )
        )
        client_result = await self.session.execute(client_query)
        client = client_result.scalar_one_or_none()
        
        if not client:
            raise ValueError(f"Client {client_id} not found")
        
        # Calculate health score
        health_score = await self._calculate_health_score(client_id)
        
        # Identify alerts
        alerts = await self._identify_alerts(client_id)
        
        # Generate recommendations
        recommendations = await self._generate_recommendations(client_id, alerts)
        
        # Get metrics
        metrics = await self._get_metrics(client_id)
        
        # Get last activity
        last_activity = await self._get_last_activity(client_id)
        
        # Update client health score if changed
        if client.health_score != health_score:
            client.health_score = health_score
            await self.session.flush()
        
        logger.debug(
            "Retrieved client health",
            extra={
                "client_id": str(client_id),
                "tenant_id": str(self.tenant_id),
                "health_score": health_score,
                "alerts_count": len(alerts),
            },
        )
        
        return {
            "client_id": str(client_id),
            "health_score": health_score,
            "alerts": alerts,
            "recommendations": recommendations,
            "metrics": metrics,
            "last_activity": last_activity.isoformat() if last_activity else None,
        }
    
    async def _calculate_health_score(
        self,
        client_id: UUID,
    ) -> int:
        """
        Calculate client health score (0-100).
        
        Factors:
        - Activity: 30 points (recent interactions)
        - Case status: 30 points (active vs stalled)
        - Response time: 20 points (timely responses)
        - Risk: 20 points (no missed deadlines or issues)
        
        Args:
            client_id: Client UUID
            
        Returns:
            Health score (0-100)
        """
        score = 0
        
        # Activity score (30 points)
        activity_score = await self._calculate_activity_score(client_id)
        score += activity_score
        
        # Case status score (30 points)
        case_score = await self._calculate_case_score(client_id)
        score += case_score
        
        # Response time score (20 points)
        response_score = await self._calculate_response_score(client_id)
        score += response_score
        
        # Risk score (20 points)
        risk_score = await self._calculate_risk_score(client_id)
        score += risk_score
        
        return max(0, min(100, score))
    
    async def _calculate_activity_score(
        self,
        client_id: UUID,
    ) -> int:
        """
        Calculate activity score based on recent interactions.
        
        30 points max:
        - 30: Activity in last 7 days
        - 20: Activity in last 30 days
        - 10: Activity in last 90 days
        - 0: No activity in 90+ days
        """
        now = datetime.utcnow()
        
        # Check activity in last 7 days
        query_7d = select(func.count()).select_from(TimelineEvent).where(
            and_(
                TimelineEvent.tenant_id == self.tenant_id,
                TimelineEvent.entity_type == "client",
                TimelineEvent.entity_id == client_id,
                TimelineEvent.created_at >= now - timedelta(days=7),
            )
        )
        result_7d = await self.session.execute(query_7d)
        count_7d = result_7d.scalar_one()
        
        if count_7d > 0:
            return 30
        
        # Check activity in last 30 days
        query_30d = select(func.count()).select_from(TimelineEvent).where(
            and_(
                TimelineEvent.tenant_id == self.tenant_id,
                TimelineEvent.entity_type == "client",
                TimelineEvent.entity_id == client_id,
                TimelineEvent.created_at >= now - timedelta(days=30),
            )
        )
        result_30d = await self.session.execute(query_30d)
        count_30d = result_30d.scalar_one()
        
        if count_30d > 0:
            return 20
        
        # Check activity in last 90 days
        query_90d = select(func.count()).select_from(TimelineEvent).where(
            and_(
                TimelineEvent.tenant_id == self.tenant_id,
                TimelineEvent.entity_type == "client",
                TimelineEvent.entity_id == client_id,
                TimelineEvent.created_at >= now - timedelta(days=90),
            )
        )
        result_90d = await self.session.execute(query_90d)
        count_90d = result_90d.scalar_one()
        
        if count_90d > 0:
            return 10
        
        return 0
    
    async def _calculate_case_score(
        self,
        client_id: UUID,
    ) -> int:
        """
        Calculate case status score.
        
        30 points max:
        - 30: All cases active with recent movements
        - 20: Some cases active
        - 10: Cases exist but stalled
        - 0: No cases or all inactive
        """
        now = datetime.utcnow()
        
        # Get total cases
        total_query = select(func.count()).select_from(LegalCase).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.client_id == client_id,
            )
        )
        total_result = await self.session.execute(total_query)
        total_cases = total_result.scalar_one()
        
        if total_cases == 0:
            return 0
        
        # Get cases with recent movements (last 30 days)
        active_query = select(func.count()).select_from(LegalCase).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.client_id == client_id,
                LegalCase.last_movement_date >= (now - timedelta(days=30)).date(),
            )
        )
        active_result = await self.session.execute(active_query)
        active_cases = active_result.scalar_one()
        
        # Calculate percentage of active cases
        active_percentage = (active_cases / total_cases) * 100
        
        if active_percentage >= 80:
            return 30
        elif active_percentage >= 50:
            return 20
        elif active_percentage > 0:
            return 10
        else:
            return 0
    
    async def _calculate_response_score(
        self,
        client_id: UUID,
    ) -> int:
        """
        Calculate response time score.
        
        20 points max based on average response time to client messages.
        For now, returns a default score. Can be enhanced with actual
        message tracking.
        """
        # TODO: Implement actual response time tracking
        # For now, return a default score
        return 15
    
    async def _calculate_risk_score(
        self,
        client_id: UUID,
    ) -> int:
        """
        Calculate risk score.
        
        20 points max, deducted for:
        - Missed deadlines: -10 points each
        - Stalled cases (90+ days): -5 points each
        - Negative events: -5 points each
        """
        score = 20
        now = datetime.utcnow()
        
        # Check for missed deadlines
        missed_query = select(func.count()).select_from(LegalCase).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.client_id == client_id,
                LegalCase.next_deadline < now.date(),
                LegalCase.next_deadline.isnot(None),
            )
        )
        missed_result = await self.session.execute(missed_query)
        missed_deadlines = missed_result.scalar_one()
        
        score -= missed_deadlines * 10
        
        # Check for stalled cases (90+ days without movement)
        stalled_query = select(func.count()).select_from(LegalCase).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.client_id == client_id,
                LegalCase.last_movement_date < (now - timedelta(days=90)).date(),
            )
        )
        stalled_result = await self.session.execute(stalled_query)
        stalled_cases = stalled_result.scalar_one()
        
        score -= stalled_cases * 5
        
        return max(0, score)
    
    async def _identify_alerts(
        self,
        client_id: UUID,
    ) -> list[dict]:
        """
        Identify alerts for the client.
        
        Alerts include:
        - Missed deadlines
        - Stalled cases
        - Low activity
        - Critical movements
        """
        alerts = []
        now = datetime.utcnow()
        
        # Check for missed deadlines
        missed_query = select(LegalCase).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.client_id == client_id,
                LegalCase.next_deadline < now.date(),
                LegalCase.next_deadline.isnot(None),
            )
        )
        missed_result = await self.session.execute(missed_query)
        missed_cases = missed_result.scalars().all()
        
        for case in missed_cases:
            alerts.append({
                "type": "missed_deadline",
                "severity": "critical",
                "title": f"Prazo vencido: {case.cnj_number}",
                "description": f"Prazo venceu em {case.next_deadline}",
                "case_id": str(case.id),
            })
        
        # Check for stalled cases
        stalled_query = select(LegalCase).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.client_id == client_id,
                LegalCase.last_movement_date < (now - timedelta(days=90)).date(),
            )
        )
        stalled_result = await self.session.execute(stalled_query)
        stalled_cases = stalled_result.scalars().all()
        
        for case in stalled_cases:
            days_stalled = (now.date() - case.last_movement_date).days
            alerts.append({
                "type": "stalled_case",
                "severity": "warning",
                "title": f"Processo parado: {case.cnj_number}",
                "description": f"Sem movimentação há {days_stalled} dias",
                "case_id": str(case.id),
            })
        
        # Check for low activity
        activity_query = select(func.count()).select_from(TimelineEvent).where(
            and_(
                TimelineEvent.tenant_id == self.tenant_id,
                TimelineEvent.entity_type == "client",
                TimelineEvent.entity_id == client_id,
                TimelineEvent.created_at >= now - timedelta(days=30),
            )
        )
        activity_result = await self.session.execute(activity_query)
        activity_count = activity_result.scalar_one()
        
        if activity_count == 0:
            alerts.append({
                "type": "low_activity",
                "severity": "info",
                "title": "Baixa atividade",
                "description": "Nenhuma interação nos últimos 30 dias",
            })
        
        return alerts
    
    async def _generate_recommendations(
        self,
        client_id: UUID,
        alerts: list[dict],
    ) -> list[dict]:
        """
        Generate action recommendations based on alerts.
        """
        recommendations = []
        
        # Recommendations based on alerts
        for alert in alerts:
            if alert["type"] == "missed_deadline":
                recommendations.append({
                    "priority": "high",
                    "action": "contact_client",
                    "title": "Entrar em contato urgente",
                    "description": "Cliente possui prazo vencido que requer atenção imediata",
                })
            
            elif alert["type"] == "stalled_case":
                recommendations.append({
                    "priority": "medium",
                    "action": "review_case",
                    "title": "Revisar processo parado",
                    "description": "Verificar status e próximas ações necessárias",
                })
            
            elif alert["type"] == "low_activity":
                recommendations.append({
                    "priority": "low",
                    "action": "schedule_followup",
                    "title": "Agendar follow-up",
                    "description": "Manter contato regular com o cliente",
                })
        
        return recommendations
    
    async def _get_metrics(
        self,
        client_id: UUID,
    ) -> dict:
        """
        Get key metrics for the client.
        """
        now = datetime.utcnow()
        
        # Total cases
        total_cases_query = select(func.count()).select_from(LegalCase).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.client_id == client_id,
            )
        )
        total_cases_result = await self.session.execute(total_cases_query)
        total_cases = total_cases_result.scalar_one()
        
        # Active cases (with movement in last 30 days)
        active_cases_query = select(func.count()).select_from(LegalCase).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.client_id == client_id,
                LegalCase.last_movement_date >= (now - timedelta(days=30)).date(),
            )
        )
        active_cases_result = await self.session.execute(active_cases_query)
        active_cases = active_cases_result.scalar_one()
        
        # Total events
        total_events_query = select(func.count()).select_from(TimelineEvent).where(
            and_(
                TimelineEvent.tenant_id == self.tenant_id,
                TimelineEvent.entity_type == "client",
                TimelineEvent.entity_id == client_id,
            )
        )
        total_events_result = await self.session.execute(total_events_query)
        total_events = total_events_result.scalar_one()
        
        # Recent events (last 30 days)
        recent_events_query = select(func.count()).select_from(TimelineEvent).where(
            and_(
                TimelineEvent.tenant_id == self.tenant_id,
                TimelineEvent.entity_type == "client",
                TimelineEvent.entity_id == client_id,
                TimelineEvent.created_at >= now - timedelta(days=30),
            )
        )
        recent_events_result = await self.session.execute(recent_events_query)
        recent_events = recent_events_result.scalar_one()
        
        return {
            "total_cases": total_cases,
            "active_cases": active_cases,
            "total_events": total_events,
            "recent_events": recent_events,
        }
    
    async def _get_last_activity(
        self,
        client_id: UUID,
    ) -> Optional[datetime]:
        """
        Get timestamp of last activity for the client.
        """
        query = (
            select(TimelineEvent.created_at)
            .where(
                and_(
                    TimelineEvent.tenant_id == self.tenant_id,
                    TimelineEvent.entity_type == "client",
                    TimelineEvent.entity_id == client_id,
                )
            )
            .order_by(TimelineEvent.created_at.desc())
            .limit(1)
        )
        
        result = await self.session.execute(query)
        last_activity = result.scalar_one_or_none()
        
        return last_activity
