"""Storage presign endpoint — generate time-limited URLs for private MinIO objects."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from uuid import UUID

from domains.jusmonitoria.auth.dependencies import get_current_tenant_id, get_current_user
from domains.jusmonitoria.db.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/storage", tags=["storage"])


@router.get("/presign")
async def presign_url(
    url: str = Query(..., description="Raw S3 URL stored in the database"),
    redirect: bool = Query(True, description="If true, redirect (302) to presigned URL; otherwise return JSON"),
    _tenant_id: UUID = Depends(get_current_tenant_id),
    _current_user: User = Depends(get_current_user),
):
    """Generate a pre-signed download URL for a private MinIO/S3 object.

    Pass the raw `s3_url` from the database (e.g. the value stored in
    `caso_oab.documentos[*].s3_url`).  The backend signs it server-side with
    the MinIO credentials and either:

    - **redirect=true** (default): returns HTTP 302 → browser downloads the file.
    - **redirect=false**: returns `{"presigned_url": "..."}` JSON.
    """
    from domains.jusmonitoria.services.storage import generate_presigned_url

    try:
        presigned = generate_presigned_url(url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error("presign_endpoint_error url=%s error=%s", url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao gerar URL assinada para o documento.",
        )

    if redirect:
        return RedirectResponse(url=presigned, status_code=302)

    return {"presigned_url": presigned}
