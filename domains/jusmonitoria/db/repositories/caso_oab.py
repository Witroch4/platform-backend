"""Repository for OAB-scraped cases."""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.caso_oab import CasoOAB
from domains.jusmonitoria.db.models.oab_sync_config import OABSyncConfig
from domains.jusmonitoria.db.repositories.base import BaseRepository


class CasoOABRepository(BaseRepository[CasoOAB]):
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(CasoOAB, session, tenant_id)

    async def list_all(
        self,
        *,
        skip: int = 0,
        limit: int = 200,
    ) -> tuple[list[CasoOAB], int]:
        """List all OAB cases for tenant. Returns (items, total)."""
        base = select(CasoOAB)
        base = self._apply_tenant_filter(base)

        count_q = select(func.count()).select_from(base.subquery())
        total = (await self.session.execute(count_q)).scalar_one()

        items_q = (
            base.order_by(CasoOAB.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        items = list((await self.session.execute(items_q)).scalars().all())

        return items, total

    async def get_by_numero(self, numero: str) -> CasoOAB | None:
        """Find a case by its CNJ number."""
        clean = numero.replace(".", "").replace("-", "").replace(" ", "")
        q = select(CasoOAB).where(CasoOAB.numero == clean)
        q = self._apply_tenant_filter(q)
        result = await self.session.execute(q)
        return result.scalar_one_or_none()

    async def upsert_from_scraper(
        self,
        numero: str,
        processo_data: dict,
        oab_numero: str,
        oab_uf: str,
        criado_por: Optional[UUID] = None,
        tribunal: str = "trf1",
    ) -> tuple[CasoOAB, int]:
        """Upsert a case from scraper data. Returns (caso, novas_movimentacoes)."""
        existing = await self.get_by_numero(numero)

        movimentacoes = processo_data.get("movimentacoes") or []
        documentos = processo_data.get("documentos") or []
        partes_detalhadas = processo_data.get("partes_detalhadas") or []

        total_mov = len(movimentacoes)
        total_doc = len(documentos)
        novas_mov = 0

        if existing:
            # Calculate new movements
            old_total = existing.total_movimentacoes
            if old_total > 0 and total_mov > old_total:
                novas_mov = total_mov - old_total

            updated = await self.update(
                existing.id,
                classe=processo_data.get("classe"),
                assunto=processo_data.get("assunto"),
                partes_resumo=processo_data.get("partes"),
                tribunal=tribunal,
                partes_json=partes_detalhadas,
                movimentacoes_json=movimentacoes,
                documentos_json=[
                    d if isinstance(d, dict) else d.model_dump() if hasattr(d, "model_dump") else dict(d)
                    for d in documentos
                ],
                ultima_sincronizacao=datetime.now(timezone.utc),
                total_movimentacoes=total_mov,
                novas_movimentacoes=existing.novas_movimentacoes + novas_mov,
                total_documentos=total_doc,
            )
            return updated, novas_mov
        else:
            # Create new
            caso = await self.create(
                numero=numero.replace(".", "").replace("-", "").replace(" ", ""),
                classe=processo_data.get("classe"),
                assunto=processo_data.get("assunto"),
                partes_resumo=processo_data.get("partes"),
                oab_numero=oab_numero,
                oab_uf=oab_uf,
                tribunal=tribunal,
                partes_json=partes_detalhadas,
                movimentacoes_json=movimentacoes,
                documentos_json=[
                    d if isinstance(d, dict) else d.model_dump() if hasattr(d, "model_dump") else dict(d)
                    for d in documentos
                ],
                ultima_sincronizacao=datetime.now(timezone.utc),
                total_movimentacoes=total_mov,
                novas_movimentacoes=total_mov,  # All movements are new on first sync
                total_documentos=total_doc,
                criado_por=criado_por,
            )
            return caso, total_mov

    async def get_sync_summary_by_oab(
        self, oab_numero: str, oab_uf: str
    ) -> dict:
        """Return last sync timestamp and case count for an OAB number."""
        q = (
            select(
                func.max(CasoOAB.ultima_sincronizacao).label("last_sync"),
                func.count().label("total"),
            )
            .where(CasoOAB.oab_numero == oab_numero)
            .where(CasoOAB.oab_uf == oab_uf.upper())
        )
        q = self._apply_tenant_filter(q)
        row = (await self.session.execute(q)).one()
        return {"last_sync": row.last_sync, "count": row.total}

    async def marcar_visto(self, id: UUID) -> CasoOAB | None:
        """Reset new movements counter."""
        return await self.update(id, novas_movimentacoes=0)

    async def add_document_to_processo(
        self, numero: str, doc_data: dict
    ) -> bool:
        """Append a document to an existing caso's documentos_json list.

        Used by the pipeline Phase 3 to add downloaded docs incrementally.
        Returns True if the document was added, False if caso not found or already exists.
        """
        caso = await self.get_by_numero(numero)
        if not caso:
            return False

        current_docs: list = caso.documentos_json or []

        # Deduplicate by id_processo_doc
        doc_id = doc_data.get("id_processo_doc", "")
        if doc_id:
            for existing_doc in current_docs:
                if isinstance(existing_doc, dict) and existing_doc.get("id_processo_doc") == doc_id:
                    # Already exists — update S3 URL if changed
                    existing_doc.update(doc_data)
                    await self.update(
                        caso.id,
                        documentos_json=current_docs,
                        total_documentos=len(current_docs),
                    )
                    return True

        current_docs.append(doc_data)
        await self.update(
            caso.id,
            documentos_json=current_docs,
            total_documentos=len(current_docs),
        )
        return True


class OABSyncConfigRepository(BaseRepository[OABSyncConfig]):
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        super().__init__(OABSyncConfig, session, tenant_id)

    async def get_by_oab(self, oab_numero: str, oab_uf: str) -> OABSyncConfig | None:
        """Find sync config by OAB number and state."""
        q = (
            select(OABSyncConfig)
            .where(OABSyncConfig.oab_numero == oab_numero)
            .where(OABSyncConfig.oab_uf == oab_uf.upper())
        )
        q = self._apply_tenant_filter(q)
        result = await self.session.execute(q)
        return result.scalar_one_or_none()

    async def get_or_create(
        self,
        oab_numero: str,
        oab_uf: str,
        nome_advogado: str | None = None,
    ) -> OABSyncConfig:
        """Get existing or create new sync config.

        If nome_advogado is provided and the record already exists without a name,
        updates it so the fallback search works on next sync.
        """
        existing = await self.get_by_oab(oab_numero, oab_uf)
        if existing:
            if nome_advogado and not existing.nome_advogado:
                await self.update(existing.id, nome_advogado=nome_advogado)
            return existing
        return await self.create(
            oab_numero=oab_numero,
            oab_uf=oab_uf.upper(),
            tribunal="trf1",
            nome_advogado=nome_advogado,
        )

    async def list_active(self) -> list[OABSyncConfig]:
        """List all active sync configs (not in error state)."""
        q = select(OABSyncConfig).where(OABSyncConfig.status != "disabled")
        q = self._apply_tenant_filter(q)
        result = await self.session.execute(q)
        return list(result.scalars().all())
