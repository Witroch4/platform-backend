"""Dashboard data aggregation service."""

from datetime import date, datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.briefing import Briefing
from domains.jusmonitoria.db.models.case_movement import CaseMovement
from domains.jusmonitoria.db.models.client import Client
from domains.jusmonitoria.db.models.legal_case import LegalCase


class DashboardAggregator:
    """
    Service for aggregating dashboard data.
    
    Provides methods to fetch and classify movements into the 4 blocks:
    - Urgent: Cases with deadline < 3 days
    - Attention: Cases with no movement > 30 days
    - Good News: Favorable decisions and positive movements
    - Noise: Low-priority, irrelevant movements
    """
    
    def __init__(self, db: AsyncSession, tenant_id: UUID):
        self.db = db
        self.tenant_id = tenant_id
    
    async def get_today_briefing(self) -> Optional[Briefing]:
        """
        Get today's briefing for the tenant.
        
        Returns:
            Briefing object if exists, None otherwise
        """
        today = date.today()
        
        query = select(Briefing).where(
            and_(
                Briefing.tenant_id == self.tenant_id,
                Briefing.briefing_date == today,
            )
        )
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_urgent_count(self, days_threshold: int = 3) -> int:
        """
        Count urgent cases (deadline within threshold).
        
        Args:
            days_threshold: Number of days for urgency threshold
            
        Returns:
            Count of urgent cases
        """
        today = date.today()
        urgent_date = today + timedelta(days=days_threshold)
        
        query = select(func.count(LegalCase.id)).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.monitoring_enabled == True,
                LegalCase.next_deadline.isnot(None),
                LegalCase.next_deadline >= today,
                LegalCase.next_deadline <= urgent_date,
            )
        )
        
        result = await self.db.execute(query)
        return result.scalar() or 0
    
    async def get_attention_count(self, days_threshold: int = 30) -> int:
        """
        Count cases needing attention (no movement > threshold).
        
        Args:
            days_threshold: Number of days without movement
            
        Returns:
            Count of cases needing attention
        """
        today = date.today()
        attention_date = today - timedelta(days=days_threshold)
        
        query = select(func.count(LegalCase.id)).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.monitoring_enabled == True,
                LegalCase.last_movement_date.isnot(None),
                LegalCase.last_movement_date <= attention_date,
            )
        )
        
        result = await self.db.execute(query)
        return result.scalar() or 0
    
    async def get_good_news_count(self, days_back: int = 7) -> int:
        """
        Count good news movements (important positive movements).
        
        Args:
            days_back: Number of days to look back
            
        Returns:
            Count of good news items
        """
        since_date = date.today() - timedelta(days=days_back)
        
        # Keywords indicating good news
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
        
        # Build OR conditions for keywords
        keyword_conditions = [
            func.lower(CaseMovement.description).contains(keyword)
            for keyword in good_news_keywords
        ]
        
        query = select(func.count(CaseMovement.id)).where(
            and_(
                CaseMovement.tenant_id == self.tenant_id,
                CaseMovement.movement_date >= since_date,
                CaseMovement.is_important == True,
                or_(*keyword_conditions),
            )
        )
        
        result = await self.db.execute(query)
        return result.scalar() or 0
    
    async def get_noise_count(self, days_back: int = 7) -> int:
        """
        Count noise movements (low-priority, irrelevant).
        
        Args:
            days_back: Number of days to look back
            
        Returns:
            Count of noise items
        """
        since_date = date.today() - timedelta(days=days_back)
        
        query = select(func.count(CaseMovement.id)).where(
            and_(
                CaseMovement.tenant_id == self.tenant_id,
                CaseMovement.movement_date >= since_date,
                CaseMovement.is_important == False,
                CaseMovement.requires_action == False,
            )
        )
        
        result = await self.db.execute(query)
        return result.scalar() or 0
    
    async def get_dashboard_summary(self) -> dict:
        """
        Get complete dashboard summary with all counts.
        
        Returns:
            Dictionary with counts for all dashboard blocks
        """
        # Fetch all counts in parallel would be ideal, but for simplicity we'll do sequential
        urgent_count = await self.get_urgent_count()
        attention_count = await self.get_attention_count()
        good_news_count = await self.get_good_news_count()
        noise_count = await self.get_noise_count()
        
        # Get total active cases
        total_cases_query = select(func.count(LegalCase.id)).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.monitoring_enabled == True,
            )
        )
        result = await self.db.execute(total_cases_query)
        total_cases = result.scalar() or 0
        
        # Get new cases today
        today_start = datetime.combine(date.today(), datetime.min.time())
        new_cases_query = select(func.count(LegalCase.id)).where(
            and_(
                LegalCase.tenant_id == self.tenant_id,
                LegalCase.created_at >= today_start,
            )
        )
        result = await self.db.execute(new_cases_query)
        new_cases_today = result.scalar() or 0
        
        # Get pending movements (important + requires action)
        pending_query = select(func.count(CaseMovement.id)).where(
            and_(
                CaseMovement.tenant_id == self.tenant_id,
                CaseMovement.is_important == True,
                CaseMovement.requires_action == True,
            )
        )
        result = await self.db.execute(pending_query)
        pending_actions = result.scalar() or 0
        
        return {
            "urgent": urgent_count,
            "attention": attention_count,
            "good_news": good_news_count,
            "noise": noise_count,
            "total_cases": total_cases,
            "new_cases_today": new_cases_today,
            "pending_actions": pending_actions,
            "last_updated": datetime.utcnow(),
        }
    
    async def classify_movement(self, movement: CaseMovement) -> str:
        """
        Classify a movement into one of the 4 categories.
        
        Args:
            movement: CaseMovement to classify
            
        Returns:
            Category: "urgent", "attention", "good_news", or "noise"
        """
        # Check if it's good news
        if movement.is_important:
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
            description_lower = movement.description.lower()
            if any(keyword in description_lower for keyword in good_news_keywords):
                return "good_news"
        
        # Check if requires urgent action
        if movement.requires_action:
            return "urgent"
        
        # Check if it's noise
        if not movement.is_important and not movement.requires_action:
            return "noise"
        
        # Default to attention
        return "attention"

