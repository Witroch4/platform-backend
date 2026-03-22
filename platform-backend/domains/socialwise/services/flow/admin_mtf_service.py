"""Business logic for MTF Diamante admin routes (variables, lotes, active lote)."""

from __future__ import annotations

import json
import secrets
import string
import time
from dataclasses import dataclass
from typing import Any

from fastapi import status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from domains.socialwise.db.models.mtf_diamante import MtfDiamanteConfig, MtfDiamanteVariavel
from domains.socialwise.db.models.user import User
from domains.socialwise.services.flow.mtf_variables import (
    NO_ACTIVE_LOTE_MSG,
    VARIABLE_DESCRIPTIONS,
    _format_lote as format_lote,
    _format_lote_ativo as format_lote_ativo,
    _format_lote_vencido as format_lote_vencido,
    _is_lote_vencido as is_lote_vencido,
    _parse_lotes as parse_lotes,
)
from platform_core.config import settings

MIN_ANALYSIS_AMOUNT_CENTS = 100
DEFAULT_VARIABLES: tuple[tuple[str, str], ...] = (
    ("chave_pix", "57944155000101"),
    ("nome_do_escritorio_rodape", "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™"),
    ("analise", "R$ 27,90"),
)
_BASE36_ALPHABET = string.digits + string.ascii_lowercase


@dataclass(slots=True)
class MtfAdminServiceError(Exception):
    message: str
    status_code: int = status.HTTP_400_BAD_REQUEST
    payload: dict[str, Any] | None = None


def _display_name(chave: str) -> str:
    return " ".join(part.capitalize() for part in chave.split("_"))


def _default_variable_rows(config_id: str) -> list[MtfDiamanteVariavel]:
    return [
        MtfDiamanteVariavel(config_id=config_id, chave=chave, valor=valor)
        for chave, valor in DEFAULT_VARIABLES
    ]


async def _ensure_user_exists(session: AsyncSession, user_id: str) -> User:
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    user = User(
        id=user_id,
        email=f"{user_id}@local.invalid",
        name=None,
        mtf_variaveis_populadas=False,
    )
    session.add(user)
    await session.flush()
    return user


async def _load_config(session: AsyncSession, user_id: str) -> MtfDiamanteConfig | None:
    result = await session.execute(
        select(MtfDiamanteConfig)
        .options(selectinload(MtfDiamanteConfig.variaveis))
        .where(MtfDiamanteConfig.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def _ensure_config_with_defaults(
    session: AsyncSession,
    user_id: str,
) -> MtfDiamanteConfig:
    await _ensure_user_exists(session, user_id)
    config = await _load_config(session, user_id)

    if config is None:
        config = MtfDiamanteConfig(user_id=user_id, is_active=True)
        session.add(config)
        await session.flush()
        session.add_all(_default_variable_rows(config.id))
        await session.flush()
        return (await _load_config(session, user_id)) or config

    editable_variables = [v for v in config.variaveis if v.chave != "lotes_oab"]
    if not editable_variables:
        session.add_all(_default_variable_rows(config.id))
        await session.flush()
        return (await _load_config(session, user_id)) or config

    return config


def _parse_currency_to_cents(value: str | int | float) -> int:
    if isinstance(value, (int, float)):
        return round(value)

    raw = value.strip()
    has_currency_prefix = "R$" in raw.upper()
    cleaned = raw.replace("R$", "").replace("r$", "").replace(" ", "").strip()

    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")

    try:
        number = float(cleaned)
    except ValueError as exc:
        raise MtfAdminServiceError("O valor da variável analise é inválido.") from exc

    if "." in cleaned or has_currency_prefix:
        return round(number * 100)
    return round(number)


async def _invalidate_variable_cache(user_id: str) -> None:
    try:
        redis = Redis.from_url(str(settings.redis_url), decode_responses=True)
        try:
            await redis.delete(f"mtf_variables:{user_id}", f"mtf_lotes:{user_id}")
        finally:
            await redis.aclose()
    except Exception:
        return


def _serialize_variables(config: MtfDiamanteConfig) -> list[dict[str, Any]]:
    lotes_var = next((v for v in config.variaveis if v.chave == "lotes_oab"), None)
    lotes = parse_lotes(lotes_var.valor) if lotes_var and isinstance(lotes_var.valor, list) else []

    normal_variables = [
        {
            "id": variable.id,
            "chave": variable.chave,
            "valor": str(variable.valor or ""),
            "tipo": "normal",
            "descricao": VARIABLE_DESCRIPTIONS.get(variable.chave, "Variável customizada"),
            "displayName": _display_name(variable.chave),
        }
        for variable in config.variaveis
        if variable.chave != "lotes_oab" and not variable.chave.startswith("lote_")
    ]

    valor_analise_var = next(
        (v for v in config.variaveis if v.chave in {"analise", "valor_analise"}),
        None,
    )
    valor_analise = str(valor_analise_var.valor or "") if valor_analise_var else ""
    lote_ativo = next((lote for lote in lotes if lote.is_active), None)
    lote_variables: list[dict[str, Any]] = []

    if lote_ativo:
        lote_variables.append(
            {
                "id": "lote_ativo",
                "chave": "lote_ativo",
                "valor": format_lote_ativo(lote_ativo, valor_analise),
                "valorRaw": lote_ativo.valor,
                "tipo": "lote",
                "descricao": f"Lote Ativo - {lote_ativo.nome} ({lote_ativo.numero})",
                "displayName": "Lote Ativo",
                "isActive": True,
                "loteData": {
                    "id": lote_ativo.id,
                    "numero": lote_ativo.numero,
                    "nome": lote_ativo.nome,
                    "valor": lote_ativo.valor,
                    "dataInicio": lote_ativo.data_inicio,
                    "dataFim": lote_ativo.data_fim,
                },
            }
        )
    else:
        lote_variables.append(
            {
                "id": "lote_ativo",
                "chave": "lote_ativo",
                "valor": NO_ACTIVE_LOTE_MSG,
                "valorRaw": "",
                "tipo": "lote",
                "descricao": "Lote Ativo - Nenhum lote selecionado",
                "displayName": "Lote Ativo",
                "isActive": False,
                "loteData": None,
            }
        )

    for lote in sorted(lotes, key=lambda item: item.numero):
        vencido = not lote.is_active and is_lote_vencido(lote)
        lote_variables.append(
            {
                "id": f"lote_{lote.numero}",
                "chave": f"lote_{lote.numero}",
                "valor": "" if lote.is_active else format_lote_vencido(lote) if vencido else format_lote(lote),
                "valorRaw": lote.valor,
                "tipo": "lote",
                "descricao": f"Lote {lote.numero} - {lote.nome or 'Sem nome'}{' (Vencido)' if vencido else ''}",
                "displayName": f"Lote {lote.numero}{' (Vencido)' if vencido else ''}",
                "isActive": lote.is_active,
                "loteData": {
                    "id": lote.id,
                    "numero": lote.numero,
                    "nome": lote.nome,
                    "valor": lote.valor,
                    "dataInicio": lote.data_inicio,
                    "dataFim": lote.data_fim,
                },
            }
        )

    return [*normal_variables, *lote_variables]


async def list_variables(session: AsyncSession, user_id: str) -> list[dict[str, Any]]:
    config = await _ensure_config_with_defaults(session, user_id)
    return _serialize_variables(config)


async def save_variables(
    session: AsyncSession,
    user_id: str,
    variables: list[dict[str, str]],
) -> list[dict[str, Any]]:
    if not isinstance(variables, list):
        raise MtfAdminServiceError("Variáveis deve ser um array")

    config = await _ensure_config_with_defaults(session, user_id)

    sanitized = [
        {"chave": item["chave"].strip(), "valor": item["valor"].strip()}
        for item in variables
        if isinstance(item.get("chave"), str) and isinstance(item.get("valor"), str)
    ]
    sanitized = [
        item
        for item in sanitized
        if item["chave"] and item["valor"] and item["chave"] != "lotes_oab" and not item["chave"].startswith("lote_")
    ]

    analysis_variable = next((item for item in sanitized if item["chave"] == "analise"), None)
    if analysis_variable is None:
        raise MtfAdminServiceError("A variável analise é obrigatória.")

    analysis_amount_cents = _parse_currency_to_cents(analysis_variable["valor"])
    if analysis_amount_cents < MIN_ANALYSIS_AMOUNT_CENTS:
        raise MtfAdminServiceError("O valor da análise deve ser no mínimo R$ 1,00.")

    for variable in list(config.variaveis):
        if variable.chave != "lotes_oab":
            await session.delete(variable)

    session.add_all(
        [
            MtfDiamanteVariavel(config_id=config.id, chave=item["chave"], valor=item["valor"])
            for item in sanitized
        ]
    )
    await session.flush()
    await _invalidate_variable_cache(user_id)

    refreshed = await _load_config(session, user_id)
    assert refreshed is not None
    return [
        {
            "id": variable.id,
            "configId": variable.config_id,
            "chave": variable.chave,
            "valor": variable.valor,
            "createdAt": variable.created_at,
            "updatedAt": variable.updated_at,
        }
        for variable in refreshed.variaveis
    ]


async def seed_variables(session: AsyncSession, user_id: str) -> bool:
    user = await _ensure_user_exists(session, user_id)
    if user.mtf_variaveis_populadas:
        return False

    await _ensure_config_with_defaults(session, user_id)
    user.mtf_variaveis_populadas = True
    await session.flush()
    await _invalidate_variable_cache(user_id)
    return True


async def get_lote_ativo(session: AsyncSession, user_id: str) -> dict[str, Any]:
    config = await _load_config(session, user_id)
    if config is None:
        return {
            "success": True,
            "loteAtivo": None,
            "variavel": {
                "id": "lote_ativo",
                "chave": "lote_ativo",
                "valor": NO_ACTIVE_LOTE_MSG,
                "tipo": "lote",
                "descricao": "Lote Ativo - Nenhum lote selecionado",
                "displayName": "Lote Ativo",
                "isActive": False,
                "loteData": None,
            },
        }

    lotes_var = next((v for v in config.variaveis if v.chave == "lotes_oab"), None)
    if not lotes_var or not isinstance(lotes_var.valor, list):
        return {
            "success": True,
            "loteAtivo": None,
            "variavel": {
                "id": "lote_ativo",
                "chave": "lote_ativo",
                "valor": "Nenhum lote configurado",
                "tipo": "lote",
                "descricao": "Lote Ativo - Nenhum lote configurado",
                "displayName": "Lote Ativo",
                "isActive": False,
                "loteData": None,
            },
        }

    lotes = parse_lotes(lotes_var.valor)
    lote_ativo = next((lote for lote in lotes if lote.is_active), None)

    if lote_ativo is None:
        return {
            "success": True,
            "loteAtivo": None,
            "variavel": {
                "id": "lote_ativo",
                "chave": "lote_ativo",
                "valor": NO_ACTIVE_LOTE_MSG,
                "tipo": "lote",
                "descricao": "Lote Ativo - Nenhum lote selecionado",
                "displayName": "Lote Ativo",
                "isActive": False,
                "loteData": None,
            },
        }

    valor_analise_var = next(
        (v for v in config.variaveis if v.chave in {"analise", "valor_analise"}),
        None,
    )
    valor_analise = str(valor_analise_var.valor or "") if valor_analise_var else ""
    variavel = {
        "id": "lote_ativo",
        "chave": "lote_ativo",
        "valor": format_lote_ativo(lote_ativo, valor_analise),
        "tipo": "lote",
        "descricao": f"Lote Ativo - {lote_ativo.nome} ({lote_ativo.numero})",
        "displayName": "Lote Ativo",
        "isActive": True,
        "loteData": {
            "id": lote_ativo.id,
            "numero": lote_ativo.numero,
            "nome": lote_ativo.nome,
            "valor": lote_ativo.valor,
            "dataInicio": lote_ativo.data_inicio,
            "dataFim": lote_ativo.data_fim,
        },
    }
    return {"success": True, "loteAtivo": variavel["loteData"], "variavel": variavel}


def _normalize_lote_valor(valor: str) -> str:
    trimmed = valor.strip()
    if trimmed.upper().startswith("R$"):
        return trimmed
    return f"R$ {trimmed}"


def _generate_lote_id() -> str:
    suffix = "".join(secrets.choice(_BASE36_ALPHABET) for _ in range(9))
    return f"lote_{int(time.time() * 1000)}_{suffix}"


async def _load_lotes_variable(
    session: AsyncSession,
    user_id: str,
    *,
    create_if_missing: bool = False,
) -> tuple[MtfDiamanteConfig, MtfDiamanteVariavel | None, list[dict[str, Any]]]:
    config = await _ensure_config_with_defaults(session, user_id) if create_if_missing else await _load_config(session, user_id)
    if config is None:
        raise MtfAdminServiceError("Configuração não encontrada", status.HTTP_404_NOT_FOUND)

    lotes_var = next((v for v in config.variaveis if v.chave == "lotes_oab"), None)
    if lotes_var is None:
        if create_if_missing:
            lotes_var = MtfDiamanteVariavel(config_id=config.id, chave="lotes_oab", valor=[])
            session.add(lotes_var)
            await session.flush()
            config = (await _load_config(session, user_id)) or config
            lotes_var = next((v for v in config.variaveis if v.chave == "lotes_oab"), None)
        else:
            return config, None, []

    stored_lotes = lotes_var.valor if lotes_var and isinstance(lotes_var.valor, list) else []
    return config, lotes_var, json.loads(json.dumps(stored_lotes))


async def list_lotes(session: AsyncSession, user_id: str) -> list[dict[str, Any]]:
    _config, _lotes_var, lotes = await _load_lotes_variable(session, user_id)
    return lotes


async def create_lote(
    session: AsyncSession,
    user_id: str,
    *,
    numero: int,
    nome: str,
    valor: str,
    data_inicio: str,
    data_fim: str,
) -> dict[str, Any]:
    _config, lotes_var, lotes = await _load_lotes_variable(session, user_id, create_if_missing=True)
    assert lotes_var is not None

    new_lote = {
        "id": _generate_lote_id(),
        "numero": int(numero),
        "nome": nome,
        "valor": _normalize_lote_valor(valor),
        "dataInicio": data_inicio,
        "dataFim": data_fim,
        "isActive": len(lotes) == 0,
    }
    lotes.append(new_lote)
    lotes_var.valor = lotes
    await session.flush()
    await _invalidate_variable_cache(user_id)
    return new_lote


async def update_lote(
    session: AsyncSession,
    user_id: str,
    lote_id: str,
    *,
    numero: int | None = None,
    nome: str | None = None,
    valor: str | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    is_active: bool | None = None,
) -> dict[str, Any]:
    _config, lotes_var, lotes = await _load_lotes_variable(session, user_id)
    if lotes_var is None or not lotes:
        raise MtfAdminServiceError("Lotes não encontrados", status.HTTP_404_NOT_FOUND)

    lote_index = next((index for index, lote in enumerate(lotes) if lote.get("id") == lote_id), -1)
    if lote_index < 0:
        raise MtfAdminServiceError("Lote não encontrado", status.HTTP_404_NOT_FOUND)

    if is_active is True:
        for index, lote in enumerate(lotes):
            if index != lote_index:
                lote["isActive"] = False

    current = lotes[lote_index]
    current["numero"] = int(numero) if numero is not None else current.get("numero")
    current["nome"] = nome if nome is not None else current.get("nome")
    current["valor"] = _normalize_lote_valor(valor) if valor is not None else current.get("valor")
    current["dataInicio"] = data_inicio if data_inicio is not None else current.get("dataInicio")
    current["dataFim"] = data_fim if data_fim is not None else current.get("dataFim")
    current["isActive"] = is_active if is_active is not None else current.get("isActive")

    lotes_var.valor = lotes
    await session.flush()
    await _invalidate_variable_cache(user_id)
    return current


async def delete_lote(session: AsyncSession, user_id: str, lote_id: str) -> None:
    _config, lotes_var, lotes = await _load_lotes_variable(session, user_id)
    if lotes_var is None or not lotes:
        raise MtfAdminServiceError("Lotes não encontrados", status.HTTP_404_NOT_FOUND)

    filtered_lotes = [lote for lote in lotes if lote.get("id") != lote_id]
    if len(filtered_lotes) == len(lotes):
        raise MtfAdminServiceError("Lote não encontrado", status.HTTP_404_NOT_FOUND)

    lotes_var.valor = filtered_lotes
    await session.flush()
    await _invalidate_variable_cache(user_id)
