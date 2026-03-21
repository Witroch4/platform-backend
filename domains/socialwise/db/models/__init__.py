"""Socialwise database models — SQLAlchemy mirrors of Prisma tables.

Prisma is the schema authority. These models are read/write mirrors.
NO Alembic, NO migrations from this side.

All models must be imported here so SQLAlchemy metadata is populated.
"""

from domains.socialwise.db.models.account import Account
from domains.socialwise.db.models.ai_agent_blueprint import AiAgentBlueprint
from domains.socialwise.db.models.chatwit_inbox import ChatwitInbox
from domains.socialwise.db.models.ai_assistant import AiAssistant
from domains.socialwise.db.models.arquivo_lead_oab import ArquivoLeadOab
from domains.socialwise.db.models.audit_log import AuditLog
from domains.socialwise.db.models.agendamento import Agendamento
from domains.socialwise.db.models.automacao import Automacao
from domains.socialwise.db.models.cost_budget import CostBudget
from domains.socialwise.db.models.chat import Chat
from domains.socialwise.db.models.cost_event import (
    CostEvent,
    EventStatus,
    Provider,
    Unit,
)
from domains.socialwise.db.models.espelho_padrao import (
    EspecialidadeJuridica,
    EspelhoPadrao,
)
from domains.socialwise.db.models.fx_rate import FxRate
from domains.socialwise.db.models.flow import Flow, FlowEdge, FlowNode
from domains.socialwise.db.models.flow_campaign import (
    FlowCampaign,
    FlowCampaignContact,
    FlowCampaignContactStatus,
    FlowCampaignStatus,
)
from domains.socialwise.db.models.flow_session import FlowSession, FlowSessionStatus
from domains.socialwise.db.models.lead import Lead, LeadSource
from domains.socialwise.db.models.lead_automacao import LeadAutomacao
from domains.socialwise.db.models.lead_instagram_profile import LeadInstagramProfile
from domains.socialwise.db.models.lead_oab_data import LeadOabData
from domains.socialwise.db.models.mapeamento_botao import ActionType, MapeamentoBotao
from domains.socialwise.db.models.midia import Midia
from domains.socialwise.db.models.mapeamento_intencao import MapeamentoIntencao
from domains.socialwise.db.models.mtf_diamante import (
    MtfDiamanteConfig,
    MtfDiamanteVariavel,
)
from domains.socialwise.db.models.price_card import PriceCard
from domains.socialwise.db.models.system_config import SystemConfig
from domains.socialwise.db.models.template import (
    Template,
    TemplateScope,
    TemplateStatus,
    TemplateType,
)
from domains.socialwise.db.models.user import User
from domains.socialwise.db.models.usuario_chatwit import UsuarioChatwit
from domains.socialwise.db.models.webhook_config import WebhookConfig
from domains.socialwise.db.models.webhook_delivery import WebhookDelivery, WebhookEvent

__all__ = [
    # AI Blueprints/Assistants
    "AiAgentBlueprint",
    "AiAssistant",
    # Chatwit
    "ChatwitInbox",
    # Core auth/social
    "User",
    "Account",
    "Chat",
    "ArquivoLeadOab",
    # Lead
    "Lead",
    "LeadSource",
    "LeadInstagramProfile",
    "LeadAutomacao",
    "LeadOabData",
    # Espelho
    "EspelhoPadrao",
    "EspecialidadeJuridica",
    # Mapeamentos
    "MapeamentoBotao",
    "ActionType",
    "MapeamentoIntencao",
    # Flow
    "Flow",
    "FlowNode",
    "FlowEdge",
    "FlowSession",
    "FlowSessionStatus",
    "FlowCampaign",
    "FlowCampaignContact",
    "FlowCampaignStatus",
    "FlowCampaignContactStatus",
    # Agendamento
    "Agendamento",
    "Midia",
    # Instagram automations
    "Automacao",
    # Chatwit
    "UsuarioChatwit",
    "SystemConfig",
    # Template
    "Template",
    "TemplateType",
    "TemplateScope",
    "TemplateStatus",
    # Cost
    "CostEvent",
    "CostBudget",
    "PriceCard",
    "FxRate",
    "AuditLog",
    "Provider",
    "Unit",
    "EventStatus",
    # MTF Diamante
    "MtfDiamanteConfig",
    "MtfDiamanteVariavel",
    # Queue management
    "WebhookConfig",
    "WebhookDelivery",
    "WebhookEvent",
]
