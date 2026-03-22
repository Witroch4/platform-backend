"""Agente Investigador - Process analysis and investigation."""

import logging
from collections import Counter
from datetime import date, datetime
from typing import Any

from domains.jusmonitoria.ai.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)

_POSITIVE_ANOMALY_KEYWORDS = (
    "acordo homologado",
    "alvará expedido",
    "homologo o acordo",
    "liminar deferida",
    "pedido procedente",
    "sentença procedente",
    "tutela deferida",
)

_NEGATIVE_ANOMALY_KEYWORDS = (
    "arquivado",
    "extinção",
    "extinto",
    "improcedente",
    "indeferida",
    "indeferido",
    "negado provimento",
    "sentença de improcedência",
)

_GENERIC_ATTENTION_KEYWORDS = (
    "audiência",
    "conclusos",
    "decisão",
    "despacho",
    "intimação",
    "julgamento",
    "sentença",
)

_LONG_INACTIVITY_DAYS = 180


class InvestigadorAgent(BaseAgent):
    """
    Agente Investigador - Process Investigation Agent.

    Responsibilities:
    - Search for related case movements
    - Use semantic search with embeddings
    - Identify patterns and anomalies
    - Generate insights about processes
    - Detect deadlines and important dates

    Validates: Requirements 2.6, 2.7
    """

    def get_agent_name(self) -> str:
        return "Investigador"

    def get_system_prompt(self) -> str:
        return """Você é um assistente jurídico especializado em análise processual.

Sua função é analisar movimentações processuais e gerar insights estratégicos.

TAREFAS:
1. Analisar movimentações processuais
2. Identificar eventos importantes e críticos
3. Detectar prazos e deadlines
4. Avaliar necessidade de ação imediata
5. Identificar padrões e anomalias
6. Resumir status atual do processo

CRITÉRIOS DE IMPORTÂNCIA:
- CRÍTICO: Sentenças, decisões, prazos para recurso
- IMPORTANTE: Audiências, despachos, intimações
- RELEVANTE: Juntada de documentos, petições
- INFORMATIVO: Movimentações administrativas

ANÁLISE DE PADRÕES:
- Tempo médio entre movimentações
- Frequência de eventos
- Comportamento atípico
- Tendências do processo

FORMATO DE RESPOSTA:
Seja claro, objetivo e destaque informações críticas.
Use linguagem técnica mas acessível.
Priorize ações que requerem atenção imediata.
"""

    async def analyze_movements(
        self,
        process_info: dict[str, Any],
        movements: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Analyze process movements and generate insights.

        Args:
            process_info: Process information (cnj_number, court, etc.)
            movements: List of movement dictionaries with date and description

        Returns:
            Dictionary with analysis results:
            - resumo: Summary of current status
            - movimentacoes_importantes: List of important movements
            - prazos: List of detected deadlines
            - requer_acao: Boolean indicating if action is needed
            - proximos_passos: Recommended next steps
            - padroes: Identified patterns
        """
        logger.info(
            "Analyzing process movements",
            extra={
                "tenant_id": str(self.tenant_id),
                "process": process_info.get("cnj_number"),
                "movement_count": len(movements),
            },
        )

        # Format movements for analysis
        movements_text = self._format_movements(movements)

        context = {
            "process": process_info,
        }

        prompt = f"""Analise as seguintes movimentações do processo {process_info.get('cnj_number', 'N/A')}:

{movements_text}

Forneça uma análise completa em JSON:
{{
    "resumo": "string (resumo do status atual)",
    "movimentacoes_importantes": [
        {{
            "data": "YYYY-MM-DD",
            "descricao": "string",
            "importancia": "critica|importante|relevante",
            "motivo": "string"
        }}
    ],
    "prazos": [
        {{
            "data": "YYYY-MM-DD",
            "descricao": "string",
            "dias_restantes": number,
            "urgente": boolean
        }}
    ],
    "requer_acao": boolean,
    "proximos_passos": ["string"],
    "padroes": {{
        "tempo_medio_entre_movimentacoes": "string",
        "anomalias": ["string"],
        "tendencia": "string"
    }}
}}
"""

        response = await self.execute(
            user_message=prompt,
            context=context,
            temperature=0.4,
        )

        try:
            result = self.parse_json_response(response)
            heuristic_anomalies = await self.detect_anomalies(movements)
            result = self._merge_detected_anomalies(result, heuristic_anomalies)

            logger.info(
                "Process analysis completed",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "process": process_info.get("cnj_number"),
                    "requer_acao": result.get("requer_acao"),
                    "prazos_count": len(result.get("prazos", [])),
                },
            )

            return result

        except ValueError as e:
            logger.error(
                "Failed to parse analysis response",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "error": str(e),
                },
            )

            heuristic_anomalies = await self.detect_anomalies(movements)

            # Return minimal response on error
            return {
                "resumo": "Erro ao analisar processo",
                "movimentacoes_importantes": [],
                "prazos": [],
                "requer_acao": self._anomalies_require_action(heuristic_anomalies),
                "proximos_passos": ["Revisar manualmente"],
                "padroes": {
                    "anomalias": heuristic_anomalies,
                },
            }

    def _format_movements(self, movements: list[dict[str, Any]]) -> str:
        """Format movements for LLM analysis."""
        formatted = []

        for mov in movements:
            date_str = mov.get("date", "")
            if isinstance(date_str, (date, datetime)):
                date_str = date_str.strftime("%d/%m/%Y")

            description = mov.get("description", "")
            movement_type = mov.get("type", "")

            line = f"- {date_str}"
            if movement_type:
                line += f" [{movement_type}]"
            line += f": {description}"

            formatted.append(line)

        return "\n".join(formatted)

    async def search_similar_cases(
        self,
        query: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """
        Search for similar cases using semantic search.

        Args:
            query: Search query text
            limit: Maximum number of results

        Returns:
            List of similar case dictionaries with similarity scores

        Uses pgvector cosine similarity search on timeline embeddings.
        """
        from domains.jusmonitoria.ai.providers.litellm_config import litellm_config
        from domains.jusmonitoria.db.models.timeline_embedding import TimelineEmbedding

        logger.info(
            "Searching similar cases",
            extra={
                "tenant_id": str(self.tenant_id),
                "query_length": len(query),
                "limit": limit,
            },
        )

        # 1. Generate embedding for query
        try:
            query_embedding = await litellm_config.generate_embedding(query)
        except Exception as e:
            logger.error("Failed to generate query embedding", extra={"error": str(e)})
            return []

        # 2. Search with pgvector cosine distance
        from sqlalchemy import select
        stmt = (
            select(
                TimelineEmbedding,
                TimelineEmbedding.embedding.cosine_distance(query_embedding).label("distance"),
            )
            .where(TimelineEmbedding.tenant_id == self.tenant_id)
            .order_by("distance")
            .limit(limit)
        )

        result = await self.session.execute(stmt)
        rows = result.all()

        # 3. Format results
        results = []
        for emb, distance in rows:
            similarity = round(1.0 - distance, 4)
            event = emb.timeline_event
            results.append({
                "timeline_event_id": str(emb.timeline_event_id),
                "similarity": similarity,
                "entity_type": getattr(event, "entity_type", "") if event else "",
                "event_type": getattr(event, "event_type", "") if event else "",
                "title": getattr(event, "title", "") if event else "",
                "description": getattr(event, "description", "") if event else "",
                "created_at": str(getattr(event, "created_at", "")) if event else "",
            })

        logger.info(
            f"Found {len(results)} similar cases",
            extra={
                "tenant_id": str(self.tenant_id),
                "results_count": len(results),
                "top_similarity": results[0]["similarity"] if results else 0,
            },
        )

        return results

    async def search_similar_documents(
        self,
        query: str,
        limit: int = 10,
        source_types: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Search for similar documents using multimodal Gemini embeddings.

        Performs cross-modal retrieval: a text query can match PDFs, images,
        and text embeddings stored in the ``document_embeddings`` table.

        Args:
            query: Search query text.
            limit: Maximum number of results.
            source_types: Optional filter — e.g. ``["pdf", "text"]``.

        Returns:
            List of result dicts with similarity, source metadata, and excerpt.
        """
        from platform_core.config import settings as cfg
        from domains.jusmonitoria.db.models.document_embedding import DocumentEmbedding

        if not cfg.gemini_embedding_enabled:
            logger.debug("multimodal_search_disabled")
            return []

        logger.info(
            "Searching similar documents (multimodal)",
            extra={
                "tenant_id": str(self.tenant_id),
                "query_length": len(query),
                "limit": limit,
                "source_types": source_types,
            },
        )

        # 1. Generate query embedding with Gemini
        try:
            from domains.jusmonitoria.services.multimodal_embedding_service import (
                MultimodalEmbeddingService,
            )

            svc = MultimodalEmbeddingService()
            query_embedding = await svc.embed_query(query)
        except Exception as e:
            logger.error("Failed to generate multimodal query embedding", extra={"error": str(e)})
            return []

        # 2. Build pgvector query
        from sqlalchemy import select

        stmt = (
            select(
                DocumentEmbedding,
                DocumentEmbedding.embedding.cosine_distance(query_embedding).label("distance"),
            )
            .where(DocumentEmbedding.tenant_id == self.tenant_id)
        )

        if source_types:
            stmt = stmt.where(DocumentEmbedding.source_type.in_(source_types))

        stmt = stmt.order_by("distance").limit(limit)

        result = await self.session.execute(stmt)
        rows = result.all()

        # 3. Format results
        results = []
        for doc_emb, distance in rows:
            similarity = round(1.0 - distance, 4)
            results.append({
                "document_embedding_id": str(doc_emb.id),
                "source_entity": doc_emb.source_entity,
                "source_id": str(doc_emb.source_id),
                "source_type": doc_emb.source_type.value if hasattr(doc_emb.source_type, "value") else doc_emb.source_type,
                "s3_key": doc_emb.s3_key,
                "mime_type": doc_emb.mime_type,
                "similarity": similarity,
                "excerpt": doc_emb.excerpt or "",
                "model": doc_emb.model,
                "created_at": str(doc_emb.created_at) if doc_emb.created_at else "",
            })

        logger.info(
            f"Found {len(results)} similar documents",
            extra={
                "tenant_id": str(self.tenant_id),
                "results_count": len(results),
                "top_similarity": results[0]["similarity"] if results else 0,
            },
        )

        return results

    async def detect_anomalies(
        self,
        movements: list[dict[str, Any]],
    ) -> list[str]:
        """
        Detect anomalies in process movements.

        Args:
            movements: List of movement dictionaries

        Returns:
            List of detected anomaly descriptions
        """
        ordered_movements = self._ordered_movements_with_dates(movements)

        anomalies = self._detect_duplicate_movements(ordered_movements)
        anomalies.extend(self._detect_inactivity_anomalies(ordered_movements))
        return anomalies

    def _merge_detected_anomalies(
        self,
        analysis: dict[str, Any],
        anomalies: list[str],
    ) -> dict[str, Any]:
        """Merge heuristic anomaly detection into the parsed LLM analysis."""
        patterns = analysis.get("padroes")
        if not isinstance(patterns, dict):
            patterns = {}
            analysis["padroes"] = patterns

        existing = [
            item.strip()
            for item in patterns.get("anomalias", [])
            if isinstance(item, str) and item.strip()
        ]
        merged = existing.copy()

        for anomaly in anomalies:
            if anomaly not in merged:
                merged.append(anomaly)

        patterns["anomalias"] = merged

        if not analysis.get("requer_acao") and self._anomalies_require_action(merged):
            analysis["requer_acao"] = True

        return analysis

    def _ordered_movements_with_dates(
        self,
        movements: list[dict[str, Any]],
    ) -> list[tuple[date, dict[str, Any]]]:
        """Return movements that have parseable dates ordered from oldest to newest."""
        dated_movements = []

        for movement in movements:
            movement_date = self._parse_movement_date(movement)
            if movement_date is not None:
                dated_movements.append((movement_date, movement))

        dated_movements.sort(key=lambda item: item[0])
        return dated_movements

    def _parse_movement_date(self, movement: dict[str, Any]) -> date | None:
        """Parse a movement date from supported input formats."""
        raw_date = movement.get("date") or movement.get("movement_date")

        if isinstance(raw_date, datetime):
            return raw_date.date()
        if isinstance(raw_date, date):
            return raw_date
        if not isinstance(raw_date, str):
            return None

        normalized_date = raw_date.strip()
        if not normalized_date:
            return None

        for date_format in (
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S.%f",
        ):
            try:
                return datetime.strptime(normalized_date, date_format).date()
            except ValueError:
                continue

        try:
            return datetime.fromisoformat(normalized_date.replace("Z", "+00:00")).date()
        except ValueError:
            return None

    def _detect_duplicate_movements(
        self,
        movements: list[tuple[date, dict[str, Any]]],
    ) -> list[str]:
        """Identify duplicate movements with the same day and normalized description."""
        signatures = Counter()
        descriptions: dict[tuple[date, str], str] = {}

        for movement_date, movement in movements:
            description = self._normalize_description(movement.get("description", ""))
            if not description:
                continue
            signature = (movement_date, description)
            signatures[signature] += 1
            descriptions.setdefault(signature, movement.get("description", "").strip())

        anomalies = []
        for signature, count in signatures.items():
            if count < 2:
                continue
            movement_date, _ = signature
            original_description = descriptions.get(signature, "")
            anomalies.append(
                "[atencao] Movimentação duplicada detectada em "
                f"{movement_date.isoformat()}: '{original_description}' ({count} ocorrências)."
            )

        return anomalies

    def _detect_inactivity_anomalies(
        self,
        movements: list[tuple[date, dict[str, Any]]],
    ) -> list[str]:
        """Detect long inactivity windows followed by relevant events."""
        anomalies = []

        for previous, current in zip(movements, movements[1:], strict=False):
            previous_date, _ = previous
            current_date, current_movement = current
            gap_days = (current_date - previous_date).days

            if gap_days < _LONG_INACTIVITY_DAYS:
                continue

            description = current_movement.get("description", "").strip()
            label = self._classify_anomaly(description)
            if label == "positiva":
                anomalies.append(
                    "[positiva] Processo ficou "
                    f"{gap_days} dias sem movimentação e retomou com evento favorável: '{description}'."
                )
            elif label == "negativa":
                anomalies.append(
                    "[negativa] Processo ficou "
                    f"{gap_days} dias sem movimentação e retornou com desfecho adverso: '{description}'."
                )
            elif label == "atencao":
                anomalies.append(
                    "[atencao] Processo ficou "
                    f"{gap_days} dias sem movimentação antes do evento '{description}'."
                )

        return anomalies

    def _classify_anomaly(self, description: str) -> str | None:
        """Classify a movement description as positive, negative, or attention-worthy."""
        normalized_description = self._normalize_description(description)
        if not normalized_description:
            return None

        if any(keyword in normalized_description for keyword in _POSITIVE_ANOMALY_KEYWORDS):
            return "positiva"
        if any(keyword in normalized_description for keyword in _NEGATIVE_ANOMALY_KEYWORDS):
            return "negativa"
        if any(keyword in normalized_description for keyword in _GENERIC_ATTENTION_KEYWORDS):
            return "atencao"
        return None

    def _normalize_description(self, description: str) -> str:
        """Normalize descriptions before heuristic comparisons."""
        return " ".join(description.lower().split())

    def _anomalies_require_action(self, anomalies: list[str]) -> bool:
        """Return whether the detected anomalies warrant immediate manual review."""
        return any(
            anomaly.startswith("[negativa]") or anomaly.startswith("[atencao]")
            for anomaly in anomalies
        )

    async def generate_process_summary(
        self,
        process_info: dict[str, Any],
        movements: list[dict[str, Any]],
        max_length: int = 500,
    ) -> str:
        """
        Generate concise summary of process status.

        Args:
            process_info: Process information
            movements: List of movements
            max_length: Maximum summary length in characters

        Returns:
            Summary text
        """
        movements_text = self._format_movements(movements[-10:])  # Last 10 movements

        context = {
            "process": process_info,
        }

        prompt = f"""Gere um resumo executivo do processo {process_info.get('cnj_number', 'N/A')}.

Últimas movimentações:
{movements_text}

O resumo deve:
- Ter no máximo {max_length} caracteres
- Destacar o status atual
- Mencionar próximos passos se houver
- Ser claro e objetivo
"""

        response = await self.execute(
            user_message=prompt,
            context=context,
            temperature=0.5,
            max_tokens=200,
        )

        # Truncate if needed
        if len(response) > max_length:
            response = response[: max_length - 3] + "..."

        return response.strip()

    async def identify_deadlines(
        self,
        movements: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Identify deadlines from movements.

        Args:
            movements: List of movement dictionaries

        Returns:
            List of deadline dictionaries with date and description
        """
        movements_text = self._format_movements(movements)

        prompt = f"""Identifique todos os prazos mencionados nestas movimentações:

{movements_text}

Para cada prazo, forneça:
- Data do prazo
- Descrição do que deve ser feito
- Urgência (sim/não)

Responda em JSON:
{{
    "prazos": [
        {{
            "data": "YYYY-MM-DD",
            "descricao": "string",
            "urgente": boolean
        }}
    ]
}}

Se não houver prazos, retorne lista vazia.
"""

        response = await self.execute(
            user_message=prompt,
            temperature=0.2,
        )

        try:
            result = self.parse_json_response(response)
            return result.get("prazos", [])
        except ValueError:
            return []
