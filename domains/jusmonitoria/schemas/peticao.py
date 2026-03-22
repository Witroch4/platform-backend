"""Pydantic schemas for Petition API.

All response schemas use alias_generator=to_camel for frontend compatibility
with TypeScript types in frontend/types/peticoes.ts.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field
from pydantic.alias_generators import to_camel

from domains.jusmonitoria.db.models.peticao import (
    DocumentoStatus,
    PeticaoStatus,
    TipoDocumento,
    TipoPeticao,
)


# --- MNI 2.2.2 sub-schemas (DadosBasicos) ---


class Pessoa(BaseModel):
    """tipoPessoa do XSD MNI 2.2.2."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    nome: str
    tipo_pessoa: str = "fisica"  # fisica | juridica | autoridade | orgaorepresentacao
    tipo_vinculacao: Optional[str] = None  # ex: IMPETRANTE, RÉU, TERCEIRO INTERESSADO
    orgao_publico: bool = False  # órgão público?
    cpf: Optional[str] = None  # 11 dígitos (pessoa física)
    sem_cpf: bool = False  # não possui CPF
    cnpj: Optional[str] = None  # 14 dígitos (pessoa jurídica)
    sem_cnpj: bool = False  # não possui CNPJ
    nome_fantasia: Optional[str] = None  # nome fantasia (pessoa jurídica)
    sexo: str = "D"  # M | F | D (desconhecido)
    data_nascimento: Optional[str] = None  # AAAAMMDD
    nome_genitor: Optional[str] = None
    nome_genitora: Optional[str] = None
    nacionalidade: str = "BR"


class Advogado(BaseModel):
    """tipoRepresentanteProcessual do XSD MNI 2.2.2."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    nome: str
    inscricao_oab: Optional[str] = None  # Formato: CCDDDDDDDC (ex: CE12345)
    cpf: Optional[str] = None  # 11 dígitos
    tipo_representante: str = "A"  # A=Advogado, E=Escritório, M=MP, D=Defensoria, P=Advocacia Pública
    intimacao: bool = True


class Polo(BaseModel):
    """tipoPoloProcessual do XSD MNI 2.2.2."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    polo: str  # AT=Ativo, PA=Passivo, TC=Terceiro, FL=Fiscal, TJ=Testemunha, AD=Amicus Curiae
    partes: list[Pessoa] = []
    advogados: list[Advogado] = []


class OrgaoJulgador(BaseModel):
    """tipoOrgaoJulgador do XSD MNI 2.2.2."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    codigo_orgao: str
    nome_orgao: str
    codigo_municipio_ibge: int
    instancia: str = "ORIG"  # ORIG | REV | ESP | EXT | ADM


class AssuntoProcessual(BaseModel):
    """tipoAssuntoProcessual do XSD MNI 2.2.2."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    codigo_nacional: int  # Código TPU/CNJ (ex: 10170)
    nome: Optional[str] = None  # Nome legível do assunto (ex: 'Exame da Ordem OAB')
    principal: bool = False


class DadosBasicos(BaseModel):
    """tipoCabecalhoProcesso do XSD MNI 2.2.2 — estrutura completa."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    polos: list[Polo] = []
    orgao_julgador: Optional[OrgaoJulgador] = None
    assuntos: list[AssuntoProcessual] = []
    classe_processual: Optional[int] = None  # Código TPU/CNJ (ex: 120)
    classe_processual_nome: Optional[str] = None  # Nome legível da classe (ex: 'MANDADO DE SEGURANÇA CÍVEL')
    classe_processual_pje: Optional[str] = None  # Value interno do select PJe para a classe
    materia_codigo: Optional[int] = None  # Código TPU/CNJ da matéria (ex: 10170)
    materia_nome: Optional[str] = None  # Nome legível da matéria
    codigo_localidade: Optional[str] = None
    competencia: int = 0
    competencia_nome: Optional[str] = None  # Label legível da competência escolhida no PJe
    competencia_pje_value: Optional[str] = None  # Value interno do select PJe para a competência
    nivel_sigilo: int = 0
    valor_causa: Optional[float] = None
    prioridade: list[str] = []  # PJe values: IDOSO, DOENCA_GRAVE, ECA, MARIA_DA_PENHA, etc.
    justica_gratuita: bool = False
    pedido_liminar: bool = False
    juizo_digital: bool = False  # PJe: radio separado (NÃO é prioridade)


class ConsultarProcessoRequest(BaseModel):
    """POST /peticoes/consultar-processo request body."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    numero_processo: str = Field(..., min_length=1, max_length=50)
    tribunal_id: str = Field(..., min_length=1, max_length=20)
    certificado_id: UUID


# --- Request schemas ---


class PeticaoCreate(BaseModel):
    """POST /peticoes request body."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    processo_numero: str = Field("", max_length=50)
    tribunal_id: str = Field(..., min_length=1, max_length=20)
    # Optional on drafts — defaults to OUTRO; protocol validation enforces a real type
    tipo_peticao: Optional[TipoPeticao] = None
    assunto: str = Field("", max_length=500)
    descricao: Optional[str] = None
    certificado_id: Optional[UUID] = None
    dados_basicos: Optional[DadosBasicos] = None
    # Label exato do select PJe (ex: 'Petição intercorrente') — usado pelo scraper Playwright
    tipo_documento_pje: Optional[str] = Field(None, max_length=200)
    descricao_pje: Optional[str] = Field(None, max_length=500)


class PeticaoUpdate(BaseModel):
    """PATCH /peticoes/{id} request body. Only allowed on status=rascunho."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    assunto: Optional[str] = Field(None, max_length=500)
    descricao: Optional[str] = None
    certificado_id: Optional[UUID] = None
    tribunal_id: Optional[str] = Field(None, max_length=20)
    processo_numero: Optional[str] = Field(None, max_length=50)
    tipo_peticao: Optional[TipoPeticao] = None
    dados_basicos: Optional[DadosBasicos] = None
    tipo_documento_pje: Optional[str] = Field(None, max_length=200)
    descricao_pje: Optional[str] = Field(None, max_length=500)


# --- Response schemas ---


class PeticaoDocumentoResponse(BaseModel):
    """Response for a single petition document."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    nome_original: str
    tamanho_bytes: int
    tipo_documento: TipoDocumento
    ordem: int
    sigiloso: bool = False
    uploaded_at: datetime = Field(validation_alias="created_at")
    status: DocumentoStatus
    erro_validacao: Optional[str] = None


class PeticaoEventoResponse(BaseModel):
    """Response for a petition status event."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    peticao_id: UUID
    status: PeticaoStatus
    descricao: str
    detalhes: Optional[str] = None
    criado_em: datetime = Field(validation_alias="created_at")


class PeticaoResponse(BaseModel):
    """Full petition response matching TypeScript Peticao interface."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    tenant_id: UUID
    numero_protocolo: Optional[str] = None
    processo_numero: str
    tribunal_id: str
    tipo_peticao: TipoPeticao
    assunto: str
    descricao: Optional[str] = None
    tipo_documento_pje: Optional[str] = None
    descricao_pje: Optional[str] = None
    status: PeticaoStatus
    documentos: list[PeticaoDocumentoResponse] = []
    certificado_id: Optional[UUID] = None
    dados_basicos: Optional[DadosBasicos] = Field(None, validation_alias="dados_basicos_json")
    analise_ia: Optional[dict] = None
    protocolado_em: Optional[datetime] = None
    protocolo_recibo: Optional[str] = None
    motivo_rejeicao: Optional[str] = None
    criado_por: Optional[UUID] = None
    criado_em: datetime = Field(validation_alias="created_at")
    atualizado_em: datetime = Field(validation_alias="updated_at")


class PeticaoListItemResponse(BaseModel):
    """Lightweight list item matching TypeScript PeticaoListItem."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    numero_protocolo: Optional[str] = None
    processo_numero: str
    tribunal_id: str
    tipo_peticao: TipoPeticao
    assunto: str
    status: PeticaoStatus
    protocolado_em: Optional[datetime] = None
    criado_em: datetime = Field(validation_alias="created_at")

    # Computed from selectin-loaded documentos relationship
    quantidade_documentos: int = 0


class PeticaoListResponse(BaseModel):
    """Paginated petition list response."""

    items: list[PeticaoListItemResponse]
    total: int
