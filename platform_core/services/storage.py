"""S3-compatible storage client for the backend (MinIO / AWS S3).

Provides presigned URL generation for uploads and downloads, plus
direct upload/download helpers for server-side operations.
"""

from functools import lru_cache

import boto3
import structlog
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

logger = structlog.get_logger(__name__)


@lru_cache(maxsize=1)
def _get_s3_client():
    """Return a cached S3 client configured for MinIO."""
    from platform_core.config import settings

    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.s3_endpoint}",
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=BotoConfig(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def _key_from_url(s3_url: str, bucket: str, endpoint: str) -> str | None:
    """Extract the S3 object key from a full S3 URL.

    Handles:
      - https://endpoint/bucket/key
      - https://bucket.endpoint/key  (virtual-hosted style)
    """
    # Path-style: https://endpoint/bucket/key
    prefix_path = f"https://{endpoint}/{bucket}/"
    if s3_url.startswith(prefix_path):
        return s3_url[len(prefix_path):]

    # Virtual-hosted style: https://bucket.endpoint/key
    prefix_virtual = f"https://{bucket}.{endpoint}/"
    if s3_url.startswith(prefix_virtual):
        return s3_url[len(prefix_virtual):]

    return None


def generate_presigned_url(
    s3_url: str,
    expiry_seconds: int | None = None,
) -> str:
    """Generate a presigned GET URL for a private S3 object.

    Args:
        s3_url: The raw S3 URL stored in the database (public-style URL).
        expiry_seconds: TTL for the signed URL. Defaults to settings value.

    Returns:
        A time-limited presigned URL the browser can use directly.

    Raises:
        ValueError: If the URL cannot be mapped to a known bucket/key.
        ClientError: If boto3 fails to generate the presigned URL.
    """
    from platform_core.config import settings

    expiry = expiry_seconds if expiry_seconds is not None else settings.s3_presign_expiry_seconds
    key = _key_from_url(s3_url, settings.s3_bucket, settings.s3_endpoint)

    if key is None:
        raise ValueError(
            f"Cannot extract S3 key from URL: {s3_url!r}. "
            f"Expected prefix https://{settings.s3_endpoint}/{settings.s3_bucket}/"
        )

    try:
        client = _get_s3_client()
        presigned = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": key},
            ExpiresIn=expiry,
        )
        logger.debug("presigned_url_generated", key=key, expiry=expiry)
        return presigned
    except ClientError as exc:
        logger.error("presigned_url_error", key=key, error=str(exc))
        raise


# ── Presigned Upload URL ──────────────────────────────────────────


def generate_presigned_upload_url(
    s3_key: str,
    content_type: str = "application/pdf",
    expiry_seconds: int = 300,
) -> str:
    """Generate a presigned PUT URL so the client can upload directly to S3.

    Args:
        s3_key: The destination object key (e.g. "peticoes/tenant/pet/doc.pdf").
        content_type: MIME type for the upload.
        expiry_seconds: TTL for the signed URL (default 5 min).

    Returns:
        A time-limited presigned PUT URL.
    """
    from platform_core.config import settings

    client = _get_s3_client()
    presigned = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.s3_bucket,
            "Key": s3_key,
            "ContentType": content_type,
        },
        ExpiresIn=expiry_seconds,
    )
    logger.debug("presigned_upload_url", key=s3_key, expiry=expiry_seconds)
    return presigned


def generate_presigned_download_url(
    s3_key: str,
    expiry_seconds: int | None = None,
) -> str:
    """Generate a presigned GET URL from an S3 key (not a full URL)."""
    from platform_core.config import settings

    expiry = expiry_seconds if expiry_seconds is not None else settings.s3_presign_expiry_seconds
    client = _get_s3_client()
    presigned = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": s3_key},
        ExpiresIn=expiry,
    )
    logger.debug("presigned_download_url", key=s3_key, expiry=expiry)
    return presigned


# ── Server-side S3 operations ─────────────────────────────────────


def upload_bytes_to_s3(
    s3_key: str,
    data: bytes,
    content_type: str = "application/pdf",
) -> str:
    """Upload bytes directly to S3 (server-side). Returns the full S3 URL."""
    from platform_core.config import settings

    client = _get_s3_client()
    client.put_object(
        Bucket=settings.s3_bucket,
        Key=s3_key,
        Body=data,
        ContentType=content_type,
    )
    url = f"https://{settings.s3_endpoint}/{settings.s3_bucket}/{s3_key}"
    logger.info("upload_to_s3", key=s3_key, size=len(data))
    return url


def upload_bytes_to_bucket(
    bucket: str,
    s3_key: str,
    data: bytes,
    content_type: str = "application/pdf",
) -> str:
    """Upload bytes to a specific S3 bucket (server-side). Returns the full S3 URL."""
    from platform_core.config import settings

    client = _get_s3_client()
    client.put_object(
        Bucket=bucket,
        Key=s3_key,
        Body=data,
        ContentType=content_type,
    )
    url = f"https://{settings.s3_endpoint}/{bucket}/{s3_key}"
    logger.info("upload_to_bucket", bucket=bucket, key=s3_key, size=len(data))
    return url


def download_bytes_from_s3(s3_key: str) -> bytes:
    """Download an object from S3 and return its bytes."""
    from platform_core.config import settings

    client = _get_s3_client()
    resp = client.get_object(Bucket=settings.s3_bucket, Key=s3_key)
    data = resp["Body"].read()
    logger.debug("download_from_s3", key=s3_key, size=len(data))
    return data


def download_head_from_s3(s3_key: str, num_bytes: int = 1024) -> bytes:
    """Download only the first N bytes of an S3 object (for validation)."""
    from platform_core.config import settings

    client = _get_s3_client()
    resp = client.get_object(
        Bucket=settings.s3_bucket,
        Key=s3_key,
        Range=f"bytes=0-{num_bytes - 1}",
    )
    return resp["Body"].read()


def delete_s3_object(s3_key: str) -> None:
    """Delete an object from S3."""
    from platform_core.config import settings

    client = _get_s3_client()
    client.delete_object(Bucket=settings.s3_bucket, Key=s3_key)
    logger.info("delete_s3_object", key=s3_key)


def s3_object_exists(s3_key: str) -> bool:
    """Check if an S3 object exists."""
    from platform_core.config import settings

    client = _get_s3_client()
    try:
        client.head_object(Bucket=settings.s3_bucket, Key=s3_key)
        return True
    except ClientError:
        return False
