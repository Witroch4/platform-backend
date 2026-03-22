"""
Serviço de consulta às Tabelas Processuais Unificadas (TPU) do CNJ.

API pública: https://gateway.cloud.pje.jus.br/tpu
Swagger: docs/API conuslta de tabelas unificas.md

Retorna códigos oficiais para classes, assuntos e tipos de documento
necessários no envelope SOAP MNI 2.2.2.
"""

import logging
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

TPU_BASE_URL = "https://gateway.cloud.pje.jus.br/tpu"

# Cache em memória simples (TTL 1h)
_cache: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL = 3600  # 1 hora


def _cache_get(key: str) -> Optional[list[dict]]:
    if key in _cache:
        ts, data = _cache[key]
        if time.monotonic() - ts < _CACHE_TTL:
            return data
        del _cache[key]
    return None


def _cache_set(key: str, data: list[dict]) -> None:
    _cache[key] = (time.monotonic(), data)


class TpuService:
    """Consulta à API pública PDPJ/TPU do CNJ."""

    def __init__(self, timeout: float = 10.0):
        self.timeout = timeout

    async def buscar_classes(
        self, *, nome: Optional[str] = None, codigo: Optional[int] = None
    ) -> list[dict]:
        params = {}
        if nome:
            params["nome"] = nome
        if codigo is not None:
            params["codigo"] = str(codigo)
        return await self._consulta("/api/v1/publico/consulta/classes", params)

    async def buscar_classes_detalhada(
        self, *, nome: Optional[str] = None, codigo: Optional[int] = None
    ) -> list[dict]:
        params = {}
        if nome:
            params["nome"] = nome
        if codigo is not None:
            params["codigo"] = str(codigo)
        return await self._consulta("/api/v1/publico/consulta/detalhada/classes", params)

    async def buscar_assuntos(
        self, *, nome: Optional[str] = None, codigo: Optional[int] = None
    ) -> list[dict]:
        params = {}
        if nome:
            params["nome"] = nome
        if codigo is not None:
            params["codigo"] = str(codigo)
        return await self._consulta("/api/v1/publico/consulta/assuntos", params)

    async def buscar_assuntos_detalhada(
        self, *, nome: Optional[str] = None, codigo: Optional[int] = None
    ) -> list[dict]:
        params = {}
        if nome:
            params["nome"] = nome
        if codigo is not None:
            params["codigo"] = str(codigo)
        return await self._consulta("/api/v1/publico/consulta/detalhada/assuntos", params)

    async def buscar_documentos(
        self, *, nome: Optional[str] = None, codigo: Optional[int] = None
    ) -> list[dict]:
        params = {}
        if nome:
            params["nome"] = nome
        if codigo is not None:
            params["codigo"] = str(codigo)
        return await self._consulta("/api/v1/publico/consulta/documentos", params)

    async def buscar_documentos_detalhada(
        self, *, nome: Optional[str] = None, codigo: Optional[int] = None
    ) -> list[dict]:
        params = {}
        if nome:
            params["nome"] = nome
        if codigo is not None:
            params["codigo"] = str(codigo)
        return await self._consulta("/api/v1/publico/consulta/detalhada/documentos", params)

    async def buscar_movimentos(
        self, *, nome: Optional[str] = None, codigo: Optional[int] = None
    ) -> list[dict]:
        params = {}
        if nome:
            params["nome"] = nome
        if codigo is not None:
            params["codigo"] = str(codigo)
        return await self._consulta("/api/v1/publico/consulta/movimentos", params)

    async def download_classes(self, codigo: Optional[int] = None) -> list[dict]:
        params = {}
        if codigo is not None:
            params["codigo"] = str(codigo)
        return await self._consulta("/api/v1/publico/download/classes", params)

    async def download_assuntos(self, codigo: Optional[int] = None) -> list[dict]:
        params = {}
        if codigo is not None:
            params["codigo"] = str(codigo)
        return await self._consulta("/api/v1/publico/download/assuntos", params)

    async def download_documentos(self, codigo: Optional[int] = None) -> list[dict]:
        params = {}
        if codigo is not None:
            params["codigo"] = str(codigo)
        return await self._consulta("/api/v1/publico/download/documentos", params)

    async def _consulta(self, path: str, params: dict) -> list[dict]:
        cache_key = f"{path}:{sorted(params.items())}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        url = f"{TPU_BASE_URL}{path}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()

            if isinstance(data, list):
                _cache_set(cache_key, data)
                return data
            return []

        except httpx.HTTPStatusError as e:
            logger.warning("TPU API error", extra={"url": url, "status": e.response.status_code})
            return []
        except httpx.RequestError as e:
            logger.warning("TPU API connection error", extra={"url": url, "error": str(e)})
            return []
