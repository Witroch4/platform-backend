FROM python:3.12-slim AS base

WORKDIR /app

# System deps for weasyprint, pdf2image, pyzbar (JusMonitorIA domain)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
    poppler-utils libzbar0 \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy all source first (needed for editable install with hatchling)
COPY . .

# Install dependencies (editable so local imports work)
RUN uv pip install --system --no-cache -e ".[jusmonitoria]"

# Default: API server
CMD ["uvicorn", "platform_core.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
