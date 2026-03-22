"""Service for processing payment webhooks from Chatwit into the financial system."""

from datetime import date
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.client import Client
from domains.jusmonitoria.db.models.contrato import Contrato, StatusContrato
from domains.jusmonitoria.db.models.fatura import Fatura, FormaPagamento, StatusFatura
from domains.jusmonitoria.db.models.lancamento import CategoriaLancamento, Lancamento, TipoLancamento
from domains.jusmonitoria.db.models.lead import Lead, LeadSource, LeadStage, LeadStatus
from domains.jusmonitoria.db.repositories.fatura import FaturaRepository
from domains.jusmonitoria.db.repositories.lancamento import LancamentoRepository
from domains.jusmonitoria.db.repositories.lead import LeadRepository
from domains.jusmonitoria.schemas.payment_webhook import (
    ChatwitPaymentConfirmedPayload,
    ChatwitPaymentWebhookPayload,
)

logger = structlog.get_logger(__name__)

# Map Chatwit payment methods to our FormaPagamento enum
PAYMENT_METHOD_MAP = {
    "pix": FormaPagamento.PIX,
    "boleto": FormaPagamento.BOLETO,
    "cartao": FormaPagamento.CARTAO,
    "credit_card": FormaPagamento.CARTAO,
    "debit_card": FormaPagamento.CARTAO,
    "transferencia": FormaPagamento.TRANSFERENCIA,
    "transfer": FormaPagamento.TRANSFERENCIA,
    "dinheiro": FormaPagamento.DINHEIRO,
    "cash": FormaPagamento.DINHEIRO,
}


class PaymentWebhookService:
    """
    Processes payment webhooks from Chatwit and integrates with the financial system.

    Flow:
    1. Receive payment webhook from Chatwit
    2. Resolve client by chatwit_contact_id (from context) or payer info
    3. Resolve tenant from client
    4. Try to match existing pending fatura (invoice) by amount/client
    5. If matched: update fatura as paid
    6. If no match: create a lancamento (transaction) as revenue
    7. Emit events for the event bus
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def resolve_client_and_tenant(
        self,
        payload: ChatwitPaymentWebhookPayload,
    ) -> tuple[Optional[Client], Optional[UUID]]:
        """
        Resolve client and tenant from Chatwit payment context.

        Tries multiple strategies:
        1. context.client_id (internal ID passed by Chatwit)
        2. context.contact_id (chatwit_contact_id on Client or Lead)
        3. payer_document (CPF/CNPJ match)
        4. payer_email or payer_phone
        """
        # Strategy 1: Direct client ID from context
        if payload.context.client_id:
            try:
                client_uuid = UUID(payload.context.client_id)
                query = select(Client).where(Client.id == client_uuid)
                result = await self.session.execute(query)
                client = result.scalar_one_or_none()
                if client:
                    logger.info(
                        "payment_client_resolved_by_id",
                        client_id=str(client.id),
                        strategy="context.client_id",
                    )
                    return client, client.tenant_id
            except (ValueError, Exception):
                pass

        # Strategy 2: Chatwit contact_id
        contact_id = payload.context.contact_id
        if contact_id:
            # Check Client table
            query = select(Client).where(Client.chatwit_contact_id == contact_id)
            result = await self.session.execute(query)
            client = result.scalar_one_or_none()
            if client:
                logger.info(
                    "payment_client_resolved_by_contact",
                    client_id=str(client.id),
                    strategy="chatwit_contact_id",
                )
                return client, client.tenant_id

            # Check Lead table (lead may not be converted yet)
            query = select(Lead).where(Lead.chatwit_contact_id == contact_id)
            result = await self.session.execute(query)
            lead = result.scalar_one_or_none()
            if lead and lead.converted_to_client_id:
                query = select(Client).where(Client.id == lead.converted_to_client_id)
                result = await self.session.execute(query)
                client = result.scalar_one_or_none()
                if client:
                    logger.info(
                        "payment_client_resolved_via_lead",
                        client_id=str(client.id),
                        lead_id=str(lead.id),
                        strategy="lead.chatwit_contact_id",
                    )
                    return client, client.tenant_id

        # Strategy 3: CPF/CNPJ match
        if payload.payer_document:
            doc = payload.payer_document.replace(".", "").replace("-", "").replace("/", "")
            query = select(Client).where(Client.cpf_cnpj.isnot(None))
            result = await self.session.execute(query)
            clients = result.scalars().all()
            for c in clients:
                if c.cpf_cnpj:
                    clean = c.cpf_cnpj.replace(".", "").replace("-", "").replace("/", "")
                    if clean == doc:
                        logger.info(
                            "payment_client_resolved_by_document",
                            client_id=str(c.id),
                            strategy="payer_document",
                        )
                        return c, c.tenant_id

        # Strategy 4: Email or phone match
        if payload.payer_email:
            query = select(Client).where(Client.email == payload.payer_email)
            result = await self.session.execute(query)
            client = result.scalar_one_or_none()
            if client:
                logger.info(
                    "payment_client_resolved_by_email",
                    client_id=str(client.id),
                    strategy="payer_email",
                )
                return client, client.tenant_id

        if payload.payer_phone:
            query = select(Client).where(Client.phone == payload.payer_phone)
            result = await self.session.execute(query)
            client = result.scalar_one_or_none()
            if client:
                logger.info(
                    "payment_client_resolved_by_phone",
                    client_id=str(client.id),
                    strategy="payer_phone",
                )
                return client, client.tenant_id

        logger.warning(
            "payment_client_not_resolved",
            payment_id=payload.payment_id,
            contact_id=contact_id,
            payer_email=payload.payer_email,
        )
        return None, None

    async def find_matching_fatura(
        self,
        tenant_id: UUID,
        client_id: UUID,
        amount: Decimal,
        reference: Optional[str] = None,
    ) -> Optional[Fatura]:
        """
        Try to find a pending invoice that matches this payment.

        Matching strategies:
        1. By reference (invoice number) if provided
        2. By exact amount match on pending/overdue invoices for this client
        """
        # Strategy 1: Match by reference (invoice number)
        if reference:
            query = (
                select(Fatura)
                .where(Fatura.tenant_id == tenant_id)
                .where(Fatura.client_id == client_id)
                .where(Fatura.numero == reference)
                .where(Fatura.status.in_([StatusFatura.PENDENTE, StatusFatura.VENCIDA, StatusFatura.PARCIAL]))
            )
            result = await self.session.execute(query)
            fatura = result.scalar_one_or_none()
            if fatura:
                logger.info(
                    "payment_fatura_matched_by_reference",
                    fatura_id=str(fatura.id),
                    reference=reference,
                )
                return fatura

        # Strategy 2: Match by exact amount on pending invoices
        query = (
            select(Fatura)
            .where(Fatura.tenant_id == tenant_id)
            .where(Fatura.client_id == client_id)
            .where(Fatura.status.in_([StatusFatura.PENDENTE, StatusFatura.VENCIDA]))
            .where(Fatura.valor == amount)
            .order_by(Fatura.data_vencimento.asc())  # Oldest first
        )
        result = await self.session.execute(query)
        fatura = result.scalars().first()
        if fatura:
            logger.info(
                "payment_fatura_matched_by_amount",
                fatura_id=str(fatura.id),
                amount=str(amount),
            )
            return fatura

        return None

    async def process_payment(
        self,
        payload: ChatwitPaymentWebhookPayload,
    ) -> dict:
        """
        Main entry point: process a completed payment from Chatwit.

        Returns dict with processing results including fatura_id and lancamento_id.
        """
        # Step 1: Resolve client
        client, tenant_id = await self.resolve_client_and_tenant(payload)

        if not client or not tenant_id:
            logger.warning(
                "payment_processing_no_client",
                payment_id=payload.payment_id,
                amount=str(payload.amount),
            )
            # Still create a record as unmatched payment for manual reconciliation
            return {
                "status": "unmatched",
                "message": "Pagamento recebido mas cliente não identificado. Necessita reconciliação manual.",
                "payment_id": payload.payment_id,
                "fatura_id": None,
                "lancamento_id": None,
            }

        # Map payment method
        forma_pagamento = PAYMENT_METHOD_MAP.get(
            (payload.payment_method or "").lower(),
            FormaPagamento.PIX,  # Default to PIX
        )

        # Step 2: Try to match existing fatura
        fatura = await self.find_matching_fatura(
            tenant_id=tenant_id,
            client_id=client.id,
            amount=payload.amount,
            reference=payload.reference,
        )

        fatura_id = None
        lancamento_id = None

        if fatura:
            # Update existing fatura as paid
            fatura_repo = FaturaRepository(self.session, tenant_id)
            new_valor_pago = fatura.valor_pago + payload.amount

            update_data = {
                "valor_pago": new_valor_pago,
                "forma_pagamento": forma_pagamento,
                "data_pagamento": date.today(),
            }

            # Determine new status
            if new_valor_pago >= fatura.valor:
                update_data["status"] = StatusFatura.PAGA
            elif new_valor_pago > Decimal("0"):
                update_data["status"] = StatusFatura.PARCIAL

            # Add webhook reference to observacoes
            obs_parts = []
            if fatura.observacoes:
                obs_parts.append(fatura.observacoes)
            obs_parts.append(
                f"[Chatwit Webhook] Pagamento {payload.payment_id} "
                f"recebido em {date.today().isoformat()} - "
                f"R$ {payload.amount:.2f} via {forma_pagamento.value}"
            )
            update_data["observacoes"] = "\n".join(obs_parts)

            updated = await fatura_repo.update(fatura.id, **update_data)
            if updated:
                fatura_id = str(updated.id)

            logger.info(
                "payment_fatura_updated",
                fatura_id=str(fatura.id),
                new_status=update_data.get("status", fatura.status).value,
                valor_pago=str(new_valor_pago),
            )

        # Step 3: Create lancamento (transaction) for the payment
        lancamento_repo = LancamentoRepository(self.session, tenant_id)
        description = payload.description or f"Pagamento via Chatwit - {payload.payment_id}"
        if payload.payer_name:
            description = f"{description} ({payload.payer_name})"

        lancamento = await lancamento_repo.create(
            contrato_id=fatura.contrato_id if fatura else None,
            fatura_id=fatura.id if fatura else None,
            client_id=client.id,
            tipo=TipoLancamento.RECEITA,
            categoria=CategoriaLancamento.HONORARIOS,
            descricao=description,
            valor=payload.amount,
            data_lancamento=date.today(),
            data_competencia=date.today(),
            observacoes=(
                f"Pagamento recebido via webhook Chatwit.\n"
                f"Payment ID: {payload.payment_id}\n"
                f"Método: {forma_pagamento.value}\n"
                f"Chatwit User: {payload.user_id}"
            ),
        )
        lancamento_id = str(lancamento.id)

        logger.info(
            "payment_lancamento_created",
            lancamento_id=lancamento_id,
            client_id=str(client.id),
            amount=str(payload.amount),
        )

        await self.session.commit()

        status_msg = "matched" if fatura else "new_transaction"
        message = (
            f"Pagamento de R$ {payload.amount:.2f} registrado"
            + (f" e fatura {fatura.numero} atualizada" if fatura else " como novo lançamento de receita")
        )

        return {
            "status": status_msg,
            "message": message,
            "payment_id": payload.payment_id,
            "fatura_id": fatura_id,
            "lancamento_id": lancamento_id,
            "client_id": str(client.id),
            "tenant_id": str(tenant_id),
        }

    async def process_payment_confirmed(
        self,
        payload: ChatwitPaymentConfirmedPayload,
        tenant_id: UUID,
        metadata_dict: Optional[dict[str, Any]] = None,
    ) -> dict:
        """
        Process a payment.confirmed event from Chatwit (InfinitePay).

        This is the contract-aligned handler. Uses order_nsu for idempotency.
        Implements contact upsert fallback per contract section 9:
        - Search by chatwit_contact_id, identifier, phone, email
        - If not found, create Lead and sync identifier back to Chatwit
        """
        data = payload.data
        # amount_brl = valor que entra no bolso (sem juros/taxas)
        # paid_amount_brl = valor que o cliente pagou (com juros de parcelamento)
        amount = data.amount_brl
        order_nsu = data.order_nsu

        # Idempotency: check if lancamento with this order_nsu already exists
        existing = await self.session.execute(
            select(Lancamento).where(Lancamento.chatwit_order_nsu == order_nsu)
        )
        if existing.scalar_one_or_none():
            logger.info("payment_confirmed_duplicate", order_nsu=order_nsu)
            return {
                "status": "duplicate",
                "message": f"Pagamento {order_nsu} já processado anteriormente",
                "order_nsu": order_nsu,
            }

        contact_id = str(data.contact.id)
        contact_identifier = data.contact.identifier
        contact_email = data.contact.email
        contact_phone = data.contact.phone_number

        # ── Resolve client/lead with multi-strategy fallback ──
        client: Client | None = None
        lead: Lead | None = None

        # Strategy 1: chatwit_contact_id on Client
        query = select(Client).where(
            Client.tenant_id == tenant_id,
            Client.chatwit_contact_id == contact_id,
        )
        result = await self.session.execute(query)
        client = result.scalar_one_or_none()

        # Strategy 2: chatwit_contact_id on Lead → converted Client
        if not client:
            query = select(Lead).where(
                Lead.tenant_id == tenant_id,
                Lead.chatwit_contact_id == contact_id,
            )
            result = await self.session.execute(query)
            lead = result.scalar_one_or_none()
            if lead and lead.converted_to_client_id:
                query = select(Client).where(Client.id == lead.converted_to_client_id)
                result = await self.session.execute(query)
                client = result.scalar_one_or_none()

        # Strategy 3: identifier (jm_lead_*/jm_client_*) — extract UUID and lookup directly
        if not client and not lead and contact_identifier:
            if contact_identifier.startswith("jm_client_"):
                entity_uuid = contact_identifier[len("jm_client_"):]
                try:
                    query = select(Client).where(
                        Client.tenant_id == tenant_id,
                        Client.id == UUID(entity_uuid),
                    )
                    result = await self.session.execute(query)
                    client = result.scalar_one_or_none()
                except (ValueError, Exception):
                    pass
            elif contact_identifier.startswith("jm_lead_"):
                entity_uuid = contact_identifier[len("jm_lead_"):]
                try:
                    query = select(Lead).where(
                        Lead.tenant_id == tenant_id,
                        Lead.id == UUID(entity_uuid),
                    )
                    result = await self.session.execute(query)
                    lead = result.scalar_one_or_none()
                    if lead and lead.converted_to_client_id:
                        query = select(Client).where(Client.id == lead.converted_to_client_id)
                        result = await self.session.execute(query)
                        client = result.scalar_one_or_none()
                except (ValueError, Exception):
                    pass

        # Strategy 4: phone on Client
        if not client and contact_phone:
            query = select(Client).where(
                Client.tenant_id == tenant_id,
                Client.phone == contact_phone,
            )
            result = await self.session.execute(query)
            client = result.scalar_one_or_none()

        # Strategy 5: email on Client
        if not client and contact_email:
            query = select(Client).where(
                Client.tenant_id == tenant_id,
                Client.email == contact_email,
            )
            result = await self.session.execute(query)
            client = result.scalar_one_or_none()

        # Strategy 6: phone/email on Lead (not yet converted)
        if not client and not lead and contact_phone:
            query = select(Lead).where(
                Lead.tenant_id == tenant_id,
                Lead.phone == contact_phone,
            )
            result = await self.session.execute(query)
            lead = result.scalar_one_or_none()

        if not client and not lead and contact_email:
            query = select(Lead).where(
                Lead.tenant_id == tenant_id,
                Lead.email == contact_email,
            )
            result = await self.session.execute(query)
            lead = result.scalar_one_or_none()

        # ── Fallback: create Lead if nobody was found ──
        lead_created = False
        if not client and not lead:
            logger.info(
                "payment_confirmed_creating_lead",
                order_nsu=order_nsu,
                contact_id=contact_id,
                contact_name=data.contact.name,
            )
            lead_repo = LeadRepository(self.session, tenant_id)
            lead = await lead_repo.create(
                full_name=data.contact.name,
                email=contact_email,
                phone=contact_phone,
                source=LeadSource.CHATWIT,
                chatwit_contact_id=contact_id,
                stage=LeadStage.NEW,
                status=LeadStatus.ACTIVE,
                score=0,
                lead_metadata={
                    "created_from": "payment.confirmed",
                    "order_nsu": order_nsu,
                    "capture_method": data.capture_method,
                },
            )
            lead_created = True

        # Update existing lead's chatwit_contact_id if missing
        if lead and not lead.chatwit_contact_id:
            lead.chatwit_contact_id = contact_id

        # Sync identifier to Chatwit if we have metadata and a lead was created/linked
        if lead_created and metadata_dict:
            try:
                from domains.jusmonitoria.services.chatwit_client import sync_identifier_to_chatwit
                await sync_identifier_to_chatwit(
                    entity_id=str(lead.id),
                    chatwit_contact_id=contact_id,
                    metadata=metadata_dict,
                    entity_type="lead",
                )
            except Exception as e:
                logger.warning("payment_confirmed_sync_identifier_failed", error=str(e))

        # Log resolution strategy
        if client:
            logger.info("payment_confirmed_resolved_client", client_id=str(client.id))
        elif lead:
            logger.info(
                "payment_confirmed_resolved_lead",
                lead_id=str(lead.id),
                created=lead_created,
            )

        # Map capture method
        capture_map = {"pix": FormaPagamento.PIX, "credit_card": FormaPagamento.CARTAO}
        forma_pagamento = capture_map.get(data.capture_method or "", FormaPagamento.PIX)

        # Try to match fatura
        fatura: Fatura | None = None
        fatura_id: str | None = None

        if client:
            fatura = await self.find_matching_fatura(
                tenant_id=tenant_id,
                client_id=client.id,
                amount=amount,
            )

            if fatura:
                fatura_repo = FaturaRepository(self.session, tenant_id)
                new_valor_pago = fatura.valor_pago + amount
                update_data: dict = {
                    "valor_pago": new_valor_pago,
                    "forma_pagamento": forma_pagamento,
                    "data_pagamento": date.today(),
                }
                if new_valor_pago >= fatura.valor:
                    update_data["status"] = StatusFatura.PAGA
                elif new_valor_pago > Decimal("0"):
                    update_data["status"] = StatusFatura.PARCIAL

                obs_parts = []
                if fatura.observacoes:
                    obs_parts.append(fatura.observacoes)
                obs_parts.append(
                    f"[InfinitePay] NSU {order_nsu} - "
                    f"R$ {amount:.2f} via {forma_pagamento.value} em {date.today().isoformat()}"
                )
                update_data["observacoes"] = "\n".join(obs_parts)

                updated = await fatura_repo.update(fatura.id, **update_data)
                if updated:
                    fatura_id = str(updated.id)

        # Create lancamento
        lancamento_repo = LancamentoRepository(self.session, tenant_id)

        description = f"Pagamento InfinitePay - {data.contact.name}"
        lancamento = await lancamento_repo.create(
            contrato_id=fatura.contrato_id if fatura else None,
            fatura_id=fatura.id if fatura else None,
            client_id=client.id if client else None,
            tipo=TipoLancamento.RECEITA,
            categoria=CategoriaLancamento.HONORARIOS,
            descricao=description,
            valor=amount,
            data_lancamento=date.today(),
            data_competencia=date.today(),
            chatwit_order_nsu=order_nsu,
            receipt_url=data.receipt_url,
            observacoes=(
                f"Pagamento confirmado via InfinitePay/Chatwit.\n"
                f"NSU: {order_nsu}\n"
                f"Método: {data.capture_method}\n"
                f"Contato: {data.contact.name} ({data.contact.phone_number})\n"
                f"Recibo: {data.receipt_url}"
            ),
        )

        await self.session.commit()

        logger.info(
            "payment_confirmed_processed",
            order_nsu=order_nsu,
            amount=str(amount),
            lancamento_id=str(lancamento.id),
            client_id=str(client.id) if client else None,
            lead_id=str(lead.id) if lead else None,
            fatura_id=fatura_id,
            lead_created=lead_created,
        )

        status_msg = "matched" if fatura else ("new_transaction" if client else ("lead_created" if lead_created else "lead_linked"))
        lead_info = {"lead_id": str(lead.id), "lead_created": lead_created} if lead and not client else {}
        return {
            "status": status_msg,
            "message": f"Pagamento de R$ {amount:.2f} registrado (NSU: {order_nsu})",
            "order_nsu": order_nsu,
            "fatura_id": fatura_id,
            "lancamento_id": str(lancamento.id),
            "client_id": str(client.id) if client else None,
            "tenant_id": str(tenant_id),
            **lead_info,
        }
