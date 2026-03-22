"""PDF-to-image conversion endpoint.

Receives PDF URLs, converts to optimized JPEG images via PyMuPDF + Pillow,
uploads to MinIO, and returns the image URLs.

Designed for internal use by Socialwise (same Docker network).
Protected by X-Internal-Key header instead of JWT (service-to-service).
"""

import asyncio
import logging
import time
import uuid

import httpx
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field

from platform_core.config import settings
from domains.jusmonitoria.services.pdf_image_converter import convert_pdf_to_images
from domains.jusmonitoria.services.storage import upload_bytes_to_bucket

logger = logging.getLogger(__name__)

router = APIRouter()

# Constants
DEFAULT_BUCKET = "socialwise"
DEFAULT_MAX_DIMENSION = 2048
DEFAULT_JPEG_QUALITY = 80
DEFAULT_DPI = 300
UPLOAD_CONCURRENCY = 6
MAX_PDF_SIZE_MB = 50
PDF_DOWNLOAD_TIMEOUT = 30


# ── Schemas ───────────────────────────────────────────────────────────


class ConvertPdfRequest(BaseModel):
    """Request body for PDF-to-image conversion."""
    pdf_urls: list[str] = Field(
        ..., min_length=1, max_length=20,
        description="URLs of PDFs to convert (max 20)",
    )
    bucket: str = Field(
        default=DEFAULT_BUCKET,
        description="MinIO bucket for upload (default: socialwise)",
    )
    max_dimension: int = Field(
        default=DEFAULT_MAX_DIMENSION, ge=256, le=4096,
        description="Max pixel dimension on longest side (default: 2048)",
    )
    jpeg_quality: int = Field(
        default=DEFAULT_JPEG_QUALITY, ge=10, le=100,
        description="JPEG encoding quality (default: 80)",
    )
    dpi: int = Field(
        default=DEFAULT_DPI, ge=72, le=600,
        description="Rendering DPI (default: 300)",
    )
    prefix: str = Field(
        default="converted",
        description="S3 key prefix for uploaded images",
    )


class ConvertedImage(BaseModel):
    """Single converted image info."""
    url: str
    page: int
    size_kb: float


class ConvertPdfResponse(BaseModel):
    """Response body with converted image URLs."""
    success: bool
    image_urls: list[str]
    images: list[ConvertedImage]
    total_pages: int
    elapsed_seconds: float
    failed_urls: list[str]


# ── Helpers ───────────────────────────────────────────────────────────


async def _download_pdf(url: str) -> bytes:
    """Download a PDF from URL with timeout and size limit."""
    async with httpx.AsyncClient(
        timeout=PDF_DOWNLOAD_TIMEOUT,
        follow_redirects=True,
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()

        if len(resp.content) > MAX_PDF_SIZE_MB * 1024 * 1024:
            raise ValueError(f"PDF too large: {len(resp.content)} bytes (max {MAX_PDF_SIZE_MB}MB)")

        return resp.content


async def _upload_images_parallel(
    images: list[bytes],
    bucket: str,
    prefix: str,
    batch_id: str,
) -> list[ConvertedImage]:
    """Upload images to MinIO with limited concurrency."""
    semaphore = asyncio.Semaphore(UPLOAD_CONCURRENCY)
    results: list[ConvertedImage] = []

    async def _upload_one(page_num: int, img_bytes: bytes) -> ConvertedImage:
        async with semaphore:
            s3_key = f"{prefix}/{batch_id}/page-{page_num:03d}.jpg"
            # boto3 is sync — run in thread
            url = await asyncio.to_thread(
                upload_bytes_to_bucket,
                bucket, s3_key, img_bytes, "image/jpeg",
            )
            return ConvertedImage(
                url=url,
                page=page_num,
                size_kb=round(len(img_bytes) / 1024, 1),
            )

    tasks = [_upload_one(i, img) for i, img in enumerate(images)]
    results = await asyncio.gather(*tasks)
    return sorted(results, key=lambda r: r.page)


# ── Endpoint ──────────────────────────────────────────────────────────


@router.post(
    "/pdf/convert-to-images",
    response_model=ConvertPdfResponse,
    summary="Convert PDFs to optimized JPEG images",
    description=(
        "Downloads PDFs from given URLs, renders pages at 300 DPI using PyMuPDF, "
        "resizes to max 2048px with Lanczos, encodes as JPEG q80, "
        "and uploads to MinIO. Returns image URLs."
    ),
)
async def convert_pdf_to_images_endpoint(
    data: ConvertPdfRequest,
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
):
    """Convert PDF URLs to optimized JPEG images and upload to MinIO.

    Protected by X-Internal-Key header for service-to-service communication.
    """
    # Validate internal API key
    if not settings.pje_internal_api_key:
        raise HTTPException(500, "Internal API key not configured")
    if x_internal_key != settings.pje_internal_api_key:
        raise HTTPException(403, "Invalid or missing X-Internal-Key")

    start_time = time.monotonic()
    all_images: list[ConvertedImage] = []
    failed_urls: list[str] = []

    for pdf_url in data.pdf_urls:
        try:
            logger.info("[PDF-TO-IMAGE] Downloading PDF: %s", pdf_url[:120])

            # 1. Download PDF
            pdf_bytes = await _download_pdf(pdf_url)
            logger.info(
                "[PDF-TO-IMAGE] PDF downloaded: %d bytes",
                len(pdf_bytes),
            )

            # 2. Render pages → JPEG bytes
            images = await convert_pdf_to_images(
                pdf_bytes,
                dpi=data.dpi,
                max_dimension=data.max_dimension,
                jpeg_quality=data.jpeg_quality,
            )

            if not images:
                logger.warning("[PDF-TO-IMAGE] No pages rendered for %s", pdf_url[:80])
                failed_urls.append(pdf_url)
                continue

            # 3. Upload to MinIO (parallel)
            batch_id = uuid.uuid4().hex[:12]
            uploaded = await _upload_images_parallel(
                images, data.bucket, data.prefix, batch_id,
            )
            all_images.extend(uploaded)

        except httpx.HTTPStatusError as exc:
            logger.error(
                "[PDF-TO-IMAGE] Download failed for %s: HTTP %d",
                pdf_url[:80], exc.response.status_code,
            )
            failed_urls.append(pdf_url)
        except Exception as exc:
            logger.error(
                "[PDF-TO-IMAGE] Error processing %s: %s",
                pdf_url[:80], exc,
            )
            failed_urls.append(pdf_url)

    elapsed = round(time.monotonic() - start_time, 1)
    image_urls = [img.url for img in all_images]

    logger.info(
        "[PDF-TO-IMAGE] Pipeline complete: %d images, %d failures, %.1fs",
        len(image_urls), len(failed_urls), elapsed,
    )

    return ConvertPdfResponse(
        success=len(image_urls) > 0,
        image_urls=image_urls,
        images=all_images,
        total_pages=len(image_urls),
        elapsed_seconds=elapsed,
        failed_urls=failed_urls,
    )
