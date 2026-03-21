"""Petition business logic and state machine."""

import hashlib
import logging
import uuid as _uuid
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.peticao import (
    DocumentoStatus,
    Peticao,
    PeticaoDocumento,
    PeticaoStatus,
    TipoDocumento,
    TipoPeticao,
)
from domains.jusmonitoria.db.repositories.peticao import (
    PeticaoDocumentoRepository,
    PeticaoEventoRepository,
    PeticaoRepository,
)
from domains.jusmonitoria.schemas.peticao import PeticaoCreate

logger = logging.getLogger(__name__)


# Valid status transitions (directed acyclic graph with rejeitada→rascunho loop)
TRANSITIONS: dict[PeticaoStatus, set[PeticaoStatus]] = {
    PeticaoStatus.RASCUNHO: {PeticaoStatus.VALIDANDO},
    PeticaoStatus.VALIDANDO: {PeticaoStatus.ASSINANDO, PeticaoStatus.RASCUNHO},
    PeticaoStatus.ASSINANDO: {PeticaoStatus.PROTOCOLANDO, PeticaoStatus.VALIDANDO},
    PeticaoStatus.PROTOCOLANDO: {PeticaoStatus.PROTOCOLADA, PeticaoStatus.REJEITADA},
    PeticaoStatus.PROTOCOLADA: {PeticaoStatus.ACEITA, PeticaoStatus.REJEITADA},
    PeticaoStatus.ACEITA: set(),
    PeticaoStatus.REJEITADA: {PeticaoStatus.RASCUNHO},
}


class PeticaoService:
    """Petition business logic with status state machine."""

    async def create(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        criado_por: UUID,
        data: PeticaoCreate,
    ) -> Peticao:
        """Create a new petition in rascunho status with initial event."""
        # For petição inicial, use 20 zeros as per MNI 2.2.2
        # Default to OUTRO when saving a draft without tipo selected yet
        tipo_peticao = data.tipo_peticao or TipoPeticao.OUTRO
        processo_numero = data.processo_numero
        if tipo_peticao == TipoPeticao.PETICAO_INICIAL and not processo_numero:
            processo_numero = "00000000000000000000"

        # Serialize dados_basicos to JSON if provided
        # Use by_alias=True so camelCase keys are stored in JSONB (frontend-readable)
        dados_basicos_json = None
        if data.dados_basicos:
            dados_basicos_json = data.dados_basicos.model_dump(mode="json", by_alias=True)

        repo = PeticaoRepository(session, tenant_id)
        pet = await repo.create(
            processo_numero=processo_numero,
            tribunal_id=data.tribunal_id,
            tipo_peticao=tipo_peticao,
            assunto=data.assunto,
            descricao=data.descricao,
            certificado_id=data.certificado_id,
            criado_por=criado_por,
            status=PeticaoStatus.RASCUNHO,
            dados_basicos_json=dados_basicos_json,
            tipo_documento_pje=data.tipo_documento_pje,
            descricao_pje=data.descricao_pje,
        )
        await self._record_evento(
            session, tenant_id, pet.id,
            PeticaoStatus.RASCUNHO, "Petição criada como rascunho",
        )
        return pet

    def generate_upload_presign(
        self,
        tenant_id: UUID,
        peticao_id: UUID,
        nome_original: str,
    ) -> dict:
        """Generate a presigned PUT URL for direct client-to-S3 upload.

        Returns dict with s3_key and presigned upload_url.
        """
        from domains.jusmonitoria.services.storage import generate_presigned_upload_url

        file_id = _uuid.uuid4().hex
        # Sanitize filename for S3 key
        safe_name = nome_original.replace(" ", "_").replace("/", "_")
        s3_key = f"peticoes/{tenant_id}/{peticao_id}/{file_id}_{safe_name}"

        upload_url = generate_presigned_upload_url(s3_key)
        return {"s3_key": s3_key, "upload_url": upload_url}

    async def confirm_documento(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        peticao_id: UUID,
        s3_key: str,
        nome_original: str,
        tamanho_bytes: int,
        tipo_documento: TipoDocumento,
        ordem: int,
        sigiloso: bool = False,
    ) -> PeticaoDocumento:
        """Confirm a direct S3 upload: validate PDF header from S3, save metadata."""
        from domains.jusmonitoria.services.storage import (
            delete_s3_object,
            download_head_from_s3,
            s3_object_exists,
        )

        # Verify object exists on S3
        if not s3_object_exists(s3_key):
            raise ValueError("Arquivo não encontrado no S3. Faça o upload primeiro.")

        # Validate PDF header by reading first bytes
        head = download_head_from_s3(s3_key, num_bytes=16)
        if not head.startswith(b"%PDF"):
            delete_s3_object(s3_key)
            raise ValueError("Arquivo não é um PDF válido")

        # Compute SHA-256 from the head (full hash computed async if needed)
        # For now, use a placeholder — the full hash is computed by the worker
        # when it downloads the PDF for signing/filing
        hash_sha256 = hashlib.sha256(head).hexdigest()

        doc_repo = PeticaoDocumentoRepository(session, tenant_id)
        doc = await doc_repo.create(
            peticao_id=peticao_id,
            nome_original=nome_original,
            tamanho_bytes=tamanho_bytes,
            tipo_documento=tipo_documento,
            ordem=ordem,
            s3_key=s3_key,
            hash_sha256=hash_sha256,
            status=DocumentoStatus.UPLOADED,
            sigiloso=sigiloso,
        )
        return doc

    async def transition_status(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        peticao_id: UUID,
        new_status: PeticaoStatus,
        descricao: str,
        detalhes: str | None = None,
    ) -> Peticao:
        """Transition petition status with validation and event recording."""
        repo = PeticaoRepository(session, tenant_id)
        pet = await repo.get(peticao_id)

        if pet is None:
            raise ValueError("Petição não encontrada")

        valid_targets = TRANSITIONS.get(pet.status, set())
        if new_status not in valid_targets:
            raise ValueError(
                f"Transição inválida: {pet.status.value} → {new_status.value}. "
                f"Transições permitidas: {[s.value for s in valid_targets]}"
            )

        updated = await repo.update(peticao_id, status=new_status)
        await self._record_evento(
            session, tenant_id, peticao_id,
            new_status, descricao, detalhes,
        )
        return updated

    async def validate_for_filing(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        peticao_id: UUID,
    ) -> list[str]:
        """Return list of validation errors. Empty list = ready to file."""
        errors = []

        pet_repo = PeticaoRepository(session, tenant_id)
        pet = await pet_repo.get(peticao_id)
        if pet is None:
            return ["Petição não encontrada"]

        if pet.status != PeticaoStatus.RASCUNHO:
            errors.append(f"Petição deve estar em rascunho, está em: {pet.status.value}")

        # Check documents
        doc_repo = PeticaoDocumentoRepository(session, tenant_id)
        docs = await doc_repo.list_by_peticao(peticao_id)
        if not docs:
            errors.append("Nenhum documento anexado")

        has_principal = any(
            d.tipo_documento == TipoDocumento.PETICAO_PRINCIPAL for d in docs
        )
        if not has_principal:
            errors.append("Faltando documento do tipo 'Petição Principal'")

        # Check certificate
        if pet.certificado_id is None:
            errors.append("Nenhum certificado digital selecionado")
        else:
            from domains.jusmonitoria.db.repositories.certificado_digital import CertificadoDigitalRepository
            from datetime import datetime, timezone

            cert_repo = CertificadoDigitalRepository(session, tenant_id)
            cert = await cert_repo.get(pet.certificado_id)
            if cert is None or cert.revogado:
                errors.append("Certificado não encontrado ou revogado")
            elif cert.valido_ate < datetime.now(timezone.utc):
                errors.append("Certificado expirado")

        return errors

    async def _record_evento(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        peticao_id: UUID,
        status: PeticaoStatus,
        descricao: str,
        detalhes: str | None = None,
    ) -> None:
        """Record a status change event in the petition timeline."""
        evento_repo = PeticaoEventoRepository(session, tenant_id)
        await evento_repo.create(
            peticao_id=peticao_id,
            status=status,
            descricao=descricao,
            detalhes=detalhes,
        )
