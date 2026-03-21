"""Pydantic schemas for Process Consultation API (MNI 2.2.2).

Response schemas parse the raw zeep dict returned by consultarProcesso
into structured, frontend-friendly objects with camelCase aliases.
"""

from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


# --- Request ---


class ConsultarProcessoRequest(BaseModel):
    """POST /processos/consultar request body."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    numero_processo: str = Field(..., min_length=1, max_length=50)
    tribunal_id: str = Field(..., min_length=1, max_length=20)
    certificado_id: UUID


# --- Response sub-schemas ---


class ProcessoAdvogado(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    nome: str = ""
    inscricao: Optional[str] = None  # OAB number
    cpf: Optional[str] = None
    tipo_representante: Optional[str] = None  # A=Advogado, etc.


class ProcessoParte(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    nome: str = ""
    documento: Optional[str] = None  # CPF or CNPJ
    tipo_pessoa: Optional[str] = None  # fisica | juridica | autoridade
    sexo: Optional[str] = None
    advogados: list[ProcessoAdvogado] = []


class ProcessoPolo(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    polo: str  # AT, PA, TC, FL, etc.
    polo_label: str = ""  # "Ativo", "Passivo", etc.
    partes: list[ProcessoParte] = []


class ProcessoAssunto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    codigo_nacional: Optional[int] = None
    codigo_local: Optional[int] = None
    descricao: Optional[str] = None
    principal: bool = False


class ProcessoOrgaoJulgador(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    codigo_orgao: Optional[str] = None
    nome_orgao: Optional[str] = None
    codigo_municipio_ibge: Optional[int] = None
    instancia: Optional[str] = None


class ProcessoMovimento(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    data_hora: Optional[str] = None
    codigo_nacional: Optional[int] = None
    descricao: Optional[str] = None
    complementos: list[str] = []


class ProcessoDocumentoInfo(BaseModel):
    """Metadata only — no content (base64) transferred."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id_documento: Optional[str] = None
    tipo_documento: Optional[str] = None
    descricao: Optional[str] = None
    mimetype: Optional[str] = None
    data_hora: Optional[str] = None
    nivel_sigilo: Optional[int] = None


class ProcessoCabecalho(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    numero: Optional[str] = None
    classe_processual: Optional[int] = None
    classe_processual_descricao: Optional[str] = None
    codigo_localidade: Optional[str] = None
    competencia: Optional[int] = None
    nivel_sigilo: int = 0
    data_ajuizamento: Optional[str] = None
    valor_causa: Optional[float] = None


# --- Main response ---


class ProcessoConsultaResponse(BaseModel):
    """Full response from MNI consultarProcesso, parsed into structured fields."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    sucesso: bool
    mensagem: str = ""
    cabecalho: Optional[ProcessoCabecalho] = None
    polos: list[ProcessoPolo] = []
    assuntos: list[ProcessoAssunto] = []
    orgao_julgador: Optional[ProcessoOrgaoJulgador] = None
    movimentos: list[ProcessoMovimento] = []
    documentos: list[ProcessoDocumentoInfo] = []
    raw: Optional[dict] = None  # Full zeep serialized dict for debug/audit


# --- OAB Finder (web scraping) ---


class ConsultarOABRequest(BaseModel):
    """POST /processos/consultar-oab request body."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    oab_numero: str = Field(..., min_length=1, max_length=20)
    oab_uf: str = Field(..., min_length=2, max_length=2)


class OABDocumentoAnexo(BaseModel):
    """Document/attachment downloaded from tribunal and uploaded to S3."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    nome: str
    tipo: Optional[str] = None
    s3_url: str
    tamanho_bytes: Optional[int] = None


class OABProcessoResumo(BaseModel):
    """Summary of a process found via OAB public consultation scraping."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    numero: str
    classe: Optional[str] = None
    assunto: Optional[str] = None
    partes: Optional[str] = None
    ultima_movimentacao: Optional[str] = None
    data_ultima_movimentacao: Optional[str] = None
    partes_detalhadas: Optional[list[dict]] = None
    movimentacoes: Optional[list[dict]] = None
    documentos: list[OABDocumentoAnexo] = []


class ConsultarOABResponse(BaseModel):
    """Response from OAB Finder scraping."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    sucesso: bool
    mensagem: str = ""
    processos: list[OABProcessoResumo] = []
    total: int = 0
