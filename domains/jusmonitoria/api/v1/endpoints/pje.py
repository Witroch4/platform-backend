"""Endpoints internos para sync de jurisdições PJe entre scraper e banco de dados.

Chamados exclusivamente pelo serviço scraper — sem autenticação de usuário.
O scraper:
  1. GET /pje/jurisdicoes?tribunal=trf1  → descobre o que já foi coletado
  2. POST /pje/jurisdicoes/upsert        → salva cada combo (materia × jurisdicao × classes) coletado
"""

from hmac import compare_digest
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.config import settings
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.tpu import PjeJurisdicao

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pje", tags=["pje-interno"])


def require_pje_internal_api_key(
    x_internal_api_key: str | None = Header(default=None, alias="X-Internal-API-Key"),
) -> None:
    """Protege rotas internas do scraper com segredo compartilhado."""
    if not settings.pje_internal_api_key:
        logger.error("pje_internal_api_key_not_configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PJe internal API key not configured.",
        )

    if not x_internal_api_key or not compare_digest(x_internal_api_key, settings.pje_internal_api_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal API key.",
        )


# ──────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────

class JurisdicaoItem(BaseModel):
    tribunal: str
    materia_value: str
    materia_text: str
    jurisdicao_value: str
    jurisdicao_text: str
    classes: list[dict[str, Any]] | None = None
    status_coleta: str = "pendente"
    coleta_completa: bool = False
    ultimo_erro: str | None = None
    coletado_em: datetime | None = None


class UpsertResponse(BaseModel):
    acao: str          # "inserido" | "atualizado"
    tribunal: str
    materia_value: str
    jurisdicao_value: str


TOTAL_MATERIAS_ESPERADAS = 26  # 26 matérias do PJe (lista em pje_cadastro_dados.py)


class StatusResponse(BaseModel):
    tribunal: str
    total: int
    materias_cobertas: list[str]
    ultima_coleta: datetime | None
    has_competencias: bool = False
    completude_ok: bool = False


# ──────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────

@router.get("/jurisdicoes", response_model=list[JurisdicaoItem])
async def listar_jurisdicoes(
    tribunal: str = Query(..., description="Código do tribunal: trf1, trf3, trf5, trf6, tjce"),
    materia_value: str | None = Query(None, description="Filtrar por matéria específica"),
    db: AsyncSession = Depends(get_jusmonitoria_session),
    _: None = Depends(require_pje_internal_api_key),
) -> list[JurisdicaoItem]:
    """Retorna todos os combos (materia, jurisdicao) já coletados para o tribunal.

    Usado pelo scraper para descobrir o que NÃO precisa ser re-coletado.
    """
    stmt = select(PjeJurisdicao).where(PjeJurisdicao.tribunal == tribunal)
    if materia_value:
        stmt = stmt.where(PjeJurisdicao.materia_value == materia_value)
    stmt = stmt.order_by(PjeJurisdicao.materia_value, PjeJurisdicao.jurisdicao_text)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        JurisdicaoItem(
            tribunal=r.tribunal,
            materia_value=r.materia_value,
            materia_text=r.materia_text,
            jurisdicao_value=r.jurisdicao_value,
            jurisdicao_text=r.jurisdicao_text,
            classes=r.classes,
            status_coleta=r.status_coleta,
            coleta_completa=r.coleta_completa,
            ultimo_erro=r.ultimo_erro,
            coletado_em=r.coletado_em,
        )
        for r in rows
    ]


@router.post("/jurisdicoes/upsert", response_model=UpsertResponse)
async def upsert_jurisdicao(
    item: JurisdicaoItem,
    db: AsyncSession = Depends(get_jusmonitoria_session),
    _: None = Depends(require_pje_internal_api_key),
) -> UpsertResponse:
    """Insere ou atualiza um combo (tribunal, materia, jurisdicao, classes).

    Usa INSERT … ON CONFLICT DO UPDATE para ser idempotente.
    Chamado pelo scraper após cada combo coletado.
    """
    now = item.coletado_em or datetime.now(timezone.utc)

    stmt = pg_insert(PjeJurisdicao).values(
        tribunal=item.tribunal,
        materia_value=item.materia_value,
        materia_text=item.materia_text,
        jurisdicao_value=item.jurisdicao_value,
        jurisdicao_text=item.jurisdicao_text,
        classes=item.classes,
        status_coleta=item.status_coleta,
        coleta_completa=item.coleta_completa,
        ultimo_erro=item.ultimo_erro,
        coletado_em=now,
    ).on_conflict_do_update(
        constraint="uq_pje_jurisdicoes_tribunal_materia_jurisdicao",
        set_={
            "materia_text": item.materia_text,
            "jurisdicao_text": item.jurisdicao_text,
            "classes": item.classes,
            "status_coleta": item.status_coleta,
            "coleta_completa": item.coleta_completa,
            "ultimo_erro": item.ultimo_erro,
            "coletado_em": now,
            "updated_at": func.now(),
        },
    ).returning(PjeJurisdicao.id, PjeJurisdicao.created_at, PjeJurisdicao.updated_at)

    result = await db.execute(stmt)
    row = result.fetchone()
    await db.commit()

    # Se created_at == updated_at (dentro de 1s) → inserido; caso contrário → atualizado
    acao = "inserido" if row and abs((row.updated_at - row.created_at).total_seconds()) < 2 else "atualizado"

    logger.debug(
        "upsert %s | %s/%s/%s → %s",
        item.tribunal, item.materia_value, item.jurisdicao_value,
        len(item.classes or []), acao,
    )
    return UpsertResponse(
        acao=acao,
        tribunal=item.tribunal,
        materia_value=item.materia_value,
        jurisdicao_value=item.jurisdicao_value,
    )


@router.get("/jurisdicoes/status", response_model=list[StatusResponse])
async def status_jurisdicoes(
    db: AsyncSession = Depends(get_jusmonitoria_session),
    _: None = Depends(require_pje_internal_api_key),
) -> list[StatusResponse]:
    """Resumo da cobertura de coleta por tribunal."""
    from sqlalchemy import distinct

    sql = (
        select(
            PjeJurisdicao.tribunal,
            func.count(PjeJurisdicao.id).label("total"),
            func.max(PjeJurisdicao.coletado_em).label("ultima_coleta"),
        )
        .group_by(PjeJurisdicao.tribunal)
        .order_by(PjeJurisdicao.tribunal)
    )
    rows = (await db.execute(sql)).fetchall()

    result = []
    for row in rows:
        materias_stmt = (
            select(distinct(PjeJurisdicao.materia_value))
            .where(PjeJurisdicao.tribunal == row.tribunal)
            .order_by(PjeJurisdicao.materia_value)
        )
        materias = list((await db.execute(materias_stmt)).scalars().all())

        # Verificar se alguma classe tem competências não-vazias no JSONB
        comp_stmt = text("""
            SELECT EXISTS(
                SELECT 1 FROM pje_jurisdicoes
                WHERE tribunal = :tribunal
                  AND classes IS NOT NULL
                  AND jsonb_array_length(classes) > 0
                  AND EXISTS (
                      SELECT 1 FROM jsonb_array_elements(classes) AS cls
                      WHERE cls -> 'competencias' IS NOT NULL
                        AND jsonb_typeof(cls -> 'competencias') = 'array'
                        AND jsonb_array_length(cls -> 'competencias') > 0
                  )
            )
        """)
        has_comp = (await db.execute(comp_stmt, {"tribunal": row.tribunal})).scalar() or False

        completude = len(materias) >= TOTAL_MATERIAS_ESPERADAS and has_comp

        result.append(StatusResponse(
            tribunal=row.tribunal,
            total=row.total,
            materias_cobertas=materias,
            ultima_coleta=row.ultima_coleta,
            has_competencias=has_comp,
            completude_ok=completude,
        ))
    return result
