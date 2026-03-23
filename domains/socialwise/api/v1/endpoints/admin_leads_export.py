"""FastAPI admin routes for the Leads Export group (B.7.5d).

Port of:
- app/api/admin/leads-chatwit/export-csv/route.ts (GET)
- app/api/admin/leads-chatwit/export-docx/route.ts (POST)
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.api.v1.dependencies import AdminProxyContext, get_admin_proxy_context
from domains.socialwise.services.leads.admin_leads_export_service import (
    ExportServiceError,
    export_csv,
    export_html_to_docx,
)
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/admin/leads-chatwit",
    tags=["socialwise-admin-leads-export"],
)


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class ExportDocxRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    html: str
    leadId: str


# ---------------------------------------------------------------------------
# /export-csv
# ---------------------------------------------------------------------------


@router.get("/export-csv")
async def get_export_csv(
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    search: str | None = None,
):
    try:
        csv_content = await export_csv(
            session,
            user_id=ctx.user_id,
            user_role=ctx.role,
            search_term=search,
        )
        today = date.today().isoformat()
        return Response(
            content=csv_content.encode("utf-8"),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="leads-chatwit-{today}.csv"',
            },
        )
    except ExportServiceError as e:
        return Response(
            content=str(e),
            status_code=404,
            media_type="text/plain; charset=utf-8",
        )
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# /export-docx
# ---------------------------------------------------------------------------


@router.post("/export-docx")
async def post_export_docx(
    body: ExportDocxRequest,
    ctx: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        docx_bytes = export_html_to_docx(body.html, body.leadId)
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f'attachment; filename="recurso_{body.leadId}.docx"',
            },
        )
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
