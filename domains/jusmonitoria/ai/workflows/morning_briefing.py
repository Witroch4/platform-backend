"""Morning briefing workflow - Daily case updates."""

import logging
from datetime import date, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.ai.agents.investigator import InvestigadorAgent
from domains.jusmonitoria.ai.agents.writer import RedatorAgent
from domains.jusmonitoria.db.models.case_movement import CaseMovement
from domains.jusmonitoria.db.models.legal_case import LegalCase
from domains.jusmonitoria.db.repositories.case_movement import CaseMovementRepository
from domains.jusmonitoria.db.repositories.legal_case import LegalCaseRepository

logger = logging.getLogger(__name__)


UrgencyCategory = Literal["urgente", "atencao", "boas_noticias", "ruido"]


class MorningBriefingWorkflow:
    """
    Morning Briefing Workflow.
    
    Generates daily briefing with:
    - Movements from last 24 hours
    - Classification by urgency (Urgente, Atenção, Boas Notícias, Ruído)
    - Executive summary per client
    - Saved to database
    
    Validates: Requirements 2.8, 4.1
    """
    
    def __init__(
        self,
        session: AsyncSession,
        tenant_id: UUID,
    ):
        """
        Initialize morning briefing workflow.
        
        Args:
            session: Database session
            tenant_id: Tenant ID for isolation
        """
        self.session = session
        self.tenant_id = tenant_id
        
        # Initialize agents
        self.investigador = InvestigadorAgent(session, tenant_id)
        self.redator = RedatorAgent(session, tenant_id)
        
        # Initialize repositories
        self.case_repo = LegalCaseRepository(session, tenant_id)
        self.movement_repo = CaseMovementRepository(session, tenant_id)
    
    async def generate_briefing(
        self,
        date_for: date = None,
        hours_back: int = 24,
    ) -> dict[str, Any]:
        """
        Generate morning briefing for tenant.
        
        Args:
            date_for: Date for the briefing (defaults to today)
            hours_back: How many hours back to look for movements
        
        Returns:
            Dictionary with briefing data:
            - date: Briefing date
            - urgente: List of urgent cases
            - atencao: List of cases needing attention
            - boas_noticias: List of good news
            - ruido: List of noise/routine movements
            - summary: Executive summary
            - total_movements: Total movements processed
        """
        if date_for is None:
            date_for = date.today()
        
        logger.info(
            "Generating morning briefing",
            extra={
                "tenant_id": str(self.tenant_id),
                "date": date_for.isoformat(),
                "hours_back": hours_back,
            },
        )
        
        # Get movements from last 24 hours
        since = datetime.now() - timedelta(hours=hours_back)
        movements = await self._get_recent_movements(since)
        
        if not movements:
            logger.info(
                "No movements found for briefing",
                extra={"tenant_id": str(self.tenant_id)},
            )
            return self._empty_briefing(date_for)
        
        # Classify movements by urgency
        classified = await self._classify_movements(movements)
        
        # Generate executive summary
        summary = await self._generate_summary(classified, date_for)
        
        briefing = {
            "date": date_for.isoformat(),
            "urgente": classified["urgente"],
            "atencao": classified["atencao"],
            "boas_noticias": classified["boas_noticias"],
            "ruido": classified["ruido"],
            "summary": summary,
            "total_movements": len(movements),
        }
        
        logger.info(
            "Morning briefing generated",
            extra={
                "tenant_id": str(self.tenant_id),
                "total_movements": len(movements),
                "urgente": len(classified["urgente"]),
                "atencao": len(classified["atencao"]),
                "boas_noticias": len(classified["boas_noticias"]),
                "ruido": len(classified["ruido"]),
            },
        )
        
        return briefing
    
    async def _get_recent_movements(
        self,
        since: datetime,
    ) -> list[dict[str, Any]]:
        """
        Get recent movements for tenant.
        
        Args:
            since: Get movements since this datetime
        
        Returns:
            List of movement dictionaries with case info
        """
        # Query movements with case information
        stmt = (
            select(CaseMovement, LegalCase)
            .join(LegalCase, CaseMovement.case_id == LegalCase.id)
            .where(
                CaseMovement.tenant_id == self.tenant_id,
                CaseMovement.created_at >= since,
            )
            .order_by(CaseMovement.movement_date.desc())
        )
        
        result = await self.session.execute(stmt)
        rows = result.all()
        
        movements = []
        for movement, case in rows:
            movements.append({
                "id": str(movement.id),
                "case_id": str(case.id),
                "cnj_number": case.cnj_number,
                "client_id": str(case.client_id),
                "date": movement.movement_date,
                "type": movement.movement_type,
                "description": movement.description,
                "is_important": movement.is_important,
                "requires_action": movement.requires_action,
            })
        
        return movements
    
    async def _classify_movements(
        self,
        movements: list[dict[str, Any]],
    ) -> dict[str, list[dict[str, Any]]]:
        """
        Classify movements into urgency categories.
        
        Uses AI to analyze each movement and classify it.
        
        Args:
            movements: List of movement dictionaries
        
        Returns:
            Dictionary with movements grouped by category
        """
        classified = {
            "urgente": [],
            "atencao": [],
            "boas_noticias": [],
            "ruido": [],
        }
        
        for movement in movements:
            category = await self._classify_single_movement(movement)
            classified[category].append(movement)
        
        return classified
    
    async def _classify_single_movement(
        self,
        movement: dict[str, Any],
    ) -> UrgencyCategory:
        """
        Classify a single movement.
        
        Args:
            movement: Movement dictionary
        
        Returns:
            Urgency category
        """
        # Quick classification based on flags
        if movement.get("requires_action"):
            return "urgente"
        
        if movement.get("is_important"):
            return "atencao"
        
        # Use AI for more nuanced classification
        description = movement.get("description", "")
        movement_type = movement.get("type", "")
        
        prompt = f"""Classifique esta movimentação processual em uma das categorias:

Movimentação: [{movement_type}] {description}

Categorias:
- urgente: Sentenças, decisões, prazos para recurso, intimações urgentes
- atencao: Audiências, despachos importantes, juntada de documentos relevantes
- boas_noticias: Decisões favoráveis, deferimentos, arquivamentos positivos
- ruido: Movimentações administrativas rotineiras, sem impacto estratégico

Responda apenas com a categoria (urgente, atencao, boas_noticias ou ruido).
"""
        
        try:
            response = await self.investigador.execute(
                user_message=prompt,
                temperature=0.2,
                use_case="daily",
            )
            
            response = response.strip().lower()
            
            if "urgente" in response:
                return "urgente"
            elif "atencao" in response or "atenção" in response:
                return "atencao"
            elif "boas" in response or "noticia" in response or "notícia" in response:
                return "boas_noticias"
            else:
                return "ruido"
        
        except Exception as e:
            logger.error(
                "Failed to classify movement",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "movement_id": movement.get("id"),
                    "error": str(e),
                },
            )
            # Default to "atencao" on error
            return "atencao"
    
    async def _generate_summary(
        self,
        classified: dict[str, list[dict[str, Any]]],
        date_for: date,
    ) -> str:
        """
        Generate executive summary of the briefing.
        
        Args:
            classified: Classified movements
            date_for: Briefing date
        
        Returns:
            Summary text
        """
        urgente_count = len(classified["urgente"])
        atencao_count = len(classified["atencao"])
        boas_count = len(classified["boas_noticias"])
        ruido_count = len(classified["ruido"])
        
        # Build context for summary
        context_parts = [
            f"Data: {date_for.strftime('%d/%m/%Y')}",
            f"Total de movimentações: {urgente_count + atencao_count + boas_count + ruido_count}",
            f"- Urgentes: {urgente_count}",
            f"- Atenção: {atencao_count}",
            f"- Boas Notícias: {boas_count}",
            f"- Ruído: {ruido_count}",
        ]
        
        # Add sample movements from each category
        if classified["urgente"]:
            context_parts.append("\nMovimentações Urgentes:")
            for mov in classified["urgente"][:3]:
                context_parts.append(f"- {mov['cnj_number']}: {mov['description'][:100]}")
        
        if classified["boas_noticias"]:
            context_parts.append("\nBoas Notícias:")
            for mov in classified["boas_noticias"][:3]:
                context_parts.append(f"- {mov['cnj_number']}: {mov['description'][:100]}")
        
        context_text = "\n".join(context_parts)
        
        prompt = f"""Gere um resumo executivo do briefing matinal:

{context_text}

O resumo deve:
- Ser conciso (máximo 200 palavras)
- Destacar pontos críticos
- Mencionar ações necessárias
- Ter tom profissional mas acessível
"""
        
        try:
            summary = await self.redator.execute(
                user_message=prompt,
                temperature=0.6,
                max_tokens=300,
                use_case="daily",
            )
            
            return summary.strip()
        
        except Exception as e:
            logger.error(
                "Failed to generate summary",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "error": str(e),
                },
            )
            
            # Return basic summary on error
            return f"""Briefing de {date_for.strftime('%d/%m/%Y')}:
{urgente_count} movimentações urgentes, {atencao_count} requerem atenção, 
{boas_count} boas notícias, {ruido_count} movimentações rotineiras."""
    
    def _empty_briefing(self, date_for: date) -> dict[str, Any]:
        """Return empty briefing structure."""
        return {
            "date": date_for.isoformat(),
            "urgente": [],
            "atencao": [],
            "boas_noticias": [],
            "ruido": [],
            "summary": f"Nenhuma movimentação registrada em {date_for.strftime('%d/%m/%Y')}.",
            "total_movements": 0,
        }
    
    async def generate_client_briefing(
        self,
        client_id: UUID,
        date_for: date = None,
        hours_back: int = 24,
    ) -> dict[str, Any]:
        """
        Generate briefing for specific client.
        
        Args:
            client_id: Client UUID
            date_for: Date for the briefing
            hours_back: How many hours back to look
        
        Returns:
            Client-specific briefing dictionary
        """
        if date_for is None:
            date_for = date.today()
        
        logger.info(
            "Generating client briefing",
            extra={
                "tenant_id": str(self.tenant_id),
                "client_id": str(client_id),
                "date": date_for.isoformat(),
            },
        )
        
        # Get client's cases
        cases = await self.case_repo.list(
            filters={"client_id": client_id},
        )
        
        if not cases:
            return self._empty_briefing(date_for)
        
        case_ids = [case.id for case in cases]
        
        # Get movements for client's cases
        since = datetime.now() - timedelta(hours=hours_back)
        
        stmt = (
            select(CaseMovement, LegalCase)
            .join(LegalCase, CaseMovement.case_id == LegalCase.id)
            .where(
                CaseMovement.tenant_id == self.tenant_id,
                CaseMovement.case_id.in_(case_ids),
                CaseMovement.created_at >= since,
            )
            .order_by(CaseMovement.movement_date.desc())
        )
        
        result = await self.session.execute(stmt)
        rows = result.all()
        
        movements = []
        for movement, case in rows:
            movements.append({
                "id": str(movement.id),
                "case_id": str(case.id),
                "cnj_number": case.cnj_number,
                "date": movement.movement_date,
                "type": movement.movement_type,
                "description": movement.description,
                "is_important": movement.is_important,
                "requires_action": movement.requires_action,
            })
        
        if not movements:
            return self._empty_briefing(date_for)
        
        # Classify and generate summary
        classified = await self._classify_movements(movements)
        summary = await self._generate_summary(classified, date_for)
        
        return {
            "date": date_for.isoformat(),
            "client_id": str(client_id),
            "urgente": classified["urgente"],
            "atencao": classified["atencao"],
            "boas_noticias": classified["boas_noticias"],
            "ruido": classified["ruido"],
            "summary": summary,
            "total_movements": len(movements),
        }
