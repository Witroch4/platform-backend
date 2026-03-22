"""Static tribunal registry endpoint mirroring frontend/lib/data/tribunais.ts."""

import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.data.tipos_documento_pje import TRIBUNAL_ID_TO_CODE
from platform_core.db.sessions import get_jusmonitoria_session
from domains.jusmonitoria.db.models.tpu import PjeJurisdicao

router = APIRouter(prefix="/tribunais", tags=["tribunais"])


class JurisdicaoSugestao(BaseModel):
    codigo: str
    nome: str


class ClassePjeSugestao(BaseModel):
    codigo: str
    nome: str
    codigo_tpu: int | None = None
    total_competencias: int = 0


class CompetenciaPjeSugestao(BaseModel):
    codigo: str
    nome: str


def _extract_tpu_code(class_text: str | None) -> int | None:
    if not class_text:
        return None
    match = re.search(r"\((\d+)\)\s*$", class_text)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


# Static registry of supported courts — mirrors frontend/lib/data/tribunais.ts
TRIBUNAIS = [
    {
        "id": "TJCE-1G",
        "nome": "TJCE 1º Grau",
        "nomeCompleto": "Tribunal de Justiça do Ceará — 1º Grau",
        "instancia": "1º Grau",
        "jurisdicao": "Estadual",
        "sistema": "PJe",
        "wsdlEndpoint": "https://pjews.tjce.jus.br/pje1grau/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
    },
    {
        "id": "TJCE-2G",
        "nome": "TJCE 2º Grau",
        "nomeCompleto": "Tribunal de Justiça do Ceará — 2º Grau",
        "instancia": "2º Grau",
        "jurisdicao": "Estadual",
        "sistema": "e-SAJ",
        "wsdlEndpoint": None,
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": False,
        "avisoInstabilidade": "Sistema e-SAJ: roteamento por NPU obrigatório.",
    },
    {
        "id": "TJSP",
        "nome": "TJSP",
        "nomeCompleto": "Tribunal de Justiça de São Paulo",
        "instancia": "Geral",
        "jurisdicao": "Estadual",
        "sistema": "e-SAJ",
        "wsdlEndpoint": None,
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": False,
    },
    {
        "id": "TRF5-JFCE",
        "nome": "TRF5 / JFCE",
        "nomeCompleto": "TRF 5ª Região — Seção Judiciária do Ceará",
        "instancia": "Seção CE",
        "jurisdicao": "Federal",
        "sistema": "PJe",
        "wsdlEndpoint": "https://pje.jfce.jus.br/pje/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
        "avisoInstabilidade": "Endpoint descentralizado: use este nó para varas federais locais.",
    },
    {
        "id": "TRF5-REG",
        "nome": "TRF5 Regional",
        "nomeCompleto": "TRF 5ª Região — Turmas Recursais",
        "instancia": "Regional",
        "jurisdicao": "Federal",
        "sistema": "PJe",
        "wsdlEndpoint": "https://pje.trf5.jus.br/pje/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
    },
    {
        "id": "TRF3-1G",
        "nome": "TRF3 1º Grau",
        "nomeCompleto": "TRF 3ª Região — 1º Grau (SP)",
        "instancia": "1º Grau",
        "jurisdicao": "Federal",
        "sistema": "PJe",
        "wsdlEndpoint": "https://pje1g.trf3.jus.br/pje/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
    },
    {
        "id": "TRF3-2G",
        "nome": "TRF3 2º Grau",
        "nomeCompleto": "TRF 3ª Região — 2º Grau (SP)",
        "instancia": "2º Grau",
        "jurisdicao": "Federal",
        "sistema": "PJe",
        "wsdlEndpoint": "https://pje2g.trf3.jus.br/pje/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
    },
    {
        "id": "TRF1-1G",
        "nome": "TRF1 1º Grau",
        "nomeCompleto": "TRF 1ª Região — 1º Grau (Brasília)",
        "instancia": "1º Grau",
        "jurisdicao": "Federal",
        "sistema": "PJe",
        "wsdlEndpoint": "https://pje1g.trf1.jus.br/pje/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
        "suportaPlaywright": True,
        "scraperCode": "trf1",
        "mniBloqueado": True,
        "avisoInstabilidade": "TRF1 MNI bloqueado por firewall — usa Playwright RPA como fallback.",
    },
    {
        "id": "TRF1-2G",
        "nome": "TRF1 2º Grau",
        "nomeCompleto": "TRF 1ª Região — 2º Grau (Brasília)",
        "instancia": "2º Grau",
        "jurisdicao": "Federal",
        "sistema": "PJe",
        "wsdlEndpoint": "https://pje2g.trf1.jus.br/pje/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
        "suportaPlaywright": True,
        "scraperCode": "trf1",
        "mniBloqueado": True,
        "avisoInstabilidade": "TRF1 MNI bloqueado por firewall — usa Playwright RPA como fallback.",
    },
    {
        "id": "TRF4",
        "nome": "TRF4",
        "nomeCompleto": "TRF 4ª Região (Sul) — EPROC",
        "instancia": "Geral",
        "jurisdicao": "Federal",
        "sistema": "EPROC",
        "wsdlEndpoint": "https://eproc.trf4.jus.br/eproc2trf4/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
        "avisoInstabilidade": "Sistema EPROC: WSDL segue MNI mas estrutura difere do PJe padrão.",
    },
    {
        "id": "TRF5-JFAL",
        "nome": "TRF5 / JFAL",
        "nomeCompleto": "TRF 5ª Região — Seção Judiciária de Alagoas",
        "instancia": "Seção AL",
        "jurisdicao": "Federal",
        "sistema": "PJe",
        "wsdlEndpoint": "https://pje.jfal.jus.br/pje/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
    },
    {
        "id": "TRF5-JFSE",
        "nome": "TRF5 / JFSE",
        "nomeCompleto": "TRF 5ª Região — Seção Judiciária de Sergipe",
        "instancia": "Seção SE",
        "jurisdicao": "Federal",
        "sistema": "PJe",
        "wsdlEndpoint": "https://pje.jfse.jus.br/pje/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
    },
    {
        "id": "TRF5-JFPE",
        "nome": "TRF5 / JFPE",
        "nomeCompleto": "TRF 5ª Região — Seção Judiciária de Pernambuco",
        "instancia": "Seção PE",
        "jurisdicao": "Federal",
        "sistema": "PJe",
        "wsdlEndpoint": "https://pje.jfpe.jus.br/pje/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
    },
    {
        "id": "TRF5-JFPB",
        "nome": "TRF5 / JFPB",
        "nomeCompleto": "TRF 5ª Região — Seção Judiciária da Paraíba",
        "instancia": "Seção PB",
        "jurisdicao": "Federal",
        "sistema": "PJe",
        "wsdlEndpoint": "https://pje.jfpb.jus.br/pje/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
    },
    {
        "id": "TRF5-JFRN",
        "nome": "TRF5 / JFRN",
        "nomeCompleto": "TRF 5ª Região — Seção Judiciária do Rio Grande do Norte",
        "instancia": "Seção RN",
        "jurisdicao": "Federal",
        "sistema": "PJe",
        "wsdlEndpoint": "https://pje.jfrn.jus.br/pje/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
    },
    {
        "id": "TRF6-1G",
        "nome": "TRF6 1º Grau",
        "nomeCompleto": "TRF 6ª Região — 1º Grau (Minas Gerais)",
        "instancia": "1º Grau",
        "jurisdicao": "Federal",
        "sistema": "PJe",
        "wsdlEndpoint": "https://pje1g.trf6.jus.br/pje/intercomunicacao?wsdl",
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
    },
    {
        "id": "TRT7",
        "nome": "TRT7",
        "nomeCompleto": "TRT 7ª Região — Trabalho (CE)",
        "instancia": "Geral",
        "jurisdicao": "Trabalho",
        "sistema": "PJe-CSJT",
        "wsdlEndpoint": None,
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
        "avisoInstabilidade": "Erro 'processo não ativo' é regra de negócio, não falha de rede.",
    },
    {
        "id": "STF",
        "nome": "STF",
        "nomeCompleto": "Supremo Tribunal Federal",
        "instancia": "Único",
        "jurisdicao": "Superior",
        "sistema": "PJe",
        "wsdlEndpoint": None,
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
    },
    {
        "id": "STJ",
        "nome": "STJ",
        "nomeCompleto": "Superior Tribunal de Justiça",
        "instancia": "Único",
        "jurisdicao": "Superior",
        "sistema": "PJe",
        "wsdlEndpoint": None,
        "limiteArquivoMB": 5,
        "requerMTLS": True,
        "suportaMNI": True,
    },
]

# Index for O(1) lookup
_TRIBUNAIS_BY_ID = {t["id"]: t for t in TRIBUNAIS}


@router.get("")
async def list_tribunais() -> list[dict]:
    """List all supported courts."""
    return TRIBUNAIS


@router.get("/{tribunal_id}")
async def get_tribunal(tribunal_id: str) -> dict:
    """Get a single court by ID."""
    tribunal = _TRIBUNAIS_BY_ID.get(tribunal_id)
    if tribunal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tribunal '{tribunal_id}' não encontrado",
        )
    return tribunal


def get_tribunal_config(tribunal_id: str) -> dict | None:
    """Get tribunal config for internal use (no HTTP exception)."""
    return _TRIBUNAIS_BY_ID.get(tribunal_id)


@router.get("/{tribunal_id}/jurisdicoes", response_model=list[JurisdicaoSugestao])
async def get_jurisdicoes_tribunal(
    tribunal_id: str,
    materia_value: str | None = None,
    db: AsyncSession = Depends(get_jusmonitoria_session),
) -> list[JurisdicaoSugestao]:
    """Retorna jurisdições coletadas para o tribunal selecionado.

    Esta rota é pública para o frontend autenticado e lê dados já persistidos
    pelo fluxo interno de coleta.
    """
    tribunal = _TRIBUNAIS_BY_ID.get(tribunal_id)
    if tribunal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tribunal '{tribunal_id}' não encontrado",
        )

    tribunal_code = TRIBUNAL_ID_TO_CODE.get(tribunal_id)
    if not tribunal_code:
        return []

    stmt = (
        select(
            distinct(PjeJurisdicao.jurisdicao_value),
            PjeJurisdicao.jurisdicao_text,
        )
        .where(PjeJurisdicao.tribunal == tribunal_code)
        .order_by(PjeJurisdicao.jurisdicao_text)
    )
    if materia_value:
        stmt = stmt.where(PjeJurisdicao.materia_value == materia_value)
    rows = (await db.execute(stmt)).all()
    return [
        JurisdicaoSugestao(codigo=row[0], nome=row[1])
        for row in rows
    ]


@router.get("/{tribunal_id}/classes", response_model=list[ClassePjeSugestao])
async def get_classes_pje_tribunal(
    tribunal_id: str,
    materia_value: str,
    jurisdicao_value: str,
    db: AsyncSession = Depends(get_jusmonitoria_session),
) -> list[ClassePjeSugestao]:
    tribunal = _TRIBUNAIS_BY_ID.get(tribunal_id)
    if tribunal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tribunal '{tribunal_id}' não encontrado",
        )

    tribunal_code = TRIBUNAL_ID_TO_CODE.get(tribunal_id)
    if not tribunal_code:
        return []

    stmt = select(PjeJurisdicao).where(
        PjeJurisdicao.tribunal == tribunal_code,
        PjeJurisdicao.materia_value == materia_value,
        PjeJurisdicao.jurisdicao_value == jurisdicao_value,
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        return []

    classes = row.classes or []
    return [
        ClassePjeSugestao(
            codigo=str(item.get("value", "")),
            nome=item.get("text", ""),
            codigo_tpu=item.get("codigo_tpu") or _extract_tpu_code(item.get("text")),
            total_competencias=len(item.get("competencias") or []),
        )
        for item in classes
        if item.get("value") and item.get("text")
    ]


@router.get("/{tribunal_id}/competencias", response_model=list[CompetenciaPjeSugestao])
async def get_competencias_pje_tribunal(
    tribunal_id: str,
    materia_value: str,
    jurisdicao_value: str,
    classe_value: str,
    db: AsyncSession = Depends(get_jusmonitoria_session),
) -> list[CompetenciaPjeSugestao]:
    tribunal = _TRIBUNAIS_BY_ID.get(tribunal_id)
    if tribunal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tribunal '{tribunal_id}' não encontrado",
        )

    tribunal_code = TRIBUNAL_ID_TO_CODE.get(tribunal_id)
    if not tribunal_code:
        return []

    stmt = select(PjeJurisdicao).where(
        PjeJurisdicao.tribunal == tribunal_code,
        PjeJurisdicao.materia_value == materia_value,
        PjeJurisdicao.jurisdicao_value == jurisdicao_value,
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        return []

    classes = row.classes or []
    target = next((item for item in classes if str(item.get("value")) == classe_value), None)
    if target is None:
        return []

    competencias = target.get("competencias") or []
    return [
        CompetenciaPjeSugestao(codigo=str(item.get("value", "")), nome=item.get("text", ""))
        for item in competencias
        if item.get("value") and item.get("text")
    ]
