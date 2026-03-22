"""Agente de Triagem - Lead qualification and analysis."""

import logging
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.ai.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class TriagemAgent(BaseAgent):
    """
    Agente de Triagem - Lead Qualification Agent.
    
    Responsibilities:
    - Analyze incoming lead messages
    - Extract structured information (name, phone, case type)
    - Classify urgency (baixa, média, alta, crítica)
    - Calculate initial lead score (0-100)
    - Recommend next action
    
    Validates: Requirements 2.2, 2.7
    """
    
    def get_agent_name(self) -> str:
        return "Triagem"
    
    def get_system_prompt(self) -> str:
        return """Você é um assistente jurídico especializado em triagem de leads.

Sua função é analisar mensagens de potenciais clientes e extrair informações estruturadas.

TAREFAS:
1. Extrair informações do lead:
   - Nome completo (se mencionado)
   - Telefone (se mencionado)
   - Email (se mencionado)
   - Tipo de caso jurídico

2. Classificar urgência:
   - CRÍTICA: Prazos iminentes, situações emergenciais
   - ALTA: Casos importantes que requerem atenção rápida
   - MÉDIA: Casos relevantes sem urgência imediata
   - BAIXA: Consultas gerais, informações

3. Identificar área do direito:
   - Trabalhista, Civil, Criminal, Família, Tributário, etc.

4. Calcular score do lead (0-100):
   - Urgência: 40 pontos
   - Clareza da mensagem: 20 pontos
   - Informações fornecidas: 20 pontos
   - Potencial do caso: 20 pontos

5. Recomendar próxima ação:
   - "agendar_consulta": Lead qualificado, agendar reunião
   - "solicitar_informacoes": Precisa de mais detalhes
   - "encaminhar_advogado": Requer análise especializada
   - "arquivar": Não é caso para o escritório

FORMATO DE RESPOSTA (JSON):
{
    "nome": "string ou null",
    "telefone": "string ou null",
    "email": "string ou null",
    "tipo_caso": "string",
    "area_direito": "string",
    "urgencia": "baixa|media|alta|critica",
    "resumo": "string (máximo 200 caracteres)",
    "proxima_acao": "agendar_consulta|solicitar_informacoes|encaminhar_advogado|arquivar",
    "score": 0-100,
    "justificativa_score": "string"
}

IMPORTANTE:
- Seja objetivo e profissional
- Extraia apenas informações explícitas na mensagem
- Use "null" para campos não mencionados
- O resumo deve ser claro e conciso
"""
    
    async def qualify_lead(
        self,
        message: str,
        contact_info: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """
        Qualify a lead from initial message.
        
        Args:
            message: Lead's message text
            contact_info: Optional contact information from Chatwit
        
        Returns:
            Dictionary with lead qualification data:
            - nome: Full name or None
            - telefone: Phone or None
            - email: Email or None
            - tipo_caso: Case type description
            - area_direito: Legal area
            - urgencia: Urgency level (baixa, media, alta, critica)
            - resumo: Brief summary
            - proxima_acao: Recommended next action
            - score: Lead score (0-100)
            - justificativa_score: Score justification
        """
        context = {}
        
        if contact_info:
            context["contact"] = contact_info
        
        logger.info(
            "Qualifying lead",
            extra={
                "tenant_id": str(self.tenant_id),
                "message_length": len(message),
                "has_contact_info": bool(contact_info),
            },
        )
        
        prompt = f"Analise esta mensagem de lead:\n\n{message}"
        
        response = await self.execute(
            user_message=prompt,
            context=context,
            temperature=0.3,  # Lower temperature for more consistent extraction
        )
        
        # Parse JSON response
        try:
            result = self.parse_json_response(response)
            
            logger.info(
                "Lead qualified",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "urgencia": result.get("urgencia"),
                    "score": result.get("score"),
                    "proxima_acao": result.get("proxima_acao"),
                },
            )
            
            return result
        
        except ValueError as e:
            logger.error(
                "Failed to parse lead qualification response",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "error": str(e),
                },
            )
            
            # Return default response on parse error
            return {
                "nome": None,
                "telefone": None,
                "email": None,
                "tipo_caso": "Não identificado",
                "area_direito": "Geral",
                "urgencia": "media",
                "resumo": message[:200],
                "proxima_acao": "solicitar_informacoes",
                "score": 50,
                "justificativa_score": "Erro ao processar mensagem",
            }
    
    async def extract_entities(
        self,
        message: str,
    ) -> dict[str, Optional[str]]:
        """
        Extract named entities from message.
        
        Args:
            message: Text to analyze
        
        Returns:
            Dictionary with extracted entities:
            - nome: Person name
            - telefone: Phone number
            - email: Email address
            - cpf: CPF if mentioned
        """
        prompt = f"""Extraia as seguintes entidades desta mensagem:
- Nome completo
- Telefone
- Email
- CPF

Mensagem:
{message}

Responda em JSON:
{{
    "nome": "string ou null",
    "telefone": "string ou null",
    "email": "string ou null",
    "cpf": "string ou null"
}}
"""
        
        response = await self.execute(
            user_message=prompt,
            temperature=0.1,  # Very low temperature for extraction
        )
        
        try:
            return self.parse_json_response(response)
        except ValueError:
            return {
                "nome": None,
                "telefone": None,
                "email": None,
                "cpf": None,
            }
    
    async def classify_urgency(
        self,
        message: str,
        case_type: Optional[str] = None,
    ) -> str:
        """
        Classify urgency level of a message.
        
        Args:
            message: Message text
            case_type: Optional case type for context
        
        Returns:
            Urgency level: "baixa", "media", "alta", or "critica"
        """
        context = {}
        if case_type:
            context["case_type"] = case_type
        
        prompt = f"""Classifique a urgência desta mensagem em uma das categorias:
- critica: Prazos iminentes, emergências
- alta: Requer atenção rápida
- media: Importante mas sem urgência
- baixa: Consulta geral

Mensagem:
{message}

Responda apenas com a categoria (critica, alta, media ou baixa).
"""
        
        response = await self.execute(
            user_message=prompt,
            context=context,
            temperature=0.2,
        )
        
        # Extract urgency from response
        response = response.strip().lower()
        
        if "critica" in response or "crítica" in response:
            return "critica"
        elif "alta" in response:
            return "alta"
        elif "baixa" in response:
            return "baixa"
        else:
            return "media"
