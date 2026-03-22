"""Transcription agent — OCR handwritten exam pages via Vision AI.

Port of: lib/oab-eval/transcription-agent.ts

Pipeline:
1. Download images in parallel (base64)
2. OCR each page via vision LLM (concurrent, configurable limit)
3. 3-level fallback: Primary → OpenAI gpt-4.1 → gpt-4.1-mini
4. Post-process: split segments, organize by questão/peça
5. Accumulate token usage per page
"""

from __future__ import annotations

import asyncio
import base64
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

import httpx

from platform_core.ai.litellm_config import (
    call_vision,
    clean_prompt_for_openai,
    is_gemini_model,
    resolve_litellm_model,
    with_retry,
)
from platform_core.logging.config import get_logger
from domains.socialwise.services.oab_eval.blueprint_config import (
    OPENAI_FALLBACK_MODEL,
    OPENAI_LAST_RESORT_MODEL,
    get_agent_config,
)
from domains.socialwise.services.oab_eval.runtime_policy import (
    OabRuntimePolicy,
    resolve_runtime_policy,
)

logger = get_logger(__name__)

MAX_SAFE_OUTPUT_TOKENS = 30_000
DEFAULT_CONCURRENCY = 10

# ── Types ─────────────────────────────────────────────────────────────────


@dataclass
class ImageDescriptor:
    id: str
    url: str
    nome: str | None = None
    page: int | None = None


@dataclass
class PreparedImage:
    id: str
    url: str
    page: int | None = None
    base64: str = ""
    mime_type: str = "image/png"
    missing: bool = False
    reason: str = ""


@dataclass
class PageTokenUsage:
    page: int
    input: int
    output: int
    provider: str
    model: str
    duration_ms: int
    was_fallback: bool


@dataclass
class PageCompleteDetail:
    provider: str
    model: str
    tokens_in: int
    tokens_out: int
    duration_ms: int
    was_fallback: bool


@dataclass
class TranscriptionResult:
    text: str
    provider: str
    model: str
    actual_model: str
    input_tokens: int = 0
    output_tokens: int = 0
    duration_ms: int = 0
    was_fallback: bool = False


@dataclass
class TranscriptionOutput:
    pages: list[dict[str, Any]]  # [{page, text, imageKey}]
    texto_da_prova: list[dict[str, str]]  # [{output}]
    combined_text: str
    segments: list[str]
    token_usage: dict[str, Any]
    primary_provider: str
    primary_model: str


# ── Segment processing ───────────────────────────────────────────────────

_MARKER_RE = re.compile(r"^(Quest[ãa]o:\s*\d+|Peça\s+P[aá]gina:\s*\d+)", re.IGNORECASE)
_QUESTION_RE = re.compile(r"^Quest[ãa]o:\s*(\d+)", re.IGNORECASE)
_PAGE_RE = re.compile(r"^Peça\s+P[aá]gina:\s*(\d+)", re.IGNORECASE)


def _split_segments(raw: str) -> list[str]:
    text = raw.replace("\r\n", "\n").strip()
    if not text:
        return []

    lines = text.split("\n")
    results: list[str] = []
    buffer: list[str] = []

    for line in lines:
        trimmed = line.strip()
        if _MARKER_RE.match(trimmed):
            if buffer:
                results.append("\n".join(buffer).strip())
                buffer = []
        if not buffer and not trimmed:
            continue
        buffer.append(line)

    if buffer:
        results.append("\n".join(buffer).strip())

    return results if results else [text]


def _organize_segments(segments: list[str]) -> list[dict[str, str]]:
    questions: list[tuple[int, str]] = []
    pages: list[tuple[int, str]] = []
    others: list[tuple[int, str]] = []

    for idx, segment in enumerate(segments):
        trimmed = segment.strip()
        if not trimmed:
            continue
        q_match = _QUESTION_RE.match(trimmed)
        if q_match:
            questions.append((int(q_match.group(1)), trimmed))
            continue
        p_match = _PAGE_RE.match(trimmed)
        if p_match:
            pages.append((int(p_match.group(1)), trimmed))
            continue
        others.append((idx, trimmed))

    questions.sort(key=lambda x: x[0])
    pages.sort(key=lambda x: x[0])
    others.sort(key=lambda x: x[0])

    return [
        *[{"output": q[1]} for q in questions],
        *[{"output": p[1]} for p in pages],
        *[{"output": o[1]} for o in others],
    ]


# ── Image download ───────────────────────────────────────────────────────


async def _fetch_image_as_base64(descriptor: ImageDescriptor) -> PreparedImage:
    url = descriptor.url
    if not url:
        return PreparedImage(id=descriptor.id, url="", page=descriptor.page, missing=True, reason="URL ausente")

    if url.startswith("data:"):
        parts = url.split(",", 1)
        meta_match = re.match(r"data:([^;]+);base64", parts[0])
        return PreparedImage(
            id=descriptor.id,
            url=url,
            page=descriptor.page,
            base64=parts[1] if len(parts) > 1 else "",
            mime_type=meta_match.group(1) if meta_match else "image/png",
        )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            if resp.status_code == 404:
                return PreparedImage(
                    id=descriptor.id, url=url, page=descriptor.page,
                    missing=True, reason="imagem indisponivel (404)",
                )
            resp.raise_for_status()
            b64 = base64.b64encode(resp.content).decode("ascii")
            ct = resp.headers.get("content-type", "image/png")
            return PreparedImage(id=descriptor.id, url=url, page=descriptor.page, base64=b64, mime_type=ct)
    except Exception as exc:
        return PreparedImage(
            id=descriptor.id, url=url, page=descriptor.page,
            missing=True, reason=f"download failed: {exc}",
        )


# ── Single page transcription ────────────────────────────────────────────


async def _transcribe_single_image(
    image: PreparedImage,
    page: int,
    total: int,
    model: str,
    system_instructions: str,
    policy: OabRuntimePolicy,
    *,
    provider: str,
    openai_fallback_model: str = OPENAI_FALLBACK_MODEL,
) -> TranscriptionResult:
    """Transcribe a single page with 3-level fallback."""
    start = time.monotonic()

    user_prompt = (
        f"Transcreva a página {page} de {total}. Formato obrigatório:\n"
        "Questão: <número> (quando aplicável) OU Peça Pagina: <número/total se visível>\n"
        "Resposta do Aluno:\n"
        "Linha 1: ...\n"
        "Linha 2: ...\n"
        "(continue até o fim da página).\n"
        "Se houver mais de um bloco, inicie um novo cabeçalho para cada bloco."
    )

    effective_max_tokens = policy.max_output_tokens if policy.max_output_tokens > 0 else MAX_SAFE_OUTPUT_TOKENS
    litellm_model = resolve_litellm_model(provider, model)

    # === LEVEL 1: Primary provider with retry ===
    try:
        result = await with_retry(
            lambda: call_vision(
                litellm_model,
                system_instructions,
                user_prompt,
                image.base64,
                image.mime_type,
                max_tokens=effective_max_tokens,
                temperature=0.0,
                timeout=policy.timeout_s,
            ),
            context=f"Transcription:{provider}/{model}",
            retries=policy.retry_attempts,
            base_delay_ms=policy.retry_base_delay_ms,
            max_delay_ms=policy.retry_max_delay_ms,
        )
        elapsed = int((time.monotonic() - start) * 1000)
        return TranscriptionResult(
            text=result.content,
            provider=provider.lower(),
            model=model,
            actual_model=model,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            duration_ms=elapsed,
            was_fallback=False,
        )
    except Exception as primary_error:
        logger.warning(
            "primary_provider_failed",
            provider=provider,
            model=model,
            page=page,
            error=str(primary_error)[:300],
        )

    # === LEVEL 2: Fallback to OpenAI ===
    if provider != "OPENAI":
        fallback_model = resolve_litellm_model("OPENAI", openai_fallback_model)
        cleaned_prompt = clean_prompt_for_openai(system_instructions)
        try:
            result = await with_retry(
                lambda: call_vision(
                    fallback_model,
                    cleaned_prompt,
                    user_prompt,
                    image.base64,
                    image.mime_type,
                    max_tokens=effective_max_tokens,
                    temperature=0.0,
                    timeout=policy.timeout_s,
                ),
                context=f"Transcription:OPENAI/{openai_fallback_model}",
                retries=policy.retry_attempts,
                base_delay_ms=policy.retry_base_delay_ms,
                max_delay_ms=policy.retry_max_delay_ms,
            )
            elapsed = int((time.monotonic() - start) * 1000)
            return TranscriptionResult(
                text=result.content,
                provider="openai",
                model=model,
                actual_model=openai_fallback_model,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                duration_ms=elapsed,
                was_fallback=True,
            )
        except Exception:
            logger.warning("openai_fallback_failed", model=openai_fallback_model, page=page)

    # === LEVEL 3: Last resort — smaller model ===
    last_resort_litellm = resolve_litellm_model("OPENAI", OPENAI_LAST_RESORT_MODEL)
    cleaned_prompt = clean_prompt_for_openai(system_instructions)
    try:
        result = await with_retry(
            lambda: call_vision(
                last_resort_litellm,
                cleaned_prompt,
                user_prompt,
                image.base64,
                image.mime_type,
                max_tokens=effective_max_tokens,
                temperature=0.0,
                timeout=policy.timeout_s,
            ),
            context=f"Transcription:OPENAI/{OPENAI_LAST_RESORT_MODEL}",
            retries=policy.retry_attempts,
            base_delay_ms=policy.retry_base_delay_ms,
            max_delay_ms=policy.retry_max_delay_ms,
        )
        elapsed = int((time.monotonic() - start) * 1000)
        return TranscriptionResult(
            text=result.content,
            provider="openai",
            model=model,
            actual_model=OPENAI_LAST_RESORT_MODEL,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            duration_ms=elapsed,
            was_fallback=True,
        )
    except Exception:
        raise primary_error  # type: ignore[possibly-undefined]  # noqa: B904


# ── Main entry point ─────────────────────────────────────────────────────


async def transcribe_manuscript(
    session,
    *,
    lead_id: str,
    images: list[str] | list[dict[str, Any]],
    selected_provider: str | None = None,
    concurrency: int | None = None,
    on_page_complete: Callable[[int, str, PageCompleteDetail | None], Awaitable[None]] | None = None,
    cancel_check: Callable[[], None] | None = None,
) -> TranscriptionOutput:
    """Transcribe all exam pages.

    Args:
        session: SQLAlchemy async session (for blueprint lookup)
        lead_id: Lead ID
        images: List of URLs or image descriptors
        selected_provider: User-selected provider ("OPENAI" or "GEMINI")
        concurrency: Max parallel OCR calls (default 10)
        on_page_complete: Progress callback per page
        cancel_check: Callable that raises if operation was cancelled
    """
    # Base instructions (hardcoded default)
    base_instructions = (
        "Você é um assistente jurídico especializado em transcrever provas manuscritas "
        "com o máximo de fidelidade. Regras obrigatórias: "
        "1. Nunca invente ou corrija informações. Quando algo estiver ilegível, escreva '[ilegível]'. "
        "2. Transcreva linha a linha mantendo a ordem original e numere como 'Linha X: ...'. "
        "3. Preserve títulos, numeração de questões, palavras sublinhadas quando claros. "
        "4. Se identificar peça processual, use 'Peça Pagina:'. "
        "5. Para respostas das questões, inicie com 'Questão: <número>'. "
        "6. Sempre inclua 'Resposta do Aluno:' após o cabeçalho. "
        "7. Pode retornar múltiplos blocos por página. "
        "8. Não faça análise ou resumo; apenas transcreva."
    )

    config = await get_agent_config(
        session,
        linked_column="PROVA_CELL",
        env_blueprint_id_var="OAB_TRANSCRIBER_BLUEPRINT_ID",
        env_assistant_id_var="OAB_TRANSCRIBER_ASSISTANT_ID",
        search_terms=["Transcrição", "Transcricao", "OAB"],
        base_instructions=base_instructions,
        selected_provider=selected_provider,
    )

    policy = resolve_runtime_policy(
        stage="transcription",
        provider=config.provider,
        metadata=config.metadata,
        explicit_max_output_tokens=config.max_output_tokens or None,
    )

    logger.info(
        "transcription_config",
        model=config.model,
        provider=config.provider,
        max_tokens=policy.max_output_tokens,
        timeout_ms=policy.timeout_ms,
    )

    # Normalize image descriptors
    descriptors = [
        ImageDescriptor(
            id=f"img-{i}" if isinstance(img, str) else img.get("id", f"img-{i}"),
            url=img if isinstance(img, str) else img.get("url", ""),
            page=(i + 1) if isinstance(img, str) else img.get("page", i + 1),
        )
        for i, img in enumerate(images)
    ]

    # Download all images in parallel
    prepared = await asyncio.gather(*[_fetch_image_as_base64(d) for d in descriptors])
    total = len(prepared)
    missing = [p for p in prepared if p.missing]
    if missing:
        logger.warning("missing_images", count=len(missing), total=total)

    effective_concurrency = concurrency or DEFAULT_CONCURRENCY
    semaphore = asyncio.Semaphore(effective_concurrency)

    # Per-page token accumulators
    per_page_tokens: list[PageTokenUsage] = []
    total_in = 0
    total_out = 0
    provider_used = ""

    async def process_page(image: PreparedImage, index: int) -> dict[str, Any] | None:
        nonlocal total_in, total_out, provider_used

        if cancel_check:
            cancel_check()

        page_num = image.page or (index + 1)

        if image.missing:
            placeholder = f"Pagina Ausente: {page_num}\nResposta do Aluno:\nLinha 1: [{image.reason}]"
            if on_page_complete:
                await on_page_complete(index, str(page_num), PageCompleteDetail(
                    provider="system", model="download-error",
                    tokens_in=0, tokens_out=0, duration_ms=0, was_fallback=False,
                ))
            return {
                "index": index,
                "pageNumber": page_num,
                "imageId": image.id,
                "text": placeholder,
                "segments": [placeholder],
            }

        async with semaphore:
            result = await _transcribe_single_image(
                image, page_num, total, config.model, config.system_instructions, policy,
                provider=config.provider,
                openai_fallback_model=config.openai_fallback_model,
            )

        trimmed = result.text.strip()
        new_segments = _split_segments(trimmed)
        provider_used = result.provider

        page_in = result.input_tokens
        page_out = result.output_tokens
        total_in += page_in
        total_out += page_out

        per_page_tokens.append(PageTokenUsage(
            page=page_num,
            input=page_in,
            output=page_out,
            provider=result.provider,
            model=result.actual_model,
            duration_ms=result.duration_ms,
            was_fallback=result.was_fallback,
        ))

        logger.info(
            "page_transcribed",
            page=f"{index + 1}/{total}",
            provider=result.provider.upper(),
            model=result.actual_model,
            duration_s=round(result.duration_ms / 1000, 1),
            chars=len(trimmed),
            tokens_in=page_in,
            tokens_out=page_out,
            fallback=result.was_fallback,
        )

        if on_page_complete:
            await on_page_complete(index, str(page_num), PageCompleteDetail(
                provider=result.provider,
                model=result.actual_model,
                tokens_in=page_in,
                tokens_out=page_out,
                duration_ms=result.duration_ms,
                was_fallback=result.was_fallback,
            ))

        return {
            "index": index,
            "pageNumber": page_num,
            "imageId": image.id,
            "text": trimmed,
            "segments": new_segments,
        }

    # Process all pages concurrently (tolerant to individual failures)
    tasks = [process_page(img, idx) for idx, img in enumerate(prepared)]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    success_results: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for idx, r in enumerate(raw_results):
        if isinstance(r, Exception):
            errors.append({"index": idx, "error": str(r)})
            logger.error("page_failed", page=idx + 1, total=total, error=str(r))
        elif r is not None:
            success_results.append(r)

    if not success_results:
        error_msgs = "; ".join(e["error"] for e in errors)
        raise RuntimeError(f"Todas as {total} páginas falharam: {error_msgs}")

    if errors:
        logger.warning("partial_failure", failed=len(errors), success=len(success_results), total=total)

    success_results.sort(key=lambda x: x["pageNumber"])

    pages = [{"page": r["pageNumber"], "text": r["text"], "imageKey": r["imageId"]} for r in success_results]
    segments = [seg for r in success_results for seg in r["segments"]]
    texto_da_prova = _organize_segments(segments)
    combined_text = "\n\n".join(
        f"[[PÁGINA {p['page']}]]\n{p['text']}".strip() for p in pages
    )

    per_page_tokens.sort(key=lambda x: x.page)

    logger.info(
        "transcription_complete",
        pages=len(pages),
        blocks=len(texto_da_prova),
        tokens_in=total_in,
        tokens_out=total_out,
    )

    return TranscriptionOutput(
        pages=pages,
        texto_da_prova=[{"output": t["output"]} for t in texto_da_prova],
        combined_text=combined_text,
        segments=segments,
        token_usage={
            "totalInput": total_in,
            "totalOutput": total_out,
            "perPage": [
                {
                    "page": pt.page,
                    "input": pt.input,
                    "output": pt.output,
                    "provider": pt.provider,
                    "model": pt.model,
                    "durationMs": pt.duration_ms,
                    "wasFallback": pt.was_fallback,
                }
                for pt in per_page_tokens
            ],
        },
        primary_provider=config.provider,
        primary_model=config.model,
    )
