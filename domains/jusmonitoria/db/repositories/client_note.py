"""Client note repository."""

import logging
import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.client_note import ClientNote
from domains.jusmonitoria.db.repositories.base import BaseRepository

logger = logging.getLogger(__name__)


class ClientNoteRepository(BaseRepository[ClientNote]):
    """Repository for ClientNote operations with tenant isolation."""
    
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        """
        Initialize repository.
        
        Args:
            session: Async database session
            tenant_id: Tenant ID for isolation
        """
        super().__init__(ClientNote, session, tenant_id)
    
    async def get_by_client(
        self,
        client_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[ClientNote]:
        """
        Get all notes for a client within tenant.
        
        Args:
            client_id: Client UUID
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of client note instances
        """
        query = select(ClientNote).where(ClientNote.client_id == client_id)
        query = self._apply_tenant_filter(query)
        query = query.order_by(ClientNote.created_at.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_by_author(
        self,
        author_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[ClientNote]:
        """
        Get all notes by a specific author within tenant.
        
        Args:
            author_id: Author user UUID
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of client note instances
        """
        query = select(ClientNote).where(ClientNote.author_id == author_id)
        query = self._apply_tenant_filter(query)
        query = query.order_by(ClientNote.created_at.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_mentions_for_user(
        self,
        user_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[ClientNote]:
        """
        Get all notes where a user is mentioned within tenant.
        
        Args:
            user_id: User UUID
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of client note instances
        """
        query = select(ClientNote).where(
            ClientNote.mentions.contains([str(user_id)])
        )
        query = self._apply_tenant_filter(query)
        query = query.order_by(ClientNote.created_at.desc())
        query = query.offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    def extract_mentions(self, content: str) -> list[str]:
        """
        Extract @mentions from note content.
        
        Looks for patterns like @user_id or @[user_id]
        
        Args:
            content: Note content in markdown
            
        Returns:
            List of mentioned user IDs
        """
        # Pattern to match @user_id or @[user_id]
        pattern = r'@\[?([a-f0-9-]{36})\]?'
        matches = re.findall(pattern, content, re.IGNORECASE)
        return list(set(matches))  # Remove duplicates
    
    async def create_with_mentions(
        self,
        client_id: UUID,
        author_id: UUID,
        content: str,
    ) -> ClientNote:
        """
        Create a note and automatically extract mentions.
        
        Args:
            client_id: Client UUID
            author_id: Author user UUID
            content: Note content in markdown
            
        Returns:
            Created client note instance
        """
        mentions = self.extract_mentions(content)
        
        note = await self.create(
            client_id=client_id,
            author_id=author_id,
            content=content,
            mentions=mentions,
        )
        
        logger.info(
            "Created client note with mentions",
            extra={
                "note_id": str(note.id),
                "client_id": str(client_id),
                "author_id": str(author_id),
                "mentions_count": len(mentions),
                "tenant_id": str(self.tenant_id),
            },
        )
        
        return note
