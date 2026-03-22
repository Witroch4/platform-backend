"""Office metrics calculation service."""

from datetime import date, datetime, timedelta
from typing import Tuple
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.client import Client
from domains.jusmonitoria.db.models.lead import Lead
from domains.jusmonitoria.db.models.legal_case import LegalCase
from domains.jusmonitoria.db.models.timeline_event import TimelineEvent


class MetricsCalculator:
    """
    Service for calculating office metrics.
    
    Calculates key performance indicators:
    - Conversion rate (leads to clients)
    - Average response time
    - Client satisfaction score
    - Trends compared to previous period
    """
    
    def __init__(self, db: AsyncSession, tenant_id: UUID):
        self.db = db
        self.tenant_id = tenant_id
    
    def _get_period_dates(self, days: int) -> Tuple[date, date, date, date]:
        """
        Calculate current and comparison period dates.
        
        Args:
            days: Length of period in days
            
        Returns:
            Tuple of (period_start, period_end, comparison_start, comparison_end)
        """
        today = date.today()
        period_end = today
        period_start = today - timedelta(days=days)
        
        comparison_end = period_start - timedelta(days=1)
        comparison_start = comparison_end - timedelta(days=days)
        
        return period_start, period_end, comparison_start, comparison_end
    
    async def calculate_conversion_rate(
        self,
        period_start: date,
        period_end: date,
    ) -> float:
        """
        Calculate lead to client conversion rate for a period.
        
        Args:
            period_start: Start of period
            period_end: End of period
            
        Returns:
            Conversion rate as percentage (0-100)
        """
        start_dt = datetime.combine(period_start, datetime.min.time())
        end_dt = datetime.combine(period_end, datetime.max.time())
        
        # Count total leads created in period
        leads_query = select(func.count(Lead.id)).where(
            and_(
                Lead.tenant_id == self.tenant_id,
                Lead.created_at >= start_dt,
                Lead.created_at <= end_dt,
            )
        )
        result = await self.db.execute(leads_query)
        total_leads = result.scalar() or 0
        
        if total_leads == 0:
            return 0.0
        
        # Count converted leads in period
        converted_query = select(func.count(Lead.id)).where(
            and_(
                Lead.tenant_id == self.tenant_id,
                Lead.created_at >= start_dt,
                Lead.created_at <= end_dt,
                Lead.status == "converted",
                Lead.converted_at.isnot(None),
            )
        )
        result = await self.db.execute(converted_query)
        converted_leads = result.scalar() or 0
        
        return (converted_leads / total_leads) * 100.0
    
    async def calculate_avg_response_time(
        self,
        period_start: date,
        period_end: date,
    ) -> float:
        """
        Calculate average response time in hours.
        
        This is a simplified implementation. In production, you would track
        actual response times from timeline events.
        
        Args:
            period_start: Start of period
            period_end: End of period
            
        Returns:
            Average response time in hours
        """
        # Placeholder implementation
        # In production, calculate from timeline events where event_type = 'message_received'
        # and find time to first response
        
        # For now, return a mock value based on activity
        start_dt = datetime.combine(period_start, datetime.min.time())
        end_dt = datetime.combine(period_end, datetime.max.time())
        
        # Count timeline events in period as proxy for activity
        events_query = select(func.count(TimelineEvent.id)).where(
            and_(
                TimelineEvent.tenant_id == self.tenant_id,
                TimelineEvent.created_at >= start_dt,
                TimelineEvent.created_at <= end_dt,
            )
        )
        result = await self.db.execute(events_query)
        event_count = result.scalar() or 0
        
        # Mock calculation: more events = faster response time
        if event_count > 100:
            return 2.5  # Very active = 2.5 hours avg
        elif event_count > 50:
            return 4.0  # Active = 4 hours avg
        elif event_count > 20:
            return 6.5  # Moderate = 6.5 hours avg
        else:
            return 12.0  # Low activity = 12 hours avg
    
    async def calculate_satisfaction_score(
        self,
        period_start: date,
        period_end: date,
    ) -> float:
        """
        Calculate client satisfaction score.
        
        This is a simplified implementation. In production, you would track
        actual satisfaction surveys or NPS scores.
        
        Args:
            period_start: Start of period
            period_end: End of period
            
        Returns:
            Satisfaction score (0-100)
        """
        # Placeholder implementation
        # In production, calculate from client feedback, surveys, or health scores
        
        # For now, use average client health score as proxy
        health_query = select(func.avg(Client.health_score)).where(
            and_(
                Client.tenant_id == self.tenant_id,
                Client.status == "active",
            )
        )
        result = await self.db.execute(health_query)
        avg_health = result.scalar()
        
        if avg_health is None:
            return 75.0  # Default score
        
        return float(avg_health)
    
    async def calculate_metrics_with_trends(self, days: int = 30) -> dict:
        """
        Calculate all metrics with trend comparison.
        
        Args:
            days: Period length in days
            
        Returns:
            Dictionary with metrics and trends
        """
        period_start, period_end, comp_start, comp_end = self._get_period_dates(days)
        
        # Calculate current period metrics
        current_conversion = await self.calculate_conversion_rate(period_start, period_end)
        current_response_time = await self.calculate_avg_response_time(period_start, period_end)
        current_satisfaction = await self.calculate_satisfaction_score(period_start, period_end)
        
        # Calculate comparison period metrics
        prev_conversion = await self.calculate_conversion_rate(comp_start, comp_end)
        prev_response_time = await self.calculate_avg_response_time(comp_start, comp_end)
        prev_satisfaction = await self.calculate_satisfaction_score(comp_start, comp_end)
        
        # Calculate changes (percentage points for rates, percentage change for others)
        conversion_change = current_conversion - prev_conversion
        
        # Response time change (negative is good - means faster)
        if prev_response_time > 0:
            response_time_change = ((current_response_time - prev_response_time) / prev_response_time) * 100
        else:
            response_time_change = 0.0
        
        # Satisfaction change
        satisfaction_change = current_satisfaction - prev_satisfaction
        
        # Count active cases
        active_cases_query = select(func.count(LegalCase.id)).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.monitoring_enabled == True,
            )
        )
        result = await self.db.execute(active_cases_query)
        total_active_cases = result.scalar() or 0
        
        # Count new cases in current period
        start_dt = datetime.combine(period_start, datetime.min.time())
        end_dt = datetime.combine(period_end, datetime.max.time())
        
        new_cases_query = select(func.count(LegalCase.id)).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.created_at >= start_dt,
                LegalCase.created_at <= end_dt,
            )
        )
        result = await self.db.execute(new_cases_query)
        new_cases = result.scalar() or 0
        
        # Count active clients
        active_clients_query = select(func.count(Client.id)).where(
            and_(
                Client.tenant_id == self.tenant_id,
                Client.status == "active",
            )
        )
        result = await self.db.execute(active_clients_query)
        total_active_clients = result.scalar() or 0
        
        # Count new clients in current period
        new_clients_query = select(func.count(Client.id)).where(
            and_(
                Client.tenant_id == self.tenant_id,
                Client.created_at >= start_dt,
                Client.created_at <= end_dt,
            )
        )
        result = await self.db.execute(new_clients_query)
        new_clients = result.scalar() or 0
        
        return {
            "conversion_rate": round(current_conversion, 1),
            "conversion_rate_change": round(conversion_change, 1),
            "avg_response_time_hours": round(current_response_time, 1),
            "avg_response_time_change": round(response_time_change, 1),
            "satisfaction_score": round(current_satisfaction, 1),
            "satisfaction_score_change": round(satisfaction_change, 1),
            "total_active_cases": total_active_cases,
            "new_cases_this_period": new_cases,
            "total_active_clients": total_active_clients,
            "new_clients_this_period": new_clients,
            "period_start": period_start,
            "period_end": period_end,
            "comparison_period_start": comp_start,
            "comparison_period_end": comp_end,
        }
    
    async def generate_trend_data(self, days: int = 30, data_points: int = 7) -> dict:
        """
        Generate trend data for charts.
        
        Args:
            days: Total period length
            data_points: Number of data points to generate
            
        Returns:
            Dictionary with trend arrays for each metric
        """
        today = date.today()
        interval = days // data_points
        
        conversion_trend = []
        response_time_trend = []
        satisfaction_trend = []
        dates = []
        
        for i in range(data_points):
            end_date = today - timedelta(days=i * interval)
            start_date = end_date - timedelta(days=interval)
            
            conversion = await self.calculate_conversion_rate(start_date, end_date)
            response_time = await self.calculate_avg_response_time(start_date, end_date)
            satisfaction = await self.calculate_satisfaction_score(start_date, end_date)
            
            conversion_trend.insert(0, round(conversion, 1))
            response_time_trend.insert(0, round(response_time, 1))
            satisfaction_trend.insert(0, round(satisfaction, 1))
            dates.insert(0, end_date.isoformat())
        
        return {
            "dates": dates,
            "conversion_rate": conversion_trend,
            "response_time": response_time_trend,
            "satisfaction": satisfaction_trend,
        }

