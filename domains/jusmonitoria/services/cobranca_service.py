"""Business logic for billing reminders and collections via Chatwit."""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.db.models.cobranca import CanalCobranca, Cobranca, StatusCobranca, TipoCobranca
from domains.jusmonitoria.db.models.fatura import Fatura, StatusFatura
from domains.jusmonitoria.db.repositories.cobranca import CobrancaRepository
from domains.jusmonitoria.db.repositories.contrato import ContratoRepository
from domains.jusmonitoria.db.repositories.fatura import FaturaRepository

logger = logging.getLogger(__name__)


class CobrancaService:
    """Service for sending payment reminders via Chatwit."""

    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self.session = session
        self.tenant_id = tenant_id
        self.cobranca_repo = CobrancaRepository(session, tenant_id)
        self.contrato_repo = ContratoRepository(session, tenant_id)
        self.fatura_repo = FaturaRepository(session, tenant_id)

    async def agendar_cobrancas_contrato(self, contrato_id: UUID) -> list[Cobranca]:
        """Schedule reminders for all pending invoices of a contract.

        Uses the contract's configurable dias_lembrete_antes and dias_cobranca_apos.
        """
        contrato = await self.contrato_repo.get(contrato_id)
        if not contrato:
            return []

        faturas = await self.fatura_repo.list_by_contrato(contrato_id, limit=100)
        cobrancas_criadas = []

        for fatura in faturas:
            if fatura.status not in (StatusFatura.PENDENTE, StatusFatura.VENCIDA):
                continue

            today = date.today()

            # Pre-due reminder
            dias_antes = contrato.dias_lembrete_antes
            data_lembrete = fatura.data_vencimento - timedelta(days=dias_antes)
            if data_lembrete >= today:
                cobranca = await self._criar_cobranca(
                    contrato=contrato,
                    fatura=fatura,
                    tipo=TipoCobranca.LEMBRETE_VENCIMENTO,
                    data_agendada=datetime(
                        data_lembrete.year, data_lembrete.month, data_lembrete.day,
                        9, 0, 0, tzinfo=timezone.utc,
                    ),
                    mensagem=self._gerar_mensagem_lembrete(contrato, fatura, dias_antes),
                )
                cobrancas_criadas.append(cobranca)

            # Post-due collection notices (escalating)
            dias_apos_list = contrato.dias_cobranca_apos or [1, 7, 15]
            for dias_apos in dias_apos_list:
                data_cobranca = fatura.data_vencimento + timedelta(days=dias_apos)
                if data_cobranca >= today:
                    cobranca = await self._criar_cobranca(
                        contrato=contrato,
                        fatura=fatura,
                        tipo=TipoCobranca.COBRANCA_ATRASO,
                        data_agendada=datetime(
                            data_cobranca.year, data_cobranca.month, data_cobranca.day,
                            10, 0, 0, tzinfo=timezone.utc,
                        ),
                        mensagem=self._gerar_mensagem_cobranca(contrato, fatura, dias_apos),
                    )
                    cobrancas_criadas.append(cobranca)

        return cobrancas_criadas

    async def enviar_cobranca(self, cobranca_id: UUID) -> Cobranca | None:
        """Send a specific collection notice via Chatwit."""
        cobranca = await self.cobranca_repo.get(cobranca_id)
        if not cobranca:
            return None

        try:
            from domains.jusmonitoria.services.chatwit_client import ChatwitClient

            client = ChatwitClient()
            chatwit_contact_id = cobranca.client.chatwit_contact_id if cobranca.client else None

            if not chatwit_contact_id:
                logger.warning(
                    "cobranca_sem_chatwit_contact",
                    extra={"cobranca_id": str(cobranca_id), "client_id": str(cobranca.client_id)},
                )
                await self.cobranca_repo.update(
                    cobranca_id,
                    status=StatusCobranca.FALHOU,
                    erro="Cliente sem chatwit_contact_id",
                    tentativas=cobranca.tentativas + 1,
                )
                return await self.cobranca_repo.get(cobranca_id)

            result = await client.send_message(
                contact_id=chatwit_contact_id,
                message=cobranca.mensagem,
            )

            await self.cobranca_repo.update(
                cobranca_id,
                status=StatusCobranca.ENVIADO,
                data_envio=datetime.now(timezone.utc),
                chatwit_message_id=result.get("id"),
                tentativas=cobranca.tentativas + 1,
            )

            logger.info(
                "cobranca_enviada",
                extra={
                    "cobranca_id": str(cobranca_id),
                    "tipo": cobranca.tipo.value,
                    "canal": cobranca.canal.value,
                },
            )

        except Exception as e:
            logger.error(
                "cobranca_envio_falhou",
                extra={"cobranca_id": str(cobranca_id), "error": str(e)},
            )
            await self.cobranca_repo.update(
                cobranca_id,
                status=StatusCobranca.FALHOU if cobranca.tentativas >= 2 else StatusCobranca.PENDENTE,
                erro=str(e),
                tentativas=cobranca.tentativas + 1,
            )

        return await self.cobranca_repo.get(cobranca_id)

    async def processar_cobrancas_pendentes(self) -> int:
        """Process all pending collections ready to be sent. Returns count processed."""
        pendentes = await self.cobranca_repo.list_pending(limit=50)
        count = 0

        for cobranca in pendentes:
            await self.enviar_cobranca(cobranca.id)
            count += 1

        return count

    async def enviar_cobranca_fatura(self, fatura_id: UUID) -> Cobranca | None:
        """Create and immediately send a collection for a specific invoice."""
        fatura = await self.fatura_repo.get(fatura_id)
        if not fatura:
            return None

        contrato = await self.contrato_repo.get(fatura.contrato_id)
        if not contrato:
            return None

        today = date.today()
        if fatura.data_vencimento >= today:
            tipo = TipoCobranca.LEMBRETE_VENCIMENTO
            dias = (fatura.data_vencimento - today).days
            mensagem = self._gerar_mensagem_lembrete(contrato, fatura, dias)
        else:
            tipo = TipoCobranca.COBRANCA_ATRASO
            dias = (today - fatura.data_vencimento).days
            mensagem = self._gerar_mensagem_cobranca(contrato, fatura, dias)

        cobranca = await self._criar_cobranca(
            contrato=contrato,
            fatura=fatura,
            tipo=tipo,
            data_agendada=None,  # Send immediately
            mensagem=mensagem,
        )

        return await self.enviar_cobranca(cobranca.id)

    async def _criar_cobranca(
        self,
        contrato,
        fatura,
        tipo: TipoCobranca,
        data_agendada: Optional[datetime],
        mensagem: str,
    ) -> Cobranca:
        """Create a collection record."""
        return await self.cobranca_repo.create(
            contrato_id=contrato.id,
            fatura_id=fatura.id,
            client_id=fatura.client_id,
            tipo=tipo,
            canal=CanalCobranca.CHATWIT,
            status=StatusCobranca.PENDENTE,
            mensagem=mensagem,
            data_agendada=data_agendada,
        )

    def _gerar_mensagem_lembrete(self, contrato, fatura, dias: int) -> str:
        """Generate pre-due reminder message."""
        return (
            f"Olá! Lembramos que a fatura {fatura.numero} referente ao contrato "
            f"'{contrato.titulo}' no valor de R$ {float(fatura.valor):,.2f} "
            f"vence em {dias} dia(s) ({fatura.data_vencimento.strftime('%d/%m/%Y')}). "
            f"Agradecemos a pontualidade!"
        )

    def _gerar_mensagem_cobranca(self, contrato, fatura, dias_atraso: int) -> str:
        """Generate overdue collection message."""
        return (
            f"Olá! Identificamos que a fatura {fatura.numero} referente ao contrato "
            f"'{contrato.titulo}' no valor de R$ {float(fatura.valor):,.2f} "
            f"venceu em {fatura.data_vencimento.strftime('%d/%m/%Y')} "
            f"({dias_atraso} dia(s) de atraso). "
            f"Por favor, regularize o pagamento o mais breve possível. "
            f"Em caso de dúvidas, entre em contato conosco."
        )
