"""Database models package.

All models must be imported here for Alembic autogenerate to work.
"""

from domains.jusmonitoria.db.models.ai_conversation import AIConversation
from domains.jusmonitoria.db.models.ai_provider import AIProvider
from domains.jusmonitoria.db.models.audit_log import AuditLog
from domains.jusmonitoria.db.models.automation import Automation
from domains.jusmonitoria.db.models.briefing import Briefing
from domains.jusmonitoria.db.models.case_movement import CaseMovement
from domains.jusmonitoria.db.models.client import Client, ClientStatus
from domains.jusmonitoria.db.models.client_automation import ClientAutomation
from domains.jusmonitoria.db.models.client_note import ClientNote
from domains.jusmonitoria.db.models.event import Event
from domains.jusmonitoria.db.models.lead import Lead, LeadSource, LeadStage, LeadStatus
from domains.jusmonitoria.db.models.legal_case import LegalCase
from domains.jusmonitoria.db.models.tag import ClientTag, LegalCaseTag, Tag
from domains.jusmonitoria.db.models.tenant import Tenant
from domains.jusmonitoria.db.models.timeline_embedding import TimelineEmbedding
from domains.jusmonitoria.db.models.timeline_event import TimelineEvent
from domains.jusmonitoria.db.models.user import User, UserRole
from domains.jusmonitoria.db.models.user_preference import UserPreference
from domains.jusmonitoria.db.models.notification import Notification
from domains.jusmonitoria.db.models.agent_execution_log import AgentExecutionLog
from domains.jusmonitoria.db.models.worker_schedule import WorkerSchedule
from domains.jusmonitoria.db.models.certificado_digital import CertificadoDigital
from domains.jusmonitoria.db.models.peticao import (
    DocumentoStatus,
    Peticao,
    PeticaoDocumento,
    PeticaoEvento,
    PeticaoStatus,
    TipoDocumento,
    TipoPeticao,
)
from domains.jusmonitoria.db.models.tpu import TpuClasse, TpuAssunto, TpuDocumento, PjeJurisdicao
from domains.jusmonitoria.db.models.processo_monitorado import ProcessoMonitorado
from domains.jusmonitoria.db.models.user_integration import UserIntegration, IntegrationType
from domains.jusmonitoria.db.models.caso_oab import CasoOAB
from domains.jusmonitoria.db.models.oab_sync_config import OABSyncConfig
from domains.jusmonitoria.db.models.user_oab import UserOAB
from domains.jusmonitoria.db.models.scrape_job import ScrapeJob
from domains.jusmonitoria.db.models.contrato import Contrato, TipoContrato, StatusContrato, IndiceReajuste
from domains.jusmonitoria.db.models.fatura import Fatura, StatusFatura, FormaPagamento
from domains.jusmonitoria.db.models.lancamento import Lancamento, TipoLancamento, CategoriaLancamento
from domains.jusmonitoria.db.models.cobranca import Cobranca, TipoCobranca, StatusCobranca, CanalCobranca
from domains.jusmonitoria.db.models.document_embedding import DocumentEmbedding, EmbeddingSourceType

__all__ = [
    "Tenant",
    "User",
    "UserRole",
    "UserPreference",
    "Lead",
    "LeadStatus",
    "LeadStage",
    "LeadSource",
    "Client",
    "ClientStatus",
    "ClientNote",
    "ClientAutomation",
    "LegalCase",
    "CaseMovement",
    "Tag",
    "ClientTag",
    "LegalCaseTag",
    "AIProvider",
    "AIConversation",
    "Briefing",
    "TimelineEvent",
    "TimelineEmbedding",
    "Event",
    "Automation",
    "AuditLog",
    "AgentExecutionLog",
    "WorkerSchedule",
    "CertificadoDigital",
    "Peticao",
    "PeticaoDocumento",
    "PeticaoEvento",
    "PeticaoStatus",
    "TipoPeticao",
    "TipoDocumento",
    "DocumentoStatus",
    "TpuClasse",
    "TpuAssunto",
    "PjeJurisdicao",
    "ProcessoMonitorado",
    "UserIntegration",
    "IntegrationType",
    "CasoOAB",
    "OABSyncConfig",
    "UserOAB",
    "ScrapeJob",
    "Contrato",
    "TipoContrato",
    "StatusContrato",
    "IndiceReajuste",
    "Fatura",
    "StatusFatura",
    "FormaPagamento",
    "Lancamento",
    "TipoLancamento",
    "CategoriaLancamento",
    "Cobranca",
    "TipoCobranca",
    "StatusCobranca",
    "CanalCobranca",
    "DocumentEmbedding",
    "EmbeddingSourceType",
]
