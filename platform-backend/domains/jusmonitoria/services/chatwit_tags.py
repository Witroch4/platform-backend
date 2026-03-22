"""Chatwit tags synchronization and mapping service."""

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.services.chatwit_client import ChatwitClient, get_chatwit_client
from domains.jusmonitoria.db.models.lead import LeadStage
from domains.jusmonitoria.db.models.tag import Tag
from domains.jusmonitoria.db.repositories.base import BaseRepository

logger = structlog.get_logger(__name__)


# Tag to funnel stage mapping
TAG_TO_STAGE_MAPPING = {
    "novo_lead": LeadStage.NEW,
    "novo": LeadStage.NEW,
    "contatado": LeadStage.CONTACTED,
    "qualificado": LeadStage.QUALIFIED,
    "proposta": LeadStage.PROPOSAL,
    "negociacao": LeadStage.NEGOTIATION,
    "convertido": LeadStage.CONVERTED,
}

# Stage to tag mapping (reverse)
STAGE_TO_TAG_MAPPING = {
    LeadStage.NEW: "novo_lead",
    LeadStage.CONTACTED: "contatado",
    LeadStage.QUALIFIED: "qualificado",
    LeadStage.PROPOSAL: "proposta",
    LeadStage.NEGOTIATION: "negociacao",
    LeadStage.CONVERTED: "convertido",
}

# Special action tags
ACTION_TAGS = {
    "consulta_processo": {
        "action": "search_process",
        "priority": "medium",
        "description": "Cliente solicitou consulta de processo",
    },
    "solicita_peticao": {
        "action": "draft_document",
        "priority": "high",
        "description": "Cliente solicitou redação de petição",
    },
    "urgente": {
        "action": "escalate",
        "priority": "critical",
        "description": "Demanda urgente que requer atenção imediata",
    },
    "follow_up": {
        "action": "schedule_followup",
        "priority": "medium",
        "description": "Agendar follow-up com cliente",
    },
}


class ChatwitTagService:
    """
    Service for managing Chatwit tags and their mapping to lead stages.
    
    Provides functionality to:
    - Sync tags from Chatwit to local database
    - Map tags to lead funnel stages
    - Get active tags
    - Identify action tags
    """
    
    def __init__(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        chatwit_client: ChatwitClient | None = None,
    ):
        """
        Initialize tag service.
        
        Args:
            session: Database session
            tenant_id: Tenant ID for isolation
            chatwit_client: Chatwit client (optional, uses global if not provided)
        """
        self.session = session
        self.tenant_id = tenant_id
        self.chatwit_client = chatwit_client or get_chatwit_client()
        self.tag_repo = BaseRepository(Tag, session, tenant_id)
    
    async def get_active_tags(self) -> list[str]:
        """
        Get list of active tags from Chatwit.
        
        Returns:
            List of tag names
            
        Raises:
            ChatwitAPIError: If API call fails
        """
        logger.info(
            "fetching_active_tags",
            tenant_id=str(self.tenant_id),
        )
        
        tags = await self.chatwit_client.get_active_tags()
        
        logger.info(
            "active_tags_fetched",
            tenant_id=str(self.tenant_id),
            tag_count=len(tags),
        )
        
        return tags
    
    async def sync_tags_to_database(self) -> dict[str, Any]:
        """
        Synchronize Chatwit tags to local database.
        
        Creates Tag records for tags that don't exist locally.
        
        Returns:
            Dictionary with sync statistics
        """
        logger.info(
            "syncing_tags_to_database",
            tenant_id=str(self.tenant_id),
        )
        
        # Get active tags from Chatwit
        chatwit_tags = await self.get_active_tags()
        
        # Get existing tags from database
        existing_tags = await self.tag_repo.list(limit=1000)
        existing_tag_names = {tag.name.lower() for tag in existing_tags}
        
        # Create missing tags
        created_count = 0
        for tag_name in chatwit_tags:
            if tag_name.lower() not in existing_tag_names:
                # Determine tag color based on type
                color = self._get_tag_color(tag_name)
                category = self._get_tag_category(tag_name)
                
                await self.tag_repo.create(
                    name=tag_name,
                    color=color,
                    category=category,
                )
                
                created_count += 1
                
                logger.info(
                    "tag_created",
                    tenant_id=str(self.tenant_id),
                    tag_name=tag_name,
                    category=category,
                )
        
        await self.session.commit()
        
        result = {
            "total_chatwit_tags": len(chatwit_tags),
            "existing_tags": len(existing_tag_names),
            "created_tags": created_count,
            "synced_at": datetime.utcnow().isoformat(),
        }
        
        logger.info(
            "tags_synced",
            tenant_id=str(self.tenant_id),
            **result,
        )
        
        return result
    
    def map_tag_to_stage(self, tag: str) -> LeadStage | None:
        """
        Map a Chatwit tag to a lead funnel stage.
        
        Args:
            tag: Tag name
            
        Returns:
            LeadStage if mapping exists, None otherwise
        """
        return TAG_TO_STAGE_MAPPING.get(tag.lower())
    
    def map_stage_to_tag(self, stage: LeadStage) -> str | None:
        """
        Map a lead funnel stage to a Chatwit tag.
        
        Args:
            stage: Lead stage
            
        Returns:
            Tag name if mapping exists, None otherwise
        """
        return STAGE_TO_TAG_MAPPING.get(stage)
    
    def is_action_tag(self, tag: str) -> bool:
        """
        Check if a tag triggers an action.
        
        Args:
            tag: Tag name
            
        Returns:
            True if tag is an action tag
        """
        return tag.lower() in ACTION_TAGS
    
    def get_action_for_tag(self, tag: str) -> dict[str, Any] | None:
        """
        Get action configuration for a tag.
        
        Args:
            tag: Tag name
            
        Returns:
            Action configuration dict or None
        """
        return ACTION_TAGS.get(tag.lower())
    
    def get_all_stage_tags(self) -> list[str]:
        """
        Get all tags that map to funnel stages.
        
        Returns:
            List of stage tag names
        """
        return list(TAG_TO_STAGE_MAPPING.keys())
    
    def get_all_action_tags(self) -> list[str]:
        """
        Get all tags that trigger actions.
        
        Returns:
            List of action tag names
        """
        return list(ACTION_TAGS.keys())
    
    def _get_tag_color(self, tag_name: str) -> str:
        """
        Determine color for a tag based on its name/type.
        
        Args:
            tag_name: Tag name
            
        Returns:
            Hex color code
        """
        tag_lower = tag_name.lower()
        
        # Stage tags - blue gradient
        if tag_lower in TAG_TO_STAGE_MAPPING:
            stage = TAG_TO_STAGE_MAPPING[tag_lower]
            stage_colors = {
                LeadStage.NEW: "#3B82F6",  # Blue
                LeadStage.CONTACTED: "#6366F1",  # Indigo
                LeadStage.QUALIFIED: "#8B5CF6",  # Violet
                LeadStage.PROPOSAL: "#A855F7",  # Purple
                LeadStage.NEGOTIATION: "#D946EF",  # Fuchsia
                LeadStage.CONVERTED: "#10B981",  # Green
            }
            return stage_colors.get(stage, "#3B82F6")
        
        # Action tags - red/orange for urgency
        if tag_lower in ACTION_TAGS:
            action = ACTION_TAGS[tag_lower]
            priority_colors = {
                "critical": "#EF4444",  # Red
                "high": "#F59E0B",  # Amber
                "medium": "#3B82F6",  # Blue
                "low": "#6B7280",  # Gray
            }
            return priority_colors.get(action.get("priority", "medium"), "#3B82F6")
        
        # Default color
        return "#3B82F6"
    
    def _get_tag_category(self, tag_name: str) -> str | None:
        """
        Determine category for a tag based on its name/type.
        
        Args:
            tag_name: Tag name
            
        Returns:
            Category name or None
        """
        tag_lower = tag_name.lower()
        
        if tag_lower in TAG_TO_STAGE_MAPPING:
            return "funnel_stage"
        
        if tag_lower in ACTION_TAGS:
            return "action"
        
        return "custom"
    
    async def ensure_stage_tags_exist(self) -> None:
        """
        Ensure all funnel stage tags exist in the database.
        
        Creates missing stage tags with appropriate colors and categories.
        """
        logger.info(
            "ensuring_stage_tags_exist",
            tenant_id=str(self.tenant_id),
        )
        
        # Get existing tags
        existing_tags = await self.tag_repo.list(limit=1000)
        existing_tag_names = {tag.name.lower() for tag in existing_tags}
        
        # Create missing stage tags
        created_count = 0
        for tag_name in TAG_TO_STAGE_MAPPING.keys():
            if tag_name not in existing_tag_names:
                color = self._get_tag_color(tag_name)
                
                await self.tag_repo.create(
                    name=tag_name,
                    color=color,
                    category="funnel_stage",
                )
                
                created_count += 1
                
                logger.info(
                    "stage_tag_created",
                    tenant_id=str(self.tenant_id),
                    tag_name=tag_name,
                )
        
        if created_count > 0:
            await self.session.commit()
        
        logger.info(
            "stage_tags_ensured",
            tenant_id=str(self.tenant_id),
            created_count=created_count,
        )


async def sync_chatwit_tags_task(tenant_id: UUID) -> dict[str, Any]:
    """
    Background task to sync Chatwit tags for a tenant.
    
    This can be scheduled to run periodically (e.g., daily).
    
    Args:
        tenant_id: Tenant ID
        
    Returns:
        Sync statistics
    """
    from domains.jusmonitoria.db.session_compat import AsyncSessionLocal
    
    async with AsyncSessionLocal() as session:
        service = ChatwitTagService(session, tenant_id)
        
        # Ensure stage tags exist
        await service.ensure_stage_tags_exist()
        
        # Sync tags from Chatwit
        result = await service.sync_tags_to_database()
        
        return result
