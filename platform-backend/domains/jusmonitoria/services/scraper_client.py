"""HTTP client for the scraper microservice — granular pipeline endpoints.

Provides typed async functions that call the 3 pipeline endpoints:
1. listar_processos() — Phase 1
2. detalhar_processo() — Phase 2
3. baixar_documento()  — Phase 3

Plus the legacy consultar_oab() for backward compat.
Plus protocolar_via_scraper() for Playwright-based filing (MNI fallback).
"""

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

SCRAPER_BASE_URL = "http://scraper:8001"

# Timeouts per phase (seconds) — each phase is much faster than the monolithic scrape
TIMEOUT_LISTAR = 180.0      # Phase 1: search + parse list (some tribunals are slow)
TIMEOUT_DETALHAR = 60.0     # Phase 2: open 1 process (~10-20s typical)
TIMEOUT_DOCUMENTO = 120.0   # Phase 3: download 1 PDF (~5-30s, some are big)
TIMEOUT_LEGACY = 300.0      # Legacy monolithic (deprecated)


def _error(msg: str) -> dict:
    return {"sucesso": False, "mensagem": msg}


# ──────────────────────────────────────────────────────────────────
# Phase 1: List processes
# ──────────────────────────────────────────────────────────────────

async def listar_processos(
    oab_numero: str,
    oab_uf: str,
    tribunal: str = "trf1",
    nome_advogado: str | None = None,
) -> dict:
    """Call scraper Phase 1 — returns list of processes (no details/docs).

    When nome_advogado is provided and OAB search returns 0, the scraper
    automatically retries by lawyer name. Results include fonte='nome' in that case.

    Returns: {sucesso, mensagem, processos: [{numero, classe, ..., fonte}], total, tribunal, fonte}
    """
    try:
        payload: dict = {
            "oab_numero": oab_numero.strip(),
            "oab_uf": oab_uf.upper().strip(),
            "tribunal": tribunal.lower().strip(),
        }
        if nome_advogado and nome_advogado.strip():
            payload["nome_advogado"] = nome_advogado.strip()

        async with httpx.AsyncClient(timeout=TIMEOUT_LISTAR) as client:
            resp = await client.post(
                f"{SCRAPER_BASE_URL}/scrape/listar-processos",
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    except httpx.TimeoutException:
        logger.error("scraper_listar_timeout", extra={
            "oab": oab_numero, "uf": oab_uf, "tribunal": tribunal,
        })
        return {**_error("Timeout ao listar processos."), "processos": [], "total": 0, "tribunal": tribunal}

    except httpx.HTTPStatusError as e:
        logger.error("scraper_listar_http_error", extra={"status": e.response.status_code})
        return {**_error(f"Erro HTTP {e.response.status_code}"), "processos": [], "total": 0, "tribunal": tribunal}

    except Exception as e:
        logger.error("scraper_listar_error", extra={"error": str(e)})
        return {**_error(f"Erro ao listar: {e}"), "processos": [], "total": 0, "tribunal": tribunal}


# ──────────────────────────────────────────────────────────────────
# Phase 2: Detail one process
# ──────────────────────────────────────────────────────────────────

async def detalhar_processo(
    tribunal: str,
    numero_processo: str,
    oab_numero: str,
    oab_uf: str,
    nome_advogado: str | None = None,
) -> dict:
    """Call scraper Phase 2 — returns partes, movimentações, doc_links for one process.

    When nome_advogado is provided and OAB search returns 0, the scraper
    automatically retries by lawyer name to find the process.

    Returns: {sucesso, numero, partes_detalhadas, movimentacoes, doc_links: [{index, description, url, id_processo_doc}]}
    """
    try:
        payload: dict = {
            "tribunal": tribunal.lower().strip(),
            "numero_processo": numero_processo.strip(),
            "oab_numero": oab_numero.strip(),
            "oab_uf": oab_uf.upper().strip(),
        }
        if nome_advogado and nome_advogado.strip():
            payload["nome_advogado"] = nome_advogado.strip()

        async with httpx.AsyncClient(timeout=TIMEOUT_DETALHAR) as client:
            resp = await client.post(
                f"{SCRAPER_BASE_URL}/scrape/detalhar-processo",
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    except httpx.TimeoutException:
        logger.error("scraper_detalhar_timeout", extra={
            "numero": numero_processo, "tribunal": tribunal,
        })
        return {**_error("Timeout ao detalhar processo."), "numero": numero_processo}

    except httpx.HTTPStatusError as e:
        logger.error("scraper_detalhar_http_error", extra={
            "status": e.response.status_code, "numero": numero_processo,
        })
        return {**_error(f"Erro HTTP {e.response.status_code}"), "numero": numero_processo}

    except Exception as e:
        logger.error("scraper_detalhar_error", extra={"error": str(e), "numero": numero_processo})
        return {**_error(f"Erro ao detalhar: {e}"), "numero": numero_processo}


# ──────────────────────────────────────────────────────────────────
# Phase 3: Download one document
# ──────────────────────────────────────────────────────────────────

async def baixar_documento(
    tribunal: str,
    numero_processo: str,
    doc_url: str,
    doc_index: int = 0,
    doc_description: str = "",
) -> dict:
    """Call scraper Phase 3 — download one document, upload to S3.

    Returns: {sucesso, numero, doc_id, s3_url, tamanho_bytes, nome, tipo}
    """
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_DOCUMENTO) as client:
            resp = await client.post(
                f"{SCRAPER_BASE_URL}/scrape/baixar-documento",
                json={
                    "tribunal": tribunal.lower().strip(),
                    "numero_processo": numero_processo.strip(),
                    "doc_url": doc_url,
                    "doc_index": doc_index,
                    "doc_description": doc_description,
                },
            )
            resp.raise_for_status()
            return resp.json()

    except httpx.TimeoutException:
        logger.error("scraper_baixar_timeout", extra={
            "numero": numero_processo, "doc_url": doc_url[:80],
        })
        return {**_error("Timeout ao baixar documento."), "numero": numero_processo}

    except httpx.HTTPStatusError as e:
        logger.error("scraper_baixar_http_error", extra={
            "status": e.response.status_code, "numero": numero_processo,
        })
        return {**_error(f"Erro HTTP {e.response.status_code}"), "numero": numero_processo}

    except Exception as e:
        logger.error("scraper_baixar_error", extra={"error": str(e), "numero": numero_processo})
        return {**_error(f"Erro ao baixar: {e}"), "numero": numero_processo}


# ──────────────────────────────────────────────────────────────────
# Comarcas (jurisdições PJe) — coleta via scraper
# ──────────────────────────────────────────────────────────────────

TIMEOUT_COMARCAS = 600.0  # 10 min — coleta de comarcas é lenta (login + navegação por matérias)


async def coletar_comarcas(
    tribunal: str = "trf1",
    coletar_classes: bool = True,
    coletar_tipos_parte: bool = True,
) -> dict:
    """Trigger comarca collection on the scraper microservice.

    Calls POST /comarcas/coletar on the scraper. The scraper runs the
    collection in background and returns immediately with status.

    Returns: {status, mensagem, tribunal, ...}
    """
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_COMARCAS) as client:
            resp = await client.post(
                f"{SCRAPER_BASE_URL}/comarcas/coletar",
                json={
                    "tribunal": tribunal.lower().strip(),
                    "coletar_classes": coletar_classes,
                    "coletar_tipos_parte": coletar_tipos_parte,
                },
            )
            resp.raise_for_status()
            return resp.json()

    except httpx.TimeoutException:
        logger.error("scraper_comarcas_timeout", extra={"tribunal": tribunal})
        return {**_error("Timeout ao acionar coleta de comarcas."), "tribunal": tribunal}

    except httpx.HTTPStatusError as e:
        logger.error("scraper_comarcas_http_error", extra={
            "status": e.response.status_code, "tribunal": tribunal,
        })
        return {**_error(f"Erro HTTP {e.response.status_code}"), "tribunal": tribunal}

    except Exception as e:
        logger.error("scraper_comarcas_error", extra={"error": str(e), "tribunal": tribunal})
        return {**_error(f"Erro ao coletar comarcas: {e}"), "tribunal": tribunal}


# ──────────────────────────────────────────────────────────────────
# Legacy (deprecated — kept for backward compat)
# ──────────────────────────────────────────────────────────────────

async def consultar_oab_legacy(oab_numero: str, oab_uf: str, tribunal: str = "trf1") -> dict:
    """DEPRECATED: Monolithic scrape — use the pipeline functions instead."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_LEGACY) as client:
            resp = await client.post(
                f"{SCRAPER_BASE_URL}/scrape/consultar-oab",
                json={
                    "oab_numero": oab_numero.strip(),
                    "oab_uf": oab_uf.upper().strip(),
                    "tribunal": tribunal.lower().strip(),
                },
            )
            resp.raise_for_status()
            return resp.json()

    except httpx.TimeoutException:
        logger.error("scraper_legacy_timeout", extra={"oab": oab_numero, "uf": oab_uf})
        return {**_error("Timeout ao consultar o scraper."), "processos": [], "total": 0}

    except httpx.HTTPStatusError as e:
        logger.error("scraper_legacy_http_error", extra={"status": e.response.status_code})
        return {**_error(f"Erro HTTP {e.response.status_code}"), "processos": [], "total": 0}

    except Exception as e:
        logger.error("scraper_legacy_error", extra={"error": str(e)})
        return {**_error(f"Erro: {e}"), "processos": [], "total": 0}


# ──────────────────────────────────────────────────────────────────
# Peticionamento via Playwright (RPA)
# ──────────────────────────────────────────────────────────────────

TIMEOUT_PROTOCOLAR = 300.0  # 5 min — peticionamento é lento (login + navegação + upload)


async def protocolar_via_scraper(
    tribunal: str,
    numero_processo: str,
    pfx_base64: str,
    pfx_password: str,
    pdf_base64: str,
    tipo_documento: str = "Petição",
    descricao: str = "",
    totp_secret: Optional[str] = None,
    totp_algorithm: Optional[str] = None,
    totp_digits: Optional[int] = None,
    totp_period: Optional[int] = None,
    tipo_peticao: Optional[str] = None,
    dados_basicos: Optional[dict] = None,
    documentos_extras: Optional[list] = None,
) -> dict:
    """Protocolar petição via Playwright (RPA) no scraper microservice.

    Usado como fallback quando MNI SOAP está bloqueado (ex: TRF1).

    Returns: {sucesso, mensagem, numero_protocolo, screenshots}
    """
    logger.info(
        "protocolar_via_scraper START tribunal=%s processo=%s tipo=%s tipo_peticao=%s desc=%s",
        tribunal, numero_processo, tipo_documento, tipo_peticao, descricao[:50],
    )

    try:
        payload = {
            "tribunal": tribunal.lower().strip(),
            "numero_processo": numero_processo.strip(),
            "pfx_base64": pfx_base64,
            "pfx_password": pfx_password,
            "pdf_base64": pdf_base64,
            "tipo_documento": tipo_documento,
            "descricao": descricao,
            "totp_secret": totp_secret,
            "totp_algorithm": totp_algorithm,
            "totp_digits": totp_digits,
            "totp_period": totp_period,
        }
        if tipo_peticao:
            payload["tipo_peticao"] = tipo_peticao
        if dados_basicos:
            payload["dados_basicos"] = dados_basicos
        if documentos_extras:
            payload["documentos_extras"] = documentos_extras

        async with httpx.AsyncClient(timeout=TIMEOUT_PROTOCOLAR) as client:
            resp = await client.post(
                f"{SCRAPER_BASE_URL}/scrape/protocolar-peticao",
                json=payload,
            )
            resp.raise_for_status()
            result = resp.json()
            logger.info(
                "protocolar_via_scraper RESULT sucesso=%s protocolo=%s msg=%s",
                result.get("sucesso"), result.get("numero_protocolo"),
                result.get("mensagem", "")[:100],
            )
            return result

    except httpx.TimeoutException:
        logger.error("scraper_protocolar_timeout", extra={
            "tribunal": tribunal, "processo": numero_processo,
        })
        return {
            **_error("Timeout ao protocolar petição via Playwright (5min)."),
            "numero_protocolo": None,
            "screenshots": [],
        }

    except httpx.HTTPStatusError as e:
        detail = ""
        try:
            detail = e.response.text[:500]
        except Exception:
            pass
        logger.error(
            "scraper_protocolar_http_error status=%s detail=%s",
            e.response.status_code, detail,
        )
        return {
            **_error(f"Erro HTTP {e.response.status_code} do scraper: {detail}"),
            "numero_protocolo": None,
            "screenshots": [],
        }

    except Exception as e:
        logger.error("scraper_protocolar_error error=%s", str(e))
        return {
            **_error(f"Erro ao protocolar via scraper: {e}"),
            "numero_protocolo": None,
            "screenshots": [],
        }
