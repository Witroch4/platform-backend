"""Tipos de documento disponíveis no formulário PJe por tribunal.

Extraídos diretamente do select `cbTDDecoration:cbTD` via RPA (Playwright).
Chave: código interno do tribunal (ex: 'trf1', 'trf3', 'tjce').
Valor: lista ordenada de labels exatamente como aparecem no PJe.

Atualizado em: 2026-03-04 — validado ao vivo via Playwright no TRF1.
"""

# TRF1 — 82 tipos (capturado do processo 1014980-12.2025.4.01.4100)
_TRF1 = [
    "Aditamento à inicial",
    "Alegações/Razões Finais",
    "Apelação",
    "Apresentação de quesitos",
    "Apresentação de rol de testemunhas",
    "Arquivo de vídeo",
    "Carta arbitral",
    "Carta de adjudicação",
    "Carta de arrematação",
    "Carta de concessão de benefício",
    "Certidão de Dívida Ativa - CDA",
    "Certidão de antecedentes criminais",
    "Ciência",
    "Comprovante (Outros)",
    "Comprovante de Implantação de Benefício",
    "Comprovante de depósito judicial",
    "Comprovante de recolhimento de custas",
    "Comprovante de recolhimento de preparo",
    "Comprovante de situação cadastral no CNPJ",
    "Contestação",
    "Contestação (Outros)",
    "Contestação - Ausência de Requisitos",
    "Contestação - Complementação de Prova Técnica",
    "Contestação - Inexistência da Qualidade de Segurado Especial",
    "Contestação - Proposta de Acordo",
    "Contestação - Remessa à Conciliação",
    "Contestação Previdenciária",
    "Contrarrazões",
    "Cumprimento de Sentença",
    "Declaração",
    "Declaração de hipossuficiência/pobreza",
    "Defesa Prévia",
    "Documentos Diversos",
    "Embargos de declaração",
    "Embargos à ação monitória",
    "Emenda à inicial",
    "Exame médico",
    "Exceção de pré-executividade",
    "Extrato bancário",
    "Formulário",
    "Guia de Recolhimento da União - GRU",
    "Impugnação",
    "Impugnação ao Cumprimento de Sentença",
    "Impugnação aos Embargos",
    "Informações Geográficas",
    "Inicial",
    "Manifestação",
    "Nota de ciência das garantias constitucionais",
    "Nota de culpa",
    "Outras peças",
    "Pedido contraposto",
    "Pedido de Desbloqueio Penhora Online/Sisbajud",
    "Pedido de Designação/Redesignação de Audiência",
    "Pedido de Dilação de Prazo",
    "Pedido de Extinção do Processo",
    "Pedido de desarquivamento",
    "Pedido de desistência da ação",
    "Pedido de desistência de recurso",
    "Pedido de homologação de acordo",
    "Pedido de liberdade provisória",
    "Pedido de suspensão do processo",
    "Petição - Emissão de Certidão de Objeto e Pé",
    "Petição intercorrente",
    "Processo administrativo",
    "Procuração",
    "Procuração/Habilitação",
    "Questão de ordem",
    "Razões de apelação criminal",
    "Razões de recurso em sentido estrito",
    "Reconvenção",
    "Recurso adesivo",
    "Recurso em sentido estrito",
    "Recurso inominado",
    "Recurso ordinário",
    "Renúncia ao direito sobre o qual se funda a ação",
    "Renúncia de mandato",
    "Resposta",
    "Resposta preliminar",
    "Resposta à acusação",
    "Réplica",
    "Substabelecimento",
]

# TRF3, TRF5, TRF6 usam a mesma base do PJe federal — mesmo conjunto do TRF1
# (pode variar por versão; atualizar ao executar scraper em cada tribunal)
_TRF3 = _TRF1
_TRF5 = _TRF1
_TRF6 = _TRF1

# TJCE — tipos estaduais (subconjunto padrão; atualizar após scraper em produção)
_TJCE = _TRF1  # temporário até scraper mapear TJCE


# Mapeamento principal: código → lista de tipos
TIPOS_DOCUMENTO_PJE: dict[str, list[str]] = {
    "trf1": _TRF1,
    "trf3": _TRF3,
    "trf5": _TRF5,
    "trf6": _TRF6,
    "tjce": _TJCE,
    "tjsp": _TRF1,  # provisório
    "tjrj": _TRF1,  # provisório
}

# Mapeamento de tribunal_id frontend → código interno scraper
# Ex: 'TRF1-1G' → 'trf1'
TRIBUNAL_ID_TO_CODE: dict[str, str] = {
    "TRF1-1G": "trf1",
    "TRF1-2G": "trf1",
    "TRF3-1G": "trf3",
    "TRF3-2G": "trf3",
    "TRF5-JFCE": "trf5",
    "TRF5-REG": "trf5",
    "TRF5-JFAL": "trf5",
    "TRF5-JFSE": "trf5",
    "TRF5-JFPE": "trf5",
    "TRF5-JFPB": "trf5",
    "TRF5-JFRN": "trf5",
    "TRF6-1G": "trf6",
    "TJCE-1G": "tjce",
    "TJCE-2G": "tjce",
    "TJSP": "tjsp",
}


def get_tipos_documento(tribunal_id: str) -> list[str]:
    """Retorna lista de tipos de documento para um tribunal.

    Args:
        tribunal_id: ID frontend (ex: 'TRF1-1G') ou código scraper (ex: 'trf1')

    Returns:
        Lista ordenada de labels exatamente como aparecem no PJe.
        Retorna lista vazia se tribunal não encontrado.
    """
    # Tenta código direto (ex: 'trf1')
    if tribunal_id.lower() in TIPOS_DOCUMENTO_PJE:
        return TIPOS_DOCUMENTO_PJE[tribunal_id.lower()]

    # Tenta mapeamento frontend→código (ex: 'TRF1-1G' → 'trf1')
    code = TRIBUNAL_ID_TO_CODE.get(tribunal_id)
    if code:
        return TIPOS_DOCUMENTO_PJE.get(code, [])

    return []
