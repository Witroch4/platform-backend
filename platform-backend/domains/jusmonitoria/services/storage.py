"""Storage — delegates to platform_core shared implementation."""

from platform_core.services.storage import (  # noqa: F401
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

__all__ = [
    "generate_presigned_url",
    "generate_presigned_upload_url",
    "generate_presigned_download_url",
    "upload_bytes_to_s3",
    "upload_bytes_to_bucket",
    "download_bytes_from_s3",
    "download_head_from_s3",
    "delete_s3_object",
    "s3_object_exists",
]
