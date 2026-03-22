"""Shared platform services — storage, email, real-time connections."""

from platform_core.services.storage import (
    generate_presigned_url,
    generate_presigned_upload_url,
    generate_presigned_download_url,
    upload_bytes_to_s3,
    upload_bytes_to_bucket,
    download_bytes_from_s3,
    download_head_from_s3,
    delete_s3_object,
    s3_object_exists,
)
from platform_core.services.email import EmailTransport
from platform_core.services.sse_manager import ConnectionManager

__all__ = [
    # Storage
    "generate_presigned_url",
    "generate_presigned_upload_url",
    "generate_presigned_download_url",
    "upload_bytes_to_s3",
    "upload_bytes_to_bucket",
    "download_bytes_from_s3",
    "download_head_from_s3",
    "delete_s3_object",
    "s3_object_exists",
    # Email
    "EmailTransport",
    # SSE / WebSocket
    "ConnectionManager",
]
