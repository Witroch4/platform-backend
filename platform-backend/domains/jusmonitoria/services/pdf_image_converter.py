"""PDF-to-image conversion service using PyMuPDF + Pillow.

Renders PDF pages at 300 DPI via MuPDF C binding (in-process, no subprocess),
then resizes with Pillow Lanczos to max 2048px and encodes as JPEG q80.

~3-5× faster than pdftoppm subprocess (Node.js Socialwise pipeline: 13.5s → Python: ~4-6s).
"""

import asyncio
import io
import logging
import time
from concurrent.futures import ProcessPoolExecutor

import fitz  # PyMuPDF
from PIL import Image

logger = logging.getLogger(__name__)

# Defaults matching Socialwise pipeline
DEFAULT_DPI = 300
DEFAULT_MAX_DIMENSION = 2048  # OpenAI "high" detail caps here
DEFAULT_JPEG_QUALITY = 80
DEFAULT_UPLOAD_CONCURRENCY = 6


def _render_single_page(
    pdf_bytes: bytes,
    page_num: int,
    dpi: int,
    max_dimension: int,
    jpeg_quality: int,
) -> tuple[int, bytes]:
    """Render a single PDF page to optimized JPEG bytes.

    Runs in a separate process (via ProcessPoolExecutor) to bypass GIL.

    Returns:
        Tuple of (page_number, jpeg_bytes).
    """
    scale = dpi / 72.0  # fitz uses 72 DPI as base
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_num]
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))

    # Convert to Pillow Image for Lanczos resize
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

    # Resize maintaining aspect ratio (max_dimension on longest side)
    img.thumbnail((max_dimension, max_dimension), Image.LANCZOS)

    # Encode JPEG
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
    doc.close()
    return page_num, buf.getvalue()


def _render_all_pages_sequential(
    pdf_bytes: bytes,
    dpi: int = DEFAULT_DPI,
    max_dimension: int = DEFAULT_MAX_DIMENSION,
    jpeg_quality: int = DEFAULT_JPEG_QUALITY,
) -> list[bytes]:
    """Render all pages sequentially in a single thread.

    Best for small PDFs (< 5 pages) where ProcessPoolExecutor overhead
    would exceed the rendering time itself.
    """
    scale = dpi / 72.0
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images: list[bytes] = []
    try:
        for page in doc:
            pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            img.thumbnail((max_dimension, max_dimension), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
            images.append(buf.getvalue())
    finally:
        doc.close()
    return images


async def convert_pdf_to_images(
    pdf_bytes: bytes,
    dpi: int = DEFAULT_DPI,
    max_dimension: int = DEFAULT_MAX_DIMENSION,
    jpeg_quality: int = DEFAULT_JPEG_QUALITY,
    max_workers: int = 4,
) -> list[bytes]:
    """Convert a PDF to a list of optimized JPEG images.

    For small PDFs (<= 4 pages), renders sequentially in a thread.
    For larger PDFs, uses ProcessPoolExecutor for true parallel rendering.

    Args:
        pdf_bytes: Raw PDF file bytes.
        dpi: Rendering resolution (default: 300).
        max_dimension: Max pixel dimension on longest side (default: 2048).
        jpeg_quality: JPEG encoding quality 1-100 (default: 80).
        max_workers: Max parallel processes for large PDFs (default: 4).

    Returns:
        List of JPEG bytes, ordered by page number.
    """
    start = time.monotonic()

    # Get page count without rendering
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    total_pages = len(doc)
    doc.close()

    if total_pages == 0:
        logger.warning("[PDF-TO-IMAGE] PDF has 0 pages")
        return []

    logger.info("[PDF-TO-IMAGE] Total pages: %d, DPI: %d", total_pages, dpi)

    if total_pages <= 4:
        # Sequential — no process pool overhead
        images = await asyncio.to_thread(
            _render_all_pages_sequential,
            pdf_bytes, dpi, max_dimension, jpeg_quality,
        )
    else:
        # Parallel — use multiple processes to bypass GIL
        loop = asyncio.get_running_loop()
        workers = min(max_workers, total_pages)
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futures = [
                loop.run_in_executor(
                    pool,
                    _render_single_page,
                    pdf_bytes, i, dpi, max_dimension, jpeg_quality,
                )
                for i in range(total_pages)
            ]
            results = list(await asyncio.gather(*futures))

        # Sort by page number and extract bytes
        results.sort(key=lambda r: r[0])
        images = [r[1] for r in results]

    elapsed = time.monotonic() - start

    # Log per-page stats
    for i, img_bytes in enumerate(images):
        size_kb = len(img_bytes) / 1024
        logger.info("[PDF-TO-IMAGE] page-%03d.jpg: %.0fKB", i, size_kb)

    logger.info(
        "[PDF-TO-IMAGE] Rendering complete: %d images in %.1fs",
        len(images), elapsed,
    )
    return images


def get_pdf_page_count(pdf_bytes: bytes) -> int:
    """Get the number of pages in a PDF without rendering."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    count = len(doc)
    doc.close()
    return count
