"""DataJud CNJ public API service for process metadata queries.

API Base: https://api-publica.datajud.cnj.jus.br/
Auth: APIKey header (public key, may change — see docs/DataJud-API.md)
No certificate required — public access.
"""

import logging
import re
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

DATAJUD_BASE = "https://api-publica.datajud.cnj.jus.br"
DATAJUD_API_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="

# Maps our internal tribunal_id → DataJud index alias
TRIBUNAL_ID_TO_DATAJUD: dict[str, str] = {
    "TJCE-1G": "api_publica_tjce",
    "TJCE-2G": "api_publica_tjce",
    "TJSP": "api_publica_tjsp",
    "TJRJ": "api_publica_tjrj",
    "TJMG": "api_publica_tjmg",
    "TJRS": "api_publica_tjrs",
    "TJPR": "api_publica_tjpr",
    "TJBA": "api_publica_tjba",
    "TJGO": "api_publica_tjgo",
    "TJAM": "api_publica_tjam",
    "TJDFT": "api_publica_tjdft",
    "TRF1-1G": "api_publica_trf1",
    "TRF1-2G": "api_publica_trf1",
    "TRF2-1G": "api_publica_trf2",
    "TRF2-2G": "api_publica_trf2",
    "TRF3-1G": "api_publica_trf3",
    "TRF3-2G": "api_publica_trf3",
    "TRF4": "api_publica_trf4",
    "TRF5-JFCE": "api_publica_trf5",
    "TRF5-JFAL": "api_publica_trf5",
    "TRF5-JFSE": "api_publica_trf5",
    "TRF5-JFPE": "api_publica_trf5",
    "TRF5-JFPB": "api_publica_trf5",
    "TRF5-JFRN": "api_publica_trf5",
    "TRF5-REG": "api_publica_trf5",
    "TRF6-1G": "api_publica_trf6",
    "TRF6-2G": "api_publica_trf6",
    "TRT1": "api_publica_trt1",
    "TRT2": "api_publica_trt2",
    "TRT3": "api_publica_trt3",
    "TRT4": "api_publica_trt4",
    "TRT5": "api_publica_trt5",
    "TRT6": "api_publica_trt6",
    "TRT7": "api_publica_trt7",
    "TST": "api_publica_tst",
    "STJ": "api_publica_stj",
    "STF": "api_publica_stf",
    "TSE": "api_publica_tse",
    "STM": "api_publica_stm",
}

# Auto-detect DataJud alias from CNJ number (J.TT digits)
# J=4 (Federal), J=8 (Estadual), J=1 (Trabalho), J=5 (Eleitoral)
_FEDERAL_TT_MAP: dict[str, str] = {
    "01": "api_publica_trf1",
    "02": "api_publica_trf2",
    "03": "api_publica_trf3",
    "04": "api_publica_trf4",
    "05": "api_publica_trf5",
    "06": "api_publica_trf6",
}

_ESTADUAL_TT_MAP: dict[str, str] = {
    "01": "api_publica_tjac",
    "02": "api_publica_tjal",
    "03": "api_publica_tjam",
    "04": "api_publica_tjap",
    "05": "api_publica_tjba",
    "06": "api_publica_tjce",
    "07": "api_publica_tjdf",
    "08": "api_publica_tjes",
    "09": "api_publica_tjgo",
    "10": "api_publica_tjma",
    "11": "api_publica_tjmt",
    "12": "api_publica_tjms",
    "13": "api_publica_tjmg",
    "14": "api_publica_tjpa",
    "15": "api_publica_tjpb",
    "16": "api_publica_tjpr",
    "17": "api_publica_tjpe",
    "18": "api_publica_tjpi",
    "19": "api_publica_tjrj",
    "20": "api_publica_tjrn",
    "21": "api_publica_tjrs",
    "22": "api_publica_tjro",
    "23": "api_publica_tjrr",
    "24": "api_publica_tjsc",
    "25": "api_publica_tjse",
    "26": "api_publica_tjsp",
    "27": "api_publica_tjto",
    "43": "api_publica_tjdft",
}

_TRABALHO_TT_MAP: dict[str, str] = {str(i).zfill(2): f"api_publica_trt{i}" for i in range(1, 25)}
_TRABALHO_TT_MAP["00"] = "api_publica_tst"  # TST


def normalize_numero_processo(numero: str) -> str:
    """Strip formatting and return 20-digit CNJ number."""
    digits = re.sub(r"\D", "", numero)
    return digits


def detect_datajud_alias(numero: str) -> Optional[str]:
    """Infer DataJud index alias from CNJ process number (J.TT digits).

    CNJ format: NNNNNNN-DD.AAAA.J.TT.OOOO → 7+2+4+1+2+4 = 20 digits
    Position 13 (0-indexed) = J (justice branch)
    Position 14-15 = TT (tribunal code)
    """
    digits = normalize_numero_processo(numero)
    if len(digits) != 20:
        return None
    j = digits[13]
    tt = digits[14:16]
    if j == "4":
        return _FEDERAL_TT_MAP.get(tt)
    if j == "8":
        return _ESTADUAL_TT_MAP.get(tt)
    if j == "1":
        return _TRABALHO_TT_MAP.get(tt)
    if j == "5":
        return "api_publica_tse"
    if j == "3":
        return "api_publica_stm"
    return None


def get_datajud_alias(tribunal_id: Optional[str], numero: Optional[str]) -> Optional[str]:
    """Resolve DataJud alias from tribunal_id or auto-detect from process number."""
    if tribunal_id and tribunal_id in TRIBUNAL_ID_TO_DATAJUD:
        return TRIBUNAL_ID_TO_DATAJUD[tribunal_id]
    if numero:
        return detect_datajud_alias(numero)
    return None


async def consultar_datajud(
    numero_processo: str,
    tribunal_id: Optional[str] = None,
) -> dict:
    """Query DataJud public API for a process by number.

    Args:
        numero_processo: Formatted or raw 20-digit CNJ number.
        tribunal_id: Our internal tribunal ID (e.g., 'TJCE-1G', 'TRF5-JFCE').
                     If None, alias is auto-detected from the number.

    Returns:
        dict with keys: sucesso, mensagem, processo (parsed source), hits (raw list), total
    """
    numero_raw = normalize_numero_processo(numero_processo)

    alias = get_datajud_alias(tribunal_id, numero_raw)
    if not alias:
        return {
            "sucesso": False,
            "mensagem": f"Não foi possível determinar o índice DataJud para tribunal '{tribunal_id}' / número '{numero_processo}'",
            "processo": None,
            "hits": [],
            "total": 0,
        }

    url = f"{DATAJUD_BASE}/{alias}/_search"
    payload = {
        "query": {"match": {"numeroProcesso": numero_raw}},
        "size": 10,
        "sort": [{"@timestamp": {"order": "desc"}}],
    }
    headers = {
        "Authorization": f"APIKey {DATAJUD_API_KEY}",
        "Content-Type": "application/json",
    }

    logger.info("DataJud query", extra={"alias": alias, "numero": numero_raw})

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as e:
            logger.error("DataJud HTTP error", extra={"status": e.response.status_code, "body": e.response.text[:500]})
            return {
                "sucesso": False,
                "mensagem": f"DataJud retornou HTTP {e.response.status_code}: {e.response.text[:200]}",
                "processo": None,
                "hits": [],
                "total": 0,
            }
        except Exception as e:
            logger.error("DataJud connection error", extra={"error": str(e)})
            return {
                "sucesso": False,
                "mensagem": f"Erro de conexão com DataJud: {e}",
                "processo": None,
                "hits": [],
                "total": 0,
            }

    hits = data.get("hits", {}).get("hits", [])
    total = data.get("hits", {}).get("total", {}).get("value", 0)

    if not hits:
        return {
            "sucesso": False,
            "mensagem": f"Processo não encontrado no DataJud (índice: {alias})",
            "processo": None,
            "hits": [],
            "total": 0,
            "alias": alias,
        }

    # Parse first (most recent) hit
    source = hits[0]["_source"]
    processo = _parse_datajud_source(source, hits[0].get("_id", ""), alias)

    return {
        "sucesso": True,
        "mensagem": f"Encontrado no DataJud ({alias}): {total} registro(s)",
        "processo": processo,
        "hits": [h["_source"] for h in hits],
        "total": total,
        "alias": alias,
    }


def _parse_datajud_source(source: dict, doc_id: str, alias: str) -> dict:
    """Parse a DataJud _source dict into structured response."""
    numero = source.get("numeroProcesso", "")
    # Format number as NNNNNNN-DD.AAAA.J.TT.OOOO
    if len(numero) == 20:
        numero_fmt = f"{numero[:7]}-{numero[7:9]}.{numero[9:13]}.{numero[13]}.{numero[14:16]}.{numero[16:]}"
    else:
        numero_fmt = numero

    # Parse dataAjuizamento (YYYYMMDDHHMMSS → ISO or formatted)
    data_aj_raw = source.get("dataAjuizamento", "")
    data_aj = None
    if data_aj_raw and len(data_aj_raw) >= 8:
        data_aj = f"{data_aj_raw[:4]}-{data_aj_raw[4:6]}-{data_aj_raw[6:8]}"

    # Assuntos
    assuntos = []
    for idx, a in enumerate(source.get("assuntos", [])):
        assuntos.append({
            "codigo": a.get("codigo"),
            "nome": a.get("nome"),
            "principal": idx == 0,  # DataJud doesn't mark principal explicitly
        })

    # Movimentos
    movimentos = []
    for m in source.get("movimentos", []):
        complementos = []
        for ct in m.get("complementosTabelados", []):
            complementos.append(f"{ct.get('nome', '')} ({ct.get('descricao', '')})")
        mov_oj = m.get("orgaoJulgador", {})
        movimentos.append({
            "dataHora": m.get("dataHora"),
            "codigo": m.get("codigo"),
            "nome": m.get("nome"),
            "complementos": complementos,
            "orgaoJulgador": mov_oj.get("nome") if mov_oj else None,
        })
    # Sort by dataHora descending
    movimentos.sort(key=lambda x: x.get("dataHora") or "", reverse=True)

    # OrgaoJulgador
    oj_raw = source.get("orgaoJulgador", {}) or {}
    orgao_julgador = {
        "codigo": str(oj_raw.get("codigo", "")) if oj_raw.get("codigo") else None,
        "nome": oj_raw.get("nome"),
        "codigoMunicipioIbge": oj_raw.get("codigoMunicipioIBGE"),
    }

    return {
        "id": doc_id,
        "numeroProcesso": numero,
        "numeroProcessoFormatado": numero_fmt,
        "tribunal": source.get("tribunal"),
        "grau": source.get("grau"),
        "sistema": (source.get("sistema") or {}).get("nome"),
        "formato": (source.get("formato") or {}).get("nome"),
        "classe": source.get("classe"),
        "dataAjuizamento": data_aj,
        "dataAjuizamentoRaw": data_aj_raw,
        "nivelSigilo": source.get("nivelSigilo", 0),
        "dataUltimaAtualizacao": source.get("dataHoraUltimaAtualizacao"),
        "orgaoJulgador": orgao_julgador,
        "assuntos": assuntos,
        "movimentos": movimentos,
        "indiceDatajud": alias,
        # DataJud does NOT return partes (parties) — must use MNI for that
        "partes": [],
    }
