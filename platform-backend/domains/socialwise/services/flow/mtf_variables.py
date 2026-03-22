"""MTF Diamante variables resolver — normal vars + OAB lote vars.

Port of lib/mtf-diamante/variables-resolver.ts.

Resolves MTF Diamante variables for a user, including special computed
variables for OAB lotes (lote_ativo, lote_1, lote_2, ...).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.mtf_diamante import MtfDiamanteConfig, MtfDiamanteVariavel
from domains.socialwise.db.session_compat import session_ctx
from platform_core.logging.config import get_logger

logger = get_logger(__name__)

# Brazil timezone
try:
    from zoneinfo import ZoneInfo
    _BR_TZ = ZoneInfo("America/Sao_Paulo")
except Exception:
    _BR_TZ = None


@dataclass(slots=True)
class VariavelResolvida:
    chave: str
    valor: str
    tipo: str  # "normal" | "lote"
    descricao: str = ""


@dataclass(slots=True)
class LoteOab:
    id: str
    numero: int
    nome: str
    valor: str
    data_inicio: str
    data_fim: str
    is_active: bool


# ---------------------------------------------------------------------------
# Date formatting (port of lote-date-time.ts)
# ---------------------------------------------------------------------------

def _format_lote_datetime(date_str: str) -> str:
    """Format a date string to PT-BR dd/MM/yyyy HH:mm in São Paulo timezone."""
    if not date_str:
        return ""
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        if _BR_TZ:
            dt = dt.astimezone(_BR_TZ)
        return dt.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return date_str


# ---------------------------------------------------------------------------
# Currency helpers
# ---------------------------------------------------------------------------

def _parse_currency_to_number(valor: str) -> float:
    cleaned = re.sub(r"R\$\s*", "", valor, flags=re.IGNORECASE)
    cleaned = cleaned.replace(".", "").replace(",", ".").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _format_currency(valor: float) -> str:
    if valor % 1 == 0:
        return f"R$ {int(valor)}"
    return f"R$ {valor:.2f}".replace(".", ",")


# ---------------------------------------------------------------------------
# Lote formatting
# ---------------------------------------------------------------------------

def _format_lote(lote: LoteOab) -> str:
    return (
        f"*Lote {lote.numero}: {lote.nome or 'Sem nome'}*\n"
        f"*Valor: {lote.valor}*\n"
        f"*Período: {_format_lote_datetime(lote.data_inicio)} às {_format_lote_datetime(lote.data_fim)}*"
    )


def _is_lote_vencido(lote: LoteOab) -> bool:
    if not lote.data_fim:
        return False
    try:
        dt = datetime.fromisoformat(lote.data_fim.replace("Z", "+00:00"))
        return dt.timestamp() < datetime.now().timestamp()
    except Exception:
        return False


def _format_lote_vencido(lote: LoteOab) -> str:
    return "\n".join(f"~{line}~" for line in _format_lote(lote).split("\n"))


def _format_lote_ativo(lote: LoteOab, valor_analise: str) -> str:
    base = _format_lote(lote)
    lote_num = _parse_currency_to_number(lote.valor)
    analise_num = _parse_currency_to_number(valor_analise)
    if lote_num > 0 and analise_num > 0 and lote_num > analise_num:
        complemento = lote_num - analise_num
        return f"{base}\n(com complemento de apenas *{_format_currency(complemento)}*)"
    return base


NO_ACTIVE_LOTE_MSG = (
    "*⚠️🚫 ATENÇÃO: Este serviço NÃO pode ser solicitado agora "
    "Nenhum lote ativo no momento. Veja sobre mandado de segurança!!*"
)

VARIABLE_DESCRIPTIONS: dict[str, str] = {
    "chave_pix": "Chave PIX para pagamentos (máx. 15 caracteres)",
    "nome_do_escritorio_rodape": "Nome do escritório que aparece no rodapé",
    "analise": "Valor da análise jurídica (formato R$ X,XX)",
}


def _parse_lotes(valor: Any) -> list[LoteOab]:
    """Parse lotes from JSON value (could be list of dicts)."""
    if not isinstance(valor, list):
        return []
    lotes: list[LoteOab] = []
    for item in valor:
        if isinstance(item, dict):
            lotes.append(LoteOab(
                id=item.get("id", ""),
                numero=int(item.get("numero", 0)),
                nome=item.get("nome", ""),
                valor=item.get("valor", ""),
                data_inicio=item.get("dataInicio", ""),
                data_fim=item.get("dataFim", ""),
                is_active=bool(item.get("isActive", False)),
            ))
    return lotes


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_all_variables_for_user(user_id: str) -> list[VariavelResolvida]:
    """Fetch all variables for a user (normal + lote variables)."""
    try:
        async with session_ctx() as session:
            stmt = (
                select(MtfDiamanteConfig)
                .options(selectinload(MtfDiamanteConfig.variaveis))
                .where(MtfDiamanteConfig.user_id == user_id)
            )
            result = await session.execute(stmt)
            config = result.scalar_one_or_none()

        if not config:
            logger.warning("mtf_variables_config_not_found", user_id=user_id)
            return []

        variaveis: list[VariavelResolvida] = []

        # 1. Normal variables (except lotes_oab which is internal)
        for v in config.variaveis:
            if v.chave != "lotes_oab":
                variaveis.append(VariavelResolvida(
                    chave=v.chave,
                    valor=str(v.valor or ""),
                    tipo="normal",
                    descricao=VARIABLE_DESCRIPTIONS.get(v.chave, "Variável customizada"),
                ))

        # 2. Lotes
        lotes_var = next((v for v in config.variaveis if v.chave == "lotes_oab"), None)
        valor_analise_var = next(
            (v for v in config.variaveis if v.chave in ("analise", "valor_analise")),
            None,
        )
        valor_analise_str = str(valor_analise_var.valor) if valor_analise_var and valor_analise_var.valor else ""

        if lotes_var and isinstance(lotes_var.valor, list):
            lotes = _parse_lotes(lotes_var.valor)
            lote_ativo = next((l for l in lotes if l.is_active), None)

            if lote_ativo:
                variaveis.append(VariavelResolvida(
                    chave="lote_ativo",
                    valor=_format_lote_ativo(lote_ativo, valor_analise_str),
                    tipo="lote",
                ))
            else:
                variaveis.append(VariavelResolvida(
                    chave="lote_ativo",
                    valor=NO_ACTIVE_LOTE_MSG,
                    tipo="lote",
                ))

            # Individual lote_N variables
            lote_ativo_numero = lote_ativo.numero if lote_ativo else -1
            for lote in lotes:
                if lote.numero == lote_ativo_numero:
                    valor = ""  # Already shown via {{lote_ativo}}
                elif _is_lote_vencido(lote):
                    valor = _format_lote_vencido(lote)
                else:
                    valor = _format_lote(lote)
                variaveis.append(VariavelResolvida(
                    chave=f"lote_{lote.numero}",
                    valor=valor,
                    tipo="lote",
                ))

        logger.info(
            "mtf_variables_resolved",
            user_id=user_id,
            count=len(variaveis),
        )
        return variaveis

    except Exception as exc:
        logger.error("mtf_variables_error", user_id=user_id, error=str(exc))
        return []


async def get_lote_ativo_formatado(user_id: str) -> str:
    """Fetch the active lote formatted for a user (fresh read, no cache)."""
    try:
        async with session_ctx() as session:
            stmt = (
                select(MtfDiamanteConfig)
                .options(selectinload(MtfDiamanteConfig.variaveis))
                .where(MtfDiamanteConfig.user_id == user_id)
            )
            result = await session.execute(stmt)
            config = result.scalar_one_or_none()

        if not config:
            return NO_ACTIVE_LOTE_MSG

        lotes_var = next((v for v in config.variaveis if v.chave == "lotes_oab"), None)
        if not lotes_var or not isinstance(lotes_var.valor, list):
            return NO_ACTIVE_LOTE_MSG

        lotes = _parse_lotes(lotes_var.valor)
        lote_ativo = next((l for l in lotes if l.is_active), None)
        if not lote_ativo:
            return NO_ACTIVE_LOTE_MSG

        valor_analise_var = next(
            (v for v in config.variaveis if v.chave in ("analise", "valor_analise")),
            None,
        )
        return _format_lote_ativo(lote_ativo, str(valor_analise_var.valor) if valor_analise_var and valor_analise_var.valor else "")

    except Exception as exc:
        logger.error("mtf_lote_ativo_error", user_id=user_id, error=str(exc))
        return "Erro ao buscar lote ativo"


async def get_cached_variables_for_user(user_id: str) -> list[VariavelResolvida]:
    """Fetch variables with Redis cache (10min TTL)."""
    try:
        from redis.asyncio import Redis as AsyncRedis
        from platform_core.config import settings

        redis = AsyncRedis.from_url(str(settings.redis_url), decode_responses=True)
        cache_key = f"mtf_variables:{user_id}"

        try:
            cached = await redis.get(cache_key)
            if cached:
                data = json.loads(cached)
                return [VariavelResolvida(**item) for item in data]

            variables = await get_all_variables_for_user(user_id)
            await redis.setex(
                cache_key,
                600,  # 10 minutes
                json.dumps([{"chave": v.chave, "valor": v.valor, "tipo": v.tipo, "descricao": v.descricao} for v in variables]),
            )
            return variables
        finally:
            await redis.aclose()

    except Exception:
        logger.warning("mtf_variables_redis_error", user_id=user_id)
        return await get_all_variables_for_user(user_id)
