"""OAB Finder service — delegates to the isolated scraper microservice via HTTP.

The actual browser automation (Playwright + stealth + Bright Data proxy)
runs in a separate Docker container (scraper service) to isolate RAM usage.
"""

import logging

import httpx

logger = logging.getLogger(__name__)

SCRAPER_BASE_URL = "http://scraper:8001"
SCRAPER_TIMEOUT = 300.0  # seconds — background task can wait; scraper may process many docs


async def consultar_oab(oab_numero: str, oab_uf: str) -> dict:
    """Proxy OAB consultation to the scraper microservice.

    Args:
        oab_numero: OAB registration number (e.g. "50784").
        oab_uf: State abbreviation (e.g. "CE").

    Returns:
        Dict matching ConsultarOABResponse schema.
    """
    try:
        async with httpx.AsyncClient(timeout=SCRAPER_TIMEOUT) as client:
            resp = await client.post(
                f"{SCRAPER_BASE_URL}/scrape/consultar-oab",
                json={
                    "oab_numero": oab_numero.strip(),
                    "oab_uf": oab_uf.upper().strip(),
                    "tribunal": "trf1",
                },
            )
            resp.raise_for_status()
            return resp.json()

    except httpx.TimeoutException:
        logger.error("scraper_timeout", extra={"oab": oab_numero, "uf": oab_uf})
        return {
            "sucesso": False,
            "mensagem": "Timeout ao consultar o scraper. Tente novamente.",
            "processos": [],
            "total": 0,
        }
    except httpx.HTTPStatusError as e:
        logger.error("scraper_http_error", extra={"status": e.response.status_code})
        return {
            "sucesso": False,
            "mensagem": f"Erro do scraper: HTTP {e.response.status_code}",
            "processos": [],
            "total": 0,
        }
    except Exception as e:
        logger.error("scraper_connection_error", extra={"error": str(e)})
        return {
            "sucesso": False,
            "mensagem": f"Erro ao conectar com o scraper: {e}",
            "processos": [],
            "total": 0,
        }
