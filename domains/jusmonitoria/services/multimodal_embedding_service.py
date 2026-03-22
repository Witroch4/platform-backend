"""Multimodal embedding service using Google Gemini Embedding 2.

Supports text, PDF, image, audio, and video inputs in a unified vector space,
enabling cross-modal semantic search (e.g. query with text, find matching PDFs).

Uses the Google GenAI SDK (synchronous) wrapped in asyncio.to_thread()
to avoid blocking the event loop.

Key design decisions (from official docs):
- 1536 dims chosen: MTEB score 68.17 — highest within pgvector HNSW 2000-dim limit
- Normalization required: dims < 3072 are NOT pre-normalized; must L2-normalize
- Task types: RETRIEVAL_DOCUMENT for indexing, RETRIEVAL_QUERY for search queries
"""

import asyncio
import logging
import math
from typing import Literal

from platform_core.config import settings

logger = logging.getLogger(__name__)

# Supported MIME types for multimodal embedding
SUPPORTED_MIME_TYPES: dict[str, str] = {
    # Documents
    ".pdf": "application/pdf",
    # Images
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    # Audio (max 80s)
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    # Video (max 128s)
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
}

# Maximum file sizes per type (bytes)
MAX_FILE_SIZES: dict[str, int] = {
    "application/pdf": 20 * 1024 * 1024,  # 20 MB
    "image/png": 10 * 1024 * 1024,        # 10 MB
    "image/jpeg": 10 * 1024 * 1024,
    "image/webp": 10 * 1024 * 1024,
    "image/gif": 10 * 1024 * 1024,
    "audio/mpeg": 20 * 1024 * 1024,       # 20 MB
    "audio/wav": 30 * 1024 * 1024,        # 30 MB (WAV is uncompressed)
    "video/mp4": 50 * 1024 * 1024,        # 50 MB
    "video/quicktime": 50 * 1024 * 1024,  # 50 MB
}


TaskType = Literal[
    "RETRIEVAL_DOCUMENT",
    "RETRIEVAL_QUERY",
    "SEMANTIC_SIMILARITY",
    "CLASSIFICATION",
    "CLUSTERING",
]


class MultimodalEmbeddingService:
    """Generate embeddings for text, PDFs, images, audio, and video using Gemini Embedding 2.

    The Google GenAI SDK is synchronous, so all calls are wrapped in
    ``asyncio.to_thread()`` to keep the async event loop responsive.

    Embeddings are L2-normalized after truncation to ``output_dimensionality``
    because only the full 3072-dim output is pre-normalized (per Google docs).
    """

    def __init__(self, api_key: str | None = None):
        from google import genai

        self.api_key = api_key or settings.google_api_key
        self.model = settings.gemini_embedding_model
        self.dimension = settings.gemini_embedding_dimension
        self.client = genai.Client(api_key=self.api_key)

    @staticmethod
    def _normalize(values: list[float]) -> list[float]:
        """L2-normalize an embedding vector.

        Required for dims < 3072 per Gemini docs — the truncated
        (MRL) prefix is NOT pre-normalized.
        """
        norm = math.sqrt(sum(v * v for v in values))
        if norm == 0:
            return values
        return [v / norm for v in values]

    # ── Text embedding ────────────────────────────────────────────

    async def embed_text(
        self,
        text: str,
        task_type: TaskType = "RETRIEVAL_DOCUMENT",
    ) -> list[float]:
        """Generate embedding for a text string.

        Args:
            text: The text to embed.
            task_type: The intended use of the embedding.

        Returns:
            A list of floats (vector of ``self.dimension`` dimensions).
        """
        from google.genai import types

        def _call() -> list[float]:
            result = self.client.models.embed_content(
                model=self.model,
                contents=text,
                config=types.EmbedContentConfig(
                    task_type=task_type,
                    output_dimensionality=self.dimension,
                ),
            )
            return self._normalize(list(result.embeddings[0].values))

        return await asyncio.to_thread(_call)

    async def embed_texts_batch(
        self,
        texts: list[str],
        task_type: TaskType = "RETRIEVAL_DOCUMENT",
    ) -> list[list[float]]:
        """Generate embeddings for multiple texts.

        The Gemini embed_content API accepts a list of contents natively.
        """
        if not texts:
            return []

        from google.genai import types

        def _call() -> list[list[float]]:
            result = self.client.models.embed_content(
                model=self.model,
                contents=texts,
                config=types.EmbedContentConfig(
                    task_type=task_type,
                    output_dimensionality=self.dimension,
                ),
            )
            return [self._normalize(list(e.values)) for e in result.embeddings]

        return await asyncio.to_thread(_call)

    # ── Document / image embedding (multimodal) ──────────────────

    async def embed_document(
        self,
        data: bytes,
        mime_type: str,
        task_type: TaskType = "RETRIEVAL_DOCUMENT",
    ) -> list[float]:
        """Generate embedding for a binary document (PDF, image, audio, video).

        Args:
            data: Raw bytes of the file.
            mime_type: MIME type (e.g. ``application/pdf``, ``image/png``,
                ``audio/mpeg``, ``video/mp4``).
            task_type: The intended use of the embedding.

        Returns:
            An L2-normalized vector of ``self.dimension`` floats.

        Raises:
            ValueError: If the MIME type is unsupported or file is too large.
        """
        max_size = MAX_FILE_SIZES.get(mime_type)
        if max_size is None:
            raise ValueError(f"Unsupported MIME type for embedding: {mime_type}")
        if len(data) > max_size:
            raise ValueError(
                f"File too large for embedding: {len(data)} bytes "
                f"(max {max_size} for {mime_type})"
            )

        from google.genai import types

        def _call() -> list[float]:
            part = types.Part.from_bytes(data=data, mime_type=mime_type)
            result = self.client.models.embed_content(
                model=self.model,
                contents=part,
                config=types.EmbedContentConfig(
                    task_type=task_type,
                    output_dimensionality=self.dimension,
                ),
            )
            return self._normalize(list(result.embeddings[0].values))

        return await asyncio.to_thread(_call)

    # ── Query embedding (shorter task type) ───────────────────────

    async def embed_query(self, query: str) -> list[float]:
        """Convenience method: embed a search query.

        Uses ``RETRIEVAL_QUERY`` task type for optimal retrieval performance.
        """
        return await self.embed_text(query, task_type="RETRIEVAL_QUERY")
