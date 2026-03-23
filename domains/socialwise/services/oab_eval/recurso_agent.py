"""Recurso (appeal) generation agent — generates appeal text from validated analysis.

Port of: lib/oab-eval/recurso-generator-agent.ts

Pipeline:
1. Load blueprint config (RECURSO_CELL) via 4-tier resolution
2. Build prompt with analise_validada + dados_adicionais
3. Call structured LLM output via LiteLLM
4. Return recurso text
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from platform_core.ai.litellm_config import (
    call_structured,
    resolve_litellm_model,
)
from platform_core.logging.config import get_logger
from domains.socialwise.services.oab_eval.blueprint_config import (
    OPENAI_FALLBACK_MODEL,
    get_agent_config,
)

logger = get_logger(__name__)

# ── Default models ───────────────────────────────────────────────────────

DEFAULT_MODELS_BY_PROVIDER = {
    "OPENAI": "gpt-5.2",
    "GEMINI": "gemini-2.5-flash",
    "CLAUDE": "claude-3-5-sonnet-latest",
}

DEFAULT_MAX_OUTPUT_TOKENS = 11192
DEFAULT_TEMPERATURE = 0.3

# ── Default prompt ───────────────────────────────────────────────────────

DEFAULT_RECURSO_PROMPT = """
<agent>
  <name>RedatorJuridicoRecursosOAB</name>
  <task>
    Atuar como um ASSISTENTE JURÍDICO de altíssima precisão focado na REDAÇÃO DE RECURSOS (apelo de revisão de nota) para o exame da OAB.
    Você receberá uma "Análise do Especialista" (que contém todo o trabalho argumentativo, identificação de acertos/erros, linhas e pontuações).
    Sua tarefa é formatar e redigir o recurso completo, encaixando os apontamentos da Análise na estrutura rígida exigida. Você NÃO deve criar novos argumentos jurídicos do zero, mas sim transpor a argumentação da análise para a linguagem persuasiva, técnica e respeitosa exigida pelas bancas examinadoras.
  </task>
  <language>pt-BR</language>

  <rules>
    1. !important ESTRITAMENTE FIEL À ANÁLISE: NÃO inclua fatos novos, leis ou interpretações que não constem na "Análise do Especialista". O campo gabarito_banca contém o texto REAL da banca — use SOMENTE ele para preencher ''[GABARITO ESPERADO]''. Se gabarito_banca estiver ausente para um item, OMITA a citação do gabarito e foque apenas no texto do examinando. O trabalho braçal de fundamentação já foi feito; seu trabalho é de redação e formatação.
    2. !important ESTRUTURA DO MODELO: Siga RIGOROSAMENTE a estrutura e o vocabulário base dados no "Formato de Saída". Mantenha os conectivos, os inícios de parágrafo e o tom formal.
    3. !important OBJETIVO ÚNICO: Seu texto deve ter um único objetivo: pedir a majoração da nota com base no que já foi analisado e comprovado nas linhas da prova do aluno.
    4. !important ANONIMATO DO EXAMINANDO: NUNCA identifique o aluno por nome. Utilize sempre termos genéricos e impessoais exigidos pela banca, como "O Examinando", "O Candidato", "O Recorrente".
    5. !important DADOS EVIDENCIADOS: Sempre que preencher as lacunas, cite expressamente as linhas correspondentes (ex: linhas 10-12) e transcreva o trecho exato do aluno entre aspas, conforme apontado na análise.
    6. !important SE NÃO HOUVER GABARITO: Se a análise não contiver o campo gabarito_banca para um item, NÃO tente adivinhar o que a banca exigia. Reformule a frase sem citar o gabarito, focando apenas no texto do examinando e na pontuação a ser majorada.
  </rules>

  <instructions>
    1. CABEÇALHO:
       - Inicie obrigatoriamente com a saudação destacada:
         "<u>**Senhores Examinadores da Banca Recursal,**</u>
         O Examinando vem pelo presente, respeitosamente requerer a reapreciação desses quesitos da sua prova:"

    2. SEÇÃO DA PEÇA PRÁTICO-PROFISSIONAL:
       - Crie o subtítulo destacado "<u>**PEÇA**</u>" SOZINHO em sua própria linha.
       - Para cada quesito da peça apontado na análise como passível de recurso, utilize a estrutura base, substituindo as chaves pelos dados da análise.

    3. SEÇÃO DAS QUESTÕES DISCURSIVAS:
       - Crie o subtítulo destacado "<u>**QUESTÕES**</u>" SOZINHO em sua própria linha.
       - Para cada questão apontada na análise, o subtítulo "<u>**Questão [N]**</u>" deve ficar SOZINHO em sua própria linha.

    4. REVISÃO DE COESÃO:
       - Verifique se as pontuações (vírgulas, aspas simples duplas '') estão formatadas corretamente e se não ficaram marcações como "[]" ou "{}" no texto final.
       - A pontuação solicitada deve usar vírgula para decimais (ex: 0,65 pontos).

    5. FORMATO DE SAÍDA EM MARKDOWN (DESTAQUES):
       - Sua resposta deve ser APENAS o texto completo do recurso formatado em Markdown.
       - Use <u>**texto**</u> para sublinhar e negritar simultaneamente as informações mais importantes.
       - Use ''aspas simples duplas'' para citações do gabarito e do examinando.
       - NÃO use blocos de código, tabelas ou listas com bullets. Mantenha o estilo de prosa jurídica formal.
  </instructions>
</agent>
""".strip()

DEFAULT_RECURSO_SCHEMA = {
    "type": "object",
    "properties": {
        "texto_recurso": {
            "type": "string",
            "description": "O texto final e consolidado do recurso",
        },
    },
    "required": ["texto_recurso"],
}


# ── Main export ──────────────────────────────────────────────────────────


async def run_recurso(
    session: AsyncSession,
    *,
    lead_id: str,
    analise_validada: Any,
    dados_adicionais: dict[str, Any] | None = None,
    selected_provider: str | None = None,
    on_progress: Callable[[str, Any], Awaitable[None]] | None = None,
) -> dict[str, Any]:
    """Generate recurso text from a validated analysis.

    Returns dict with keys: success, recursoOutput, model, provider, processingTimeMs, error.
    """
    start = time.monotonic()

    if not analise_validada:
        return {
            "success": False,
            "error": "Análise Validada ausente. Não é possível gerar recurso.",
            "model": "none",
            "provider": "OPENAI",
            "processingTimeMs": 0,
        }

    # 1) Load config via blueprint 4-tier resolution
    if on_progress:
        await on_progress("config", {"step": "Carregando configuração do agente..."})

    config = await get_agent_config(
        session,
        linked_column="RECURSO_CELL",
        env_blueprint_id_var="OAB_RECURSO_BLUEPRINT_ID",
        env_assistant_id_var="OAB_RECURSO_ASSISTANT_ID",
        search_terms=["recurso", "appeal"],
        base_instructions=DEFAULT_RECURSO_PROMPT,
        selected_provider=selected_provider,
    )

    # 2) Build prompts
    safe_analise = (
        analise_validada
        if isinstance(analise_validada, str)
        else json.dumps(analise_validada, ensure_ascii=False, indent=2)
    )

    system_prompt = config.system_instructions

    # Replace {analise_validada} placeholder if present in blueprint prompt
    system_prompt = re.sub(r"\{analise_validada\}", safe_analise, system_prompt)

    if dados_adicionais:
        for key, value in dados_adicionais.items():
            safe_value = str(value) if not isinstance(value, str) else value
            system_prompt = system_prompt.replace(f"{{{key}}}", safe_value)

    # Build user message
    if "{analise_validada}" not in config.system_instructions:
        user_message = (
            "DADOS PARA O RECURSO:\n"
            "===================\n"
            "Análise do Especialista (Siga OBRIGATORIAMENTE os dados contidos nela):\n"
            f"{safe_analise}\n"
            "===================\n"
            "Por favor, proceda com a redação final."
        )
    else:
        user_message = (
            "As informações já foram injetadas no seu contexto. "
            "Proceda com a redação final baseada na análise validada."
        )

    if on_progress:
        await on_progress("llm", {"step": f"Gerando recurso via {config.provider} ({config.model})..."})

    # 3) Call LLM
    try:
        result = await call_structured(
            config.litellm_model,
            system_prompt,
            user_message,
            DEFAULT_RECURSO_SCHEMA,
            max_tokens=config.max_output_tokens or DEFAULT_MAX_OUTPUT_TOKENS,
            temperature=DEFAULT_TEMPERATURE,
        )

        elapsed_ms = int((time.monotonic() - start) * 1000)

        # Parse JSON response
        try:
            parsed = json.loads(result.content)
        except json.JSONDecodeError:
            parsed = {"texto_recurso": result.content}

        logger.info(
            "recurso_generated",
            lead_id=lead_id,
            elapsed_ms=elapsed_ms,
            tokens=result.total_tokens,
            model=config.model,
            provider=config.provider,
        )

        return {
            "success": True,
            "recursoOutput": parsed,
            "model": config.model,
            "provider": config.provider,
            "processingTimeMs": elapsed_ms,
            "tokenUsage": {
                "input": result.input_tokens,
                "output": result.output_tokens,
                "total": result.total_tokens,
            },
        }

    except Exception as exc:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.exception("recurso_generation_failed", lead_id=lead_id)
        return {
            "success": False,
            "error": str(exc)[:500],
            "model": config.model,
            "provider": config.provider,
            "processingTimeMs": elapsed_ms,
        }
