"""User profile self-service endpoints."""

import logging
import os
import uuid as uuid_mod
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.auth.dependencies import CurrentUser
from domains.jusmonitoria.auth.password import hash_password, verify_password
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.user import User
from domains.jusmonitoria.db.models.user_preference import UserPreference
from domains.jusmonitoria.db.repositories.user_repository import UserRepository
from domains.jusmonitoria.schemas.profile import (
    AddOABRequest,
    ChangePasswordRequest,
    OABResponse,
    ProfileResponse,
    UpdateOABRequest,
    UpdatePreferencesRequest,
    UpdateProfileRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/profile", tags=["profile"])


def _build_profile_response(user: User) -> ProfileResponse:
    """Build a ProfileResponse from a User model instance."""
    oab_formatted = None
    if user.oab_number and user.oab_state:
        num = user.oab_number
        if len(num) > 3:
            num = f"{num[:-3]}.{num[-3:]}"
        oab_formatted = f"OAB/{user.oab_state} {num}"

    cpf_formatted = None
    if user.cpf:
        d = user.cpf
        if len(d) == 11:
            cpf_formatted = f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"

    return ProfileResponse(
        user_id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        tenant_id=str(user.tenant_id),
        phone=user.phone,
        avatar_url=user.avatar_url,
        oab_number=user.oab_number,
        oab_state=user.oab_state,
        oab_formatted=oab_formatted,
        cpf=user.cpf,
        cpf_formatted=cpf_formatted,
    )


@router.get("", response_model=ProfileResponse)
async def get_profile(user: CurrentUser) -> ProfileResponse:
    """Get current user's full profile."""
    return _build_profile_response(user)


@router.patch("", response_model=ProfileResponse)
async def update_profile(
    data: UpdateProfileRequest,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> ProfileResponse:
    """Update current user's profile fields."""
    user_repo = UserRepository(session, user.tenant_id)
    update_data = data.model_dump(exclude_none=True)

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum campo para atualizar",
        )

    updated = await user_repo.update(user.id, **update_data)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado",
        )

    # Auto-create OABSyncConfig e UserOAB quando o usuário define OAB pelo perfil (campo legado)
    oab_number = update_data.get("oab_number") or updated.oab_number
    oab_state = update_data.get("oab_state") or updated.oab_state
    if oab_number and oab_state:
        from domains.jusmonitoria.db.repositories.caso_oab import OABSyncConfigRepository
        from domains.jusmonitoria.db.repositories.user_oab import UserOABRepository

        sync_repo = OABSyncConfigRepository(session, user.tenant_id)
        await sync_repo.get_or_create(oab_number, oab_state, nome_advogado=updated.full_name)

        # Upsert em user_oabs para manter consistência
        oab_repo = UserOABRepository(session, user.tenant_id)
        existing_oab = await oab_repo.get_by_oab(user.id, oab_number, oab_state)
        if not existing_oab:
            has_primary = await oab_repo.get_primary(user.id)
            await oab_repo.create(
                user_id=user.id,
                oab_numero=oab_number,
                oab_uf=oab_state,
                is_primary=not has_primary,
                nome_advogado=updated.full_name,
                ativo=True,
            )

    await session.commit()
    return _build_profile_response(updated)


@router.post("/avatar", response_model=ProfileResponse)
async def upload_avatar(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
    file: UploadFile = File(...),
) -> ProfileResponse:
    """Upload a new avatar image. Accepts JPEG, PNG, WEBP. Max 2MB."""
    ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
    MAX_SIZE = 2 * 1024 * 1024  # 2MB

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de arquivo inválido. Use JPEG, PNG ou WEBP.",
        )

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo muito grande. Máximo 2MB.",
        )

    ext = file.content_type.split("/")[-1]
    if ext == "jpeg":
        ext = "jpg"
    filename = f"avatars/{user.id}_{uuid_mod.uuid4().hex[:8]}.{ext}"

    os.makedirs("static/avatars", exist_ok=True)
    filepath = f"static/{filename}"
    with open(filepath, "wb") as f:
        f.write(contents)

    avatar_url = f"/static/{filename}"
    user_repo = UserRepository(session, user.tenant_id)
    updated = await user_repo.update(user.id, avatar_url=avatar_url)
    await session.commit()

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado",
        )

    return _build_profile_response(updated)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    data: ChangePasswordRequest,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> None:
    """Change current user's password."""
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha atual incorreta",
        )

    new_hash = hash_password(data.new_password)
    user_repo = UserRepository(session, user.tenant_id)
    await user_repo.update(user.id, password_hash=new_hash)
    await session.commit()

    logger.info(
        "User changed password",
        extra={"user_id": str(user.id), "tenant_id": str(user.tenant_id)},
    )


NOTIFICATION_PREF_KEY = "notifications"

DEFAULT_NOTIFICATION_PREFS = {
    "movimentacoes": True,
    "prazos": True,
    "leads_novos": True,
    "atualizacoes_sistema": False,
}


@router.get("/preferences")
async def get_preferences(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> dict:
    """Get current user's notification preferences."""
    from sqlalchemy import select

    result = await session.execute(
        select(UserPreference).where(
            UserPreference.user_id == user.id,
            UserPreference.tenant_id == user.tenant_id,
            UserPreference.preference_key == NOTIFICATION_PREF_KEY,
        )
    )
    pref = result.scalar_one_or_none()

    if pref:
        return {**DEFAULT_NOTIFICATION_PREFS, **pref.preference_value}
    return DEFAULT_NOTIFICATION_PREFS


@router.patch("/preferences")
async def update_preferences(
    data: UpdatePreferencesRequest,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> dict:
    """Update current user's notification preferences."""
    from sqlalchemy import select

    result = await session.execute(
        select(UserPreference).where(
            UserPreference.user_id == user.id,
            UserPreference.tenant_id == user.tenant_id,
            UserPreference.preference_key == NOTIFICATION_PREF_KEY,
        )
    )
    pref = result.scalar_one_or_none()

    update_data = data.model_dump(exclude_none=True)

    if pref:
        merged = {**pref.preference_value, **update_data}
        pref.preference_value = merged
    else:
        merged = {**DEFAULT_NOTIFICATION_PREFS, **update_data}
        pref = UserPreference(
            tenant_id=user.tenant_id,
            user_id=user.id,
            preference_key=NOTIFICATION_PREF_KEY,
            preference_value=merged,
        )
        session.add(pref)

    await session.commit()

    logger.info(
        "Notification preferences updated",
        extra={"user_id": str(user.id), "tenant_id": str(user.tenant_id)},
    )

    return merged


# ─── Endpoints: Múltiplas OABs por Advogado ──────────────────────────────────


def _oab_to_response(oab) -> OABResponse:
    return OABResponse(
        id=str(oab.id),
        oab_numero=oab.oab_numero,
        oab_uf=oab.oab_uf,
        oab_formatted=oab.oab_formatted,
        is_primary=oab.is_primary,
        nome_advogado=oab.nome_advogado,
        ativo=oab.ativo,
        created_at=oab.created_at,
    )


@router.get("/oabs", response_model=list[OABResponse])
async def list_oabs(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> list[OABResponse]:
    """Lista todas as OABs do advogado logado."""
    from domains.jusmonitoria.db.repositories.user_oab import UserOABRepository

    repo = UserOABRepository(session, user.tenant_id)
    oabs = await repo.list_by_user(user.id)
    return [_oab_to_response(o) for o in oabs]


@router.post("/oabs", response_model=OABResponse, status_code=status.HTTP_201_CREATED)
async def add_oab(
    data: AddOABRequest,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> OABResponse:
    """Adiciona nova OAB ao advogado. Máx. 10 OABs por usuário."""
    from domains.jusmonitoria.db.repositories.user_oab import UserOABRepository
    from domains.jusmonitoria.db.repositories.caso_oab import OABSyncConfigRepository

    repo = UserOABRepository(session, user.tenant_id)

    # Verificar duplicata
    existing = await repo.get_by_oab(user.id, data.oab_numero, data.oab_uf)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"OAB/{data.oab_uf} {data.oab_numero} já cadastrada",
        )

    # Limite de OABs por usuário
    count = await repo.count_by_user(user.id)
    if count >= 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Limite máximo de 10 OABs por usuário atingido",
        )

    # Se is_primary, remover flag das outras
    if data.is_primary:
        await repo.clear_primary_flag(user.id)

    # Se for a primeira OAB do usuário, marcar como primária automaticamente
    if count == 0:
        data = data.model_copy(update={"is_primary": True})

    oab = await repo.create(
        user_id=user.id,
        oab_numero=data.oab_numero,
        oab_uf=data.oab_uf,
        is_primary=data.is_primary,
        nome_advogado=data.nome_advogado,
        ativo=True,
    )

    # Auto-criar OABSyncConfig para disparar scraping
    sync_repo = OABSyncConfigRepository(session, user.tenant_id)
    await sync_repo.get_or_create(
        data.oab_numero,
        data.oab_uf,
        nome_advogado=data.nome_advogado,
    )

    await session.commit()
    await session.refresh(oab)

    logger.info(
        "OAB adicionada",
        extra={
            "user_id": str(user.id),
            "oab": f"{data.oab_uf}{data.oab_numero}",
            "is_primary": data.is_primary,
        },
    )
    return _oab_to_response(oab)


@router.put("/oabs/{oab_id}", response_model=OABResponse)
async def update_oab(
    oab_id: str,
    data: UpdateOABRequest,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> OABResponse:
    """Atualiza dados de uma OAB (ex: marcar como primária, ativar/desativar)."""
    import uuid
    from domains.jusmonitoria.db.repositories.user_oab import UserOABRepository

    repo = UserOABRepository(session, user.tenant_id)

    try:
        oab_uuid = uuid.UUID(oab_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID inválido")

    oab = await repo.get(oab_uuid)
    if not oab or oab.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OAB não encontrada")

    update_data = data.model_dump(exclude_none=True)

    # Se marcar como primária, remover flag das outras primeiro
    if update_data.get("is_primary"):
        await repo.clear_primary_flag(user.id)

    updated = await repo.update(oab_uuid, **update_data)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OAB não encontrada")

    await session.commit()
    await session.refresh(updated)
    return _oab_to_response(updated)


@router.delete("/oabs/{oab_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_oab(
    oab_id: str,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_jusmonitoria_session)],
) -> None:
    """Remove uma OAB do advogado. Não é possível remover a última OAB."""
    import uuid
    from domains.jusmonitoria.db.repositories.user_oab import UserOABRepository

    repo = UserOABRepository(session, user.tenant_id)

    try:
        oab_uuid = uuid.UUID(oab_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID inválido")

    oab = await repo.get(oab_uuid)
    if not oab or oab.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OAB não encontrada")

    count = await repo.count_by_user(user.id)
    if count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível remover a única OAB cadastrada",
        )

    deleted = await repo.delete(oab_uuid)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OAB não encontrada")

    # Se removida era a primária, promover a mais antiga como nova primária
    if oab.is_primary:
        remaining = await repo.list_by_user(user.id)
        if remaining:
            await repo.update(remaining[0].id, is_primary=True)

    await session.commit()

    logger.info(
        "OAB removida",
        extra={"user_id": str(user.id), "oab_id": oab_id},
    )
