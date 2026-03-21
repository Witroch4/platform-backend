"""Endpoints para consulta às Tabelas Processuais Unificadas (TPU) do CNJ."""

from typing import Optional

from fastapi import APIRouter, Query, Depends
from sqlalchemy import select, or_, case, text
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.services.tpu_service import TpuService
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.tpu import TpuClasse, TpuAssunto
from domains.jusmonitoria.schemas.tpu import TpuClasseResponse, TpuAssuntoResponse

router = APIRouter(prefix="/tpu", tags=["tpu"])

# TpuService still used for documents and movimentos which are not yet downloaded locally
_tpu = TpuService()

# Popular/default items shown when user clicks the field (no query typed)
# Mandado de Segurança first, then other common classes
POPULAR_CLASSE_CODES = [
    120,    # Mandado de Segurança Cível
    1029,   # Mandado de Segurança
    119,    # Mandado de Segurança Coletivo
    7,      # Procedimento Comum Cível
    281,    # Procedimento Comum
    65,     # Ação Civil Pública
    1116,   # Execução Fiscal
    156,    # Cumprimento de sentença
    1331,   # Habeas Corpus
    307,    # Habeas Corpus Criminal
]

POPULAR_ASSUNTO_CODES = [
    10170,  # Exame da Ordem OAB
    10379,  # Anulação e Correção de Provas / Questões
    9985,   # DIREITO ADMINISTRATIVO E OUTRAS MATÉRIAS DE DIREITO PÚBLICO
    899,    # Direito Civil
    7768,   # Direito do Consumidor
    10028,  # Licitações
    10069,  # Responsabilidade Civil do Estado
    14,     # Direito Penal
    2581,   # Direito do Trabalho
    864,    # Direito Tributário
]


async def _build_assunto_hierarchy(
    session: AsyncSession,
    codigos: list[int],
) -> dict[int, str]:
    """Build full hierarchy path strings for a list of assunto codes.

    Returns {codigo: 'ROOT (9985) | Parent (10157) | Item (10170)'}.
    Uses a recursive CTE for efficiency.
    """
    if not codigos:
        return {}

    result = await session.execute(
        text("""
            WITH RECURSIVE hier AS (
                SELECT codigo, nome, cod_item_pai,
                       ARRAY[codigo] as path_codes,
                       ARRAY[nome::text] as path_names,
                       1 as depth
                FROM tpu_assuntos
                WHERE codigo = ANY(:codes)
                UNION ALL
                SELECT p.codigo, p.nome, p.cod_item_pai,
                       h.path_codes || p.codigo,
                       h.path_names || p.nome::text,
                       h.depth + 1
                FROM tpu_assuntos p
                JOIN hier h ON p.codigo = h.cod_item_pai
                WHERE h.depth < 10
                  AND NOT (p.codigo = ANY(h.path_codes))
            )
            SELECT DISTINCT ON (path_codes[1])
                path_codes[1] as leaf_codigo,
                path_codes,
                path_names
            FROM hier
            ORDER BY path_codes[1], depth DESC
        """),
        {"codes": codigos},
    )

    paths: dict[int, str] = {}
    for row in result:
        leaf = row[0]
        codes = list(row[1])   # [leaf, parent, grandparent, ...]
        names = list(row[2])
        # Reverse to get root-first order, then build "Name (code) | Name (code) | ..."
        parts = [
            f"{n} ({c})" for n, c in zip(reversed(names), reversed(codes))
        ]
        paths[leaf] = " | ".join(parts)
    return paths


async def _get_descendant_codes(session: AsyncSession, ancestor_codigo: int) -> list[int]:
    """Get all descendant codes of a given assunto (for filtering by matéria)."""
    result = await session.execute(
        text("""
            WITH RECURSIVE desc_tree AS (
                SELECT codigo FROM tpu_assuntos WHERE codigo = :ancestor
                UNION ALL
                SELECT c.codigo
                FROM tpu_assuntos c
                JOIN desc_tree d ON c.cod_item_pai = d.codigo
            )
            SELECT codigo FROM desc_tree
        """),
        {"ancestor": ancestor_codigo},
    )
    return [row[0] for row in result]


@router.get("/materias", response_model=list[TpuAssuntoResponse])
async def listar_materias(
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> list[TpuAssuntoResponse]:
    """Lista todas as matérias (assuntos raiz, sem pai). Equivalente ao campo Matéria do PJe."""
    stmt = (
        select(TpuAssunto)
        .where(TpuAssunto.cod_item_pai.is_(None))
        .order_by(TpuAssunto.nome)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/classes", response_model=list[TpuClasseResponse])
async def buscar_classes(
    q: Optional[str] = Query(None, description="Busca por nome (parcial)"),
    codigo: Optional[int] = Query(None, description="Busca por código exato"),
    popular: bool = Query(False, description="Retorna classes populares quando sem query"),
    limit: int = Query(50, description="Limite de resultados"),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> list[TpuClasseResponse]:
    """Consulta classes processuais (local DB). Max 50 resultados."""
    stmt = select(TpuClasse)

    if codigo is not None:
        stmt = stmt.where(TpuClasse.codigo == codigo)
    elif q:
        conditions = [TpuClasse.nome.ilike(f"%{q}%")]
        try:
            q_int = int(q)
            conditions.append(TpuClasse.codigo == q_int)
        except ValueError:
            pass
        stmt = stmt.where(or_(*conditions))
        # Put "Mandado de Segurança" at top when searching
        stmt = stmt.order_by(
            case(
                (TpuClasse.codigo == 120, 0),
                (TpuClasse.codigo == 1116, 1),
                (TpuClasse.codigo == 1117, 2),
                else_=100,
            ),
            TpuClasse.nome,
        )
    elif popular:
        stmt = stmt.where(TpuClasse.codigo.in_(POPULAR_CLASSE_CODES))
        # Order with Mandado de Segurança first
        stmt = stmt.order_by(
            case(
                *[(TpuClasse.codigo == code, idx) for idx, code in enumerate(POPULAR_CLASSE_CODES)],
                else_=len(POPULAR_CLASSE_CODES),
            )
        )
    else:
        # No query, no popular — return nothing
        return []

    stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/classes/detalhada")
async def buscar_classes_detalhada(
    q: Optional[str] = Query(None, description="Busca por nome (parcial)"),
    codigo: Optional[int] = Query(None, description="Busca por código exato"),
) -> list[dict]:
    """Consulta classes processuais detalhada (CNJ Público fallback)."""
    return await _tpu.buscar_classes_detalhada(nome=q, codigo=codigo)


@router.get("/assuntos", response_model=list[TpuAssuntoResponse])
async def buscar_assuntos(
    q: Optional[str] = Query(None, description="Busca por nome (parcial)"),
    codigo: Optional[int] = Query(None, description="Busca por código exato"),
    materia: Optional[int] = Query(None, description="Filtra assuntos por matéria (código da matéria raiz)"),
    popular: bool = Query(False, description="Retorna assuntos populares quando sem query"),
    limit: int = Query(50, description="Limite de resultados"),
    session: AsyncSession = Depends(get_jusmonitoria_session),
) -> list[TpuAssuntoResponse]:
    """Consulta assuntos processuais (local DB) com hierarquia. Max 50 resultados."""
    stmt = select(TpuAssunto)

    # If materia filter is set, get all descendant codes first
    materia_descendant_codes: list[int] | None = None
    if materia is not None:
        materia_descendant_codes = await _get_descendant_codes(session, materia)

    if codigo is not None:
        stmt = stmt.where(TpuAssunto.codigo == codigo)
    elif q:
        conditions = [TpuAssunto.nome.ilike(f"%{q}%")]
        try:
            q_int = int(q)
            conditions.append(TpuAssunto.codigo == q_int)
        except ValueError:
            pass
        stmt = stmt.where(or_(*conditions))
        # Apply matéria filter
        if materia_descendant_codes is not None:
            stmt = stmt.where(TpuAssunto.codigo.in_(materia_descendant_codes))
    elif popular:
        if materia_descendant_codes is not None:
            # Popular within matéria: prioritize POPULAR_ASSUNTO_CODES that belong to this matéria,
            # then direct children of the matéria, then remaining descendants — all alphabetically within each tier.
            stmt = stmt.where(TpuAssunto.codigo.in_(materia_descendant_codes))
            # Exclude the root matéria itself from results
            stmt = stmt.where(TpuAssunto.codigo != materia)
            # Build priority ordering: popular codes first (in list order), then direct children, then rest
            popular_cases = [
                (TpuAssunto.codigo == code, idx)
                for idx, code in enumerate(POPULAR_ASSUNTO_CODES)
            ]
            stmt = stmt.order_by(
                case(
                    *popular_cases,
                    (TpuAssunto.cod_item_pai == materia, len(POPULAR_ASSUNTO_CODES)),
                    else_=len(POPULAR_ASSUNTO_CODES) + 1,
                ),
                TpuAssunto.nome,
            )
        else:
            stmt = stmt.where(TpuAssunto.codigo.in_(POPULAR_ASSUNTO_CODES))
            stmt = stmt.order_by(
                case(
                    *[(TpuAssunto.codigo == code, idx) for idx, code in enumerate(POPULAR_ASSUNTO_CODES)],
                    else_=len(POPULAR_ASSUNTO_CODES),
                )
            )
    else:
        # No query, no popular — if materia is set, show its children
        if materia_descendant_codes is not None:
            stmt = stmt.where(TpuAssunto.codigo.in_(materia_descendant_codes))
            stmt = stmt.where(TpuAssunto.codigo != materia)
            stmt = stmt.order_by(
                case(
                    (TpuAssunto.cod_item_pai == materia, 0),
                    else_=1,
                ),
                TpuAssunto.nome,
            )
        else:
            return []

    stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    assuntos = list(result.scalars().all())

    # Build hierarchy paths for all returned assuntos
    codigos = [a.codigo for a in assuntos]
    hierarchy = await _build_assunto_hierarchy(session, codigos)

    # Build response with hierarchy attached
    responses = []
    for a in assuntos:
        resp = TpuAssuntoResponse.model_validate(a)
        resp.hierarquia = hierarchy.get(a.codigo)
        responses.append(resp)

    return responses


@router.get("/assuntos/detalhada")
async def buscar_assuntos_detalhada(
    q: Optional[str] = Query(None, description="Busca por nome (parcial)"),
    codigo: Optional[int] = Query(None, description="Busca por código exato"),
) -> list[dict]:
    """Consulta assuntos processuais detalhada (CNJ Público fallback)."""
    return await _tpu.buscar_assuntos_detalhada(nome=q, codigo=codigo)


@router.get("/documentos")
async def buscar_documentos(
    q: Optional[str] = Query(None, description="Busca por nome (parcial)"),
    codigo: Optional[int] = Query(None, description="Busca por código exato"),
) -> list[dict]:
    """Consulta tipos de documento processual (TPU/CNJ). Max 10 resultados."""
    return await _tpu.buscar_documentos(nome=q, codigo=codigo)


@router.get("/documentos/detalhada")
async def buscar_documentos_detalhada(
    q: Optional[str] = Query(None, description="Busca por nome (parcial)"),
    codigo: Optional[int] = Query(None, description="Busca por código exato"),
) -> list[dict]:
    """Consulta tipos de documento detalhada (DocumentoProcessualDTO completo)."""
    return await _tpu.buscar_documentos_detalhada(nome=q, codigo=codigo)


@router.get("/movimentos")
async def buscar_movimentos(
    q: Optional[str] = Query(None, description="Busca por nome (parcial)"),
    codigo: Optional[int] = Query(None, description="Busca por código exato"),
) -> list[dict]:
    """Consulta movimentos processuais (TPU/CNJ). Max 10 resultados."""
    return await _tpu.buscar_movimentos(nome=q, codigo=codigo)
