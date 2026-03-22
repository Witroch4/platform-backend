"""Repository modules for data access with tenant isolation."""

from domains.jusmonitoria.db.repositories.base import BaseRepository
from domains.jusmonitoria.db.repositories.case_movement import CaseMovementRepository
from domains.jusmonitoria.db.repositories.client import ClientRepository
from domains.jusmonitoria.db.repositories.client_automation import ClientAutomationRepository
from domains.jusmonitoria.db.repositories.client_note import ClientNoteRepository
from domains.jusmonitoria.db.repositories.lead import LeadRepository
from domains.jusmonitoria.db.repositories.legal_case import LegalCaseRepository
from domains.jusmonitoria.db.repositories.tenant import TenantRepository
from domains.jusmonitoria.db.repositories.user import UserRepository

__all__ = [
    "BaseRepository",
    "TenantRepository",
    "UserRepository",
    "LeadRepository",
    "ClientRepository",
    "ClientNoteRepository",
    "ClientAutomationRepository",
    "LegalCaseRepository",
    "CaseMovementRepository",
]
