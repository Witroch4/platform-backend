"""Schemas for TPU (Tabelas Processuais Unificadas) classes and subjects."""

from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class TpuBase(BaseModel):
    """Base schema for TPU items."""
    
    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )
    
    codigo: int = Field(description="Código do item no CNJ")
    nome: str = Field(description="Nome ou descrição do item")
    cod_item_pai: Optional[int] = Field(None, description="Código do item pai na hierarquia")
    glossario: Optional[str] = Field(None, description="Glossário ou explicação complementar")


class TpuClasseResponse(TpuBase):
    """Schema for returning a TPU Classe."""
    
    sigla: Optional[str] = None
    natureza: Optional[str] = None
    polo_ativo: Optional[str] = None
    polo_passivo: Optional[str] = None


class TpuAssuntoResponse(TpuBase):
    """Schema for returning a TPU Assunto."""

    artigo: Optional[str] = None
    hierarquia: Optional[str] = Field(None, description="Caminho hierárquico completo do assunto")
