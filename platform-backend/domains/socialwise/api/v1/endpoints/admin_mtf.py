"""FastAPI admin routes for MTF Diamante variables and lotes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from domains.socialwise.api.v1.dependencies import AdminProxyContext, get_admin_proxy_context
from domains.socialwise.services.flow.admin_mtf_service import (
    MtfAdminServiceError,
    create_lote,
    delete_lote,
    get_lote_ativo,
    list_lotes,
    list_variables,
    save_variables,
    seed_variables,
    update_lote,
)
from platform_core.db.sessions import get_socialwise_session

router = APIRouter(
    prefix="/api/v1/socialwise/admin/mtf-diamante",
    tags=["socialwise-admin-mtf"],
)


class VariableItemRequest(BaseModel):
    chave: str
    valor: str


class SaveVariablesRequest(BaseModel):
    variaveis: list[VariableItemRequest]


class CreateLoteRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    numero: int
    nome: str = Field(min_length=1)
    valor: str = Field(min_length=1)
    data_inicio: str = Field(alias="dataInicio", min_length=1)
    data_fim: str = Field(alias="dataFim", min_length=1)


class UpdateLoteRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = None
    numero: int | None = None
    nome: str | None = None
    valor: str | None = None
    data_inicio: str | None = Field(default=None, alias="dataInicio")
    data_fim: str | None = Field(default=None, alias="dataFim")
    is_active: bool | None = Field(default=None, alias="isActive")


async def _parse_request_model(
    request: Request,
    model_type: type[BaseModel],
    invalid_message: str,
) -> tuple[BaseModel | None, JSONResponse | None]:
    try:
        payload = await request.json()
    except Exception:
        return None, JSONResponse({"success": False, "error": invalid_message}, status_code=400)

    try:
        return model_type.model_validate(payload), None
    except ValidationError as exc:
        return None, JSONResponse(
            {
                "success": False,
                "error": invalid_message,
                "details": exc.errors(),
            },
            status_code=400,
        )


def _service_error_response(exc: MtfAdminServiceError) -> JSONResponse:
    payload = {"success": False, "error": exc.message}
    if exc.payload:
        payload.update(exc.payload)
    return JSONResponse(payload, status_code=exc.status_code)


@router.get("/variaveis")
async def list_variables_route(
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        data = await list_variables(session, proxy.user_id)
        return {"success": True, "data": data}
    except MtfAdminServiceError as exc:
        return _service_error_response(exc)


@router.post("/variaveis")
async def save_variables_route(
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    parsed, error_response = await _parse_request_model(request, SaveVariablesRequest, "Dados inválidos")
    if error_response is not None:
        return error_response

    try:
        data = await save_variables(
            session,
            proxy.user_id,
            [item.model_dump() for item in parsed.variaveis],
        )
        return {"success": True, "data": data}
    except MtfAdminServiceError as exc:
        return _service_error_response(exc)


@router.post("/variaveis/seed")
async def seed_variables_route(
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        await seed_variables(session, proxy.user_id)
        return {"success": True, "message": "Seed automático executado com sucesso"}
    except MtfAdminServiceError as exc:
        return _service_error_response(exc)


@router.get("/lote-ativo")
async def active_lote_route(
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        return await get_lote_ativo(session, proxy.user_id)
    except MtfAdminServiceError as exc:
        return _service_error_response(exc)


@router.get("/lotes")
async def list_lotes_route(
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        data = await list_lotes(session, proxy.user_id)
        return {"success": True, "data": data}
    except MtfAdminServiceError as exc:
        return _service_error_response(exc)


@router.post("/lotes")
async def create_lote_route(
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    parsed, error_response = await _parse_request_model(request, CreateLoteRequest, "Dados inválidos")
    if error_response is not None:
        return error_response

    try:
        payload = parsed.model_dump(by_alias=False)
        data = await create_lote(
            session,
            proxy.user_id,
            numero=payload["numero"],
            nome=payload["nome"],
            valor=payload["valor"],
            data_inicio=payload["data_inicio"],
            data_fim=payload["data_fim"],
        )
        return {"success": True, "data": data, "message": "Lote criado com sucesso"}
    except MtfAdminServiceError as exc:
        return _service_error_response(exc)


@router.put("/lotes")
async def update_lote_legacy_route(
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    parsed, error_response = await _parse_request_model(request, UpdateLoteRequest, "Dados inválidos")
    if error_response is not None:
        return error_response
    if not parsed.id:
        return JSONResponse({"success": False, "error": "ID do lote é obrigatório"}, status_code=400)

    try:
        payload = parsed.model_dump(by_alias=False, exclude_none=True)
        data = await update_lote(
            session,
            proxy.user_id,
            parsed.id,
            numero=payload.get("numero"),
            nome=payload.get("nome"),
            valor=payload.get("valor"),
            data_inicio=payload.get("data_inicio"),
            data_fim=payload.get("data_fim"),
            is_active=payload.get("is_active"),
        )
        return {"success": True, "data": data, "message": "Lote atualizado com sucesso"}
    except MtfAdminServiceError as exc:
        return _service_error_response(exc)


@router.delete("/lotes")
async def delete_lote_legacy_route(
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
    id: str | None = Query(default=None),
):
    if not id:
        return JSONResponse({"success": False, "error": "ID do lote é obrigatório"}, status_code=400)

    try:
        await delete_lote(session, proxy.user_id, id)
        return {"success": True, "message": "Lote removido com sucesso"}
    except MtfAdminServiceError as exc:
        return _service_error_response(exc)


@router.patch("/lotes/{lote_id}")
async def patch_lote_route(
    lote_id: str,
    request: Request,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    parsed, error_response = await _parse_request_model(request, UpdateLoteRequest, "Dados inválidos")
    if error_response is not None:
        return error_response

    try:
        payload = parsed.model_dump(by_alias=False, exclude_none=True)
        data = await update_lote(
            session,
            proxy.user_id,
            lote_id,
            numero=payload.get("numero"),
            nome=payload.get("nome"),
            valor=payload.get("valor"),
            data_inicio=payload.get("data_inicio"),
            data_fim=payload.get("data_fim"),
            is_active=payload.get("is_active"),
        )
        return {"success": True, "data": data, "message": "Lote atualizado com sucesso"}
    except MtfAdminServiceError as exc:
        return _service_error_response(exc)


@router.delete("/lotes/{lote_id}")
async def delete_lote_route(
    lote_id: str,
    proxy: Annotated[AdminProxyContext, Depends(get_admin_proxy_context)],
    session: Annotated[AsyncSession, Depends(get_socialwise_session)],
):
    try:
        await delete_lote(session, proxy.user_id, lote_id)
        return {"success": True, "message": "Lote removido com sucesso"}
    except MtfAdminServiceError as exc:
        return _service_error_response(exc)
