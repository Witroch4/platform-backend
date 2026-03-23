"""Socialwise browser auth endpoints for the direct FastAPI pattern."""

from __future__ import annotations

import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.auth.jwt import (
    build_cookie_payloads,
    build_logout_cookie_payloads,
    create_socialwise_access_token,
    get_socialwise_role_permissions,
)
from domains.socialwise.db.models.user import User
from platform_core.auth.dependencies import require_api_key
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/auth",
    tags=["socialwise-auth"],
)


class HandoffRequest(BaseModel):
    userId: str


def _apply_cookie_payloads(response: Response, cookies: list[dict[str, Any]]) -> None:
    for cookie in cookies:
        response.set_cookie(
            key=cookie["name"],
            value=cookie["value"],
            max_age=cookie["maxAge"],
            path=cookie["path"],
            secure=cookie["secure"],
            httponly=cookie["httpOnly"],
            samesite=cookie["sameSite"],
            domain=cookie.get("domain"),
        )


@router.post("/handoff")
async def post_auth_handoff(
    body: HandoffRequest,
    response: Response,
    _: Annotated[str, Depends(require_api_key)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    result = await session.execute(select(User).where(User.id == body.userId))
    user = result.scalar_one_or_none()
    if not user:
        return JSONResponse({"success": False, "error": "Usuário não encontrado."}, status_code=404)

    csrf_token = secrets.token_urlsafe(32)
    session_token, max_age = create_socialwise_access_token(
        user_id=user.id,
        role=user.role,
        csrf_token=csrf_token,
        permissions=get_socialwise_role_permissions(user.role),
    )
    cookies = build_cookie_payloads(
        session_token=session_token,
        csrf_token=csrf_token,
        max_age=max_age,
    )
    _apply_cookie_payloads(response, cookies)

    return {
        "success": True,
        "user": {
            "id": user.id,
            "role": user.role,
        },
        "cookies": cookies,
        "expiresIn": max_age,
    }


@router.post("/logout")
async def post_auth_logout(
    response: Response,
):
    cookies = build_logout_cookie_payloads()
    _apply_cookie_payloads(response, cookies)
    return {
        "success": True,
        "cookies": cookies,
    }
