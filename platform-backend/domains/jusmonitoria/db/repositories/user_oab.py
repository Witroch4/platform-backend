"""Repository para UserOAB — múltiplas OABs por advogado."""

from uuid import UUID

from sqlalchemy import select, update

from domains.jusmonitoria.db.models.user_oab import UserOAB
from domains.jusmonitoria.db.repositories.base import BaseRepository


class UserOABRepository(BaseRepository[UserOAB]):
    def __init__(self, session, tenant_id: UUID):
        super().__init__(UserOAB, session, tenant_id)

    async def list_by_user(self, user_id: UUID) -> list[UserOAB]:
        """Lista todas as OABs de um usuário (primária primeiro)."""
        q = (
            select(UserOAB)
            .where(
                UserOAB.tenant_id == self.tenant_id,
                UserOAB.user_id == user_id,
            )
            .order_by(UserOAB.is_primary.desc(), UserOAB.created_at)
        )
        result = await self.session.execute(q)
        return list(result.scalars().all())

    async def get_primary(self, user_id: UUID) -> UserOAB | None:
        """Retorna a OAB primária do usuário, se existir."""
        q = select(UserOAB).where(
            UserOAB.tenant_id == self.tenant_id,
            UserOAB.user_id == user_id,
            UserOAB.is_primary.is_(True),
        )
        result = await self.session.execute(q)
        return result.scalar_one_or_none()

    async def get_by_oab(self, user_id: UUID, oab_numero: str, oab_uf: str) -> UserOAB | None:
        """Busca OAB específica de um usuário."""
        q = select(UserOAB).where(
            UserOAB.tenant_id == self.tenant_id,
            UserOAB.user_id == user_id,
            UserOAB.oab_numero == oab_numero,
            UserOAB.oab_uf == oab_uf.upper(),
        )
        result = await self.session.execute(q)
        return result.scalar_one_or_none()

    async def count_by_user(self, user_id: UUID) -> int:
        """Conta quantas OABs o usuário possui."""
        from sqlalchemy import func
        q = select(func.count()).select_from(UserOAB).where(
            UserOAB.tenant_id == self.tenant_id,
            UserOAB.user_id == user_id,
        )
        result = await self.session.execute(q)
        return result.scalar_one()

    async def clear_primary_flag(self, user_id: UUID) -> None:
        """Remove o flag is_primary de todas as OABs do usuário."""
        q = (
            update(UserOAB)
            .where(
                UserOAB.tenant_id == self.tenant_id,
                UserOAB.user_id == user_id,
            )
            .values(is_primary=False)
        )
        await self.session.execute(q)

    async def list_all_active(self) -> list[UserOAB]:
        """Lista todas as OABs ativas do tenant (para o sync pipeline)."""
        q = select(UserOAB).where(
            UserOAB.tenant_id == self.tenant_id,
            UserOAB.ativo.is_(True),
        )
        result = await self.session.execute(q)
        return list(result.scalars().all())
