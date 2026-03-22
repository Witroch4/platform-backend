from __future__ import annotations

from datetime import datetime, timedelta, timezone

from domains.socialwise.db.models.mtf_diamante import MtfDiamanteConfig, MtfDiamanteVariavel
from domains.socialwise.services.flow.admin_mtf_service import (
    _normalize_lote_valor,
    _parse_currency_to_cents,
    _serialize_variables,
)


def test_serialize_variables_includes_active_and_expired_lotes():
    now = datetime.now(timezone.utc)
    expired = (now - timedelta(days=2)).isoformat()
    upcoming = (now + timedelta(days=2)).isoformat()

    config = MtfDiamanteConfig(id="cfg_1", user_id="user_1", is_active=True)
    config.variaveis = [
        MtfDiamanteVariavel(id="var_1", config_id="cfg_1", chave="chave_pix", valor="57944155000101"),
        MtfDiamanteVariavel(id="var_2", config_id="cfg_1", chave="analise", valor="R$ 27,90"),
        MtfDiamanteVariavel(
            id="var_3",
            config_id="cfg_1",
            chave="lotes_oab",
            valor=[
                {
                    "id": "l1",
                    "numero": 1,
                    "nome": "Primeiro lote",
                    "valor": "R$ 150,00",
                    "dataInicio": now.isoformat(),
                    "dataFim": upcoming,
                    "isActive": True,
                },
                {
                    "id": "l2",
                    "numero": 2,
                    "nome": "Segundo lote",
                    "valor": "R$ 199,00",
                    "dataInicio": expired,
                    "dataFim": expired,
                    "isActive": False,
                },
            ],
        ),
    ]

    variables = _serialize_variables(config)

    lote_ativo = next(item for item in variables if item["chave"] == "lote_ativo")
    lote_2 = next(item for item in variables if item["chave"] == "lote_2")

    assert lote_ativo["isActive"] is True
    assert "com complemento de apenas" in lote_ativo["valor"]
    assert lote_2["displayName"] == "Lote 2 (Vencido)"
    assert lote_2["valor"].startswith("~*Lote 2")


def test_parse_currency_to_cents_supports_decimal_and_cent_inputs():
    assert _parse_currency_to_cents("R$ 27,90") == 2790
    assert _parse_currency_to_cents("27.90") == 2790
    assert _parse_currency_to_cents("2790") == 2790


def test_normalize_lote_valor_preserves_existing_prefix():
    assert _normalize_lote_valor("150,00") == "R$ 150,00"
    assert _normalize_lote_valor("R$ 150,00") == "R$ 150,00"
