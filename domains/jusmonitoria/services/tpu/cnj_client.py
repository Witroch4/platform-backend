"""CNJ TPU API Client."""

import logging
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

class CnjTpuClient:
    """Client for downloading data from CNJ Tabelas Processuais Unificadas API."""
    
    BASE_URL = "https://gateway.cloud.pje.jus.br/tpu/api/v1/publico"
    
    def __init__(self, timeout: int = 60):
        self.timeout = timeout
        
    async def get_classes(self) -> List[Dict[str, Any]]:
        """Download all classes from CNJ."""
        url = f"{self.BASE_URL}/download/classes"
        return await self._fetch_data(url)
        
    async def get_assuntos(self) -> List[Dict[str, Any]]:
        """Download all assuntos from CNJ."""
        url = f"{self.BASE_URL}/download/assuntos"
        return await self._fetch_data(url)

    async def get_documentos(self) -> List[Dict[str, Any]]:
        """Download all document types from CNJ."""
        url = f"{self.BASE_URL}/download/documentos"
        return await self._fetch_data(url)

    async def _fetch_data(self, url: str) -> List[Dict[str, Any]]:
        """Helper to fetch JSON data from CNJ."""
        logger.info(f"Fetching data from {url}")
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                # The CNJ API can sometimes be slow or return large amounts of data
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()
                
                logger.info(f"Successfully downloaded {len(data)} items from {url}")
                return data
            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP error occurred while fetching {url}: {e.response.text}")
                raise
            except httpx.RequestError as e:
                logger.error(f"An error occurred while requesting {url}: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error when fetching {url}: {e}")
                raise
