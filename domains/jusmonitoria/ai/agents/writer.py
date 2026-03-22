"""Agente Redator - Document drafting and writing."""

import logging
from typing import Any, Literal, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.ai.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class RedatorAgent(BaseAgent):
    """
    Agente Redator - Document Writing Agent.
    
    Responsibilities:
    - Generate summaries of movements
    - Create personalized briefings
    - Translate legal jargon to simple language
    - Adapt tone for audience (client vs lawyer)
    - Draft legal documents
    
    Validates: Requirements 2.8, 2.9
    """
    
    def get_agent_name(self) -> str:
        return "Redator"
    
    def get_system_prompt(self) -> str:
        return """Você é um advogado especializado em redação jurídica.

Sua função é redigir documentos jurídicos e comunicações com:
1. Linguagem técnica apropriada quando necessário
2. Clareza e objetividade
3. Adaptação ao público-alvo
4. Estrutura formal correta

TIPOS DE DOCUMENTOS:
- Resumos de movimentações
- Briefings executivos
- Comunicações para clientes
- Minutas de petições
- Pareceres técnicos

PRINCÍPIOS:
- Clareza acima de tudo
- Precisão técnica quando necessário
- Empatia com o cliente
- Profissionalismo constante

ADAPTAÇÃO DE TOM:
- Cliente: Linguagem acessível, empática, explicativa
- Advogado: Linguagem técnica, objetiva, precisa
- Executivo: Resumido, estratégico, focado em ações
"""
    
    async def generate_movement_summary(
        self,
        movements: list[dict[str, Any]],
        audience: Literal["cliente", "advogado"] = "cliente",
        max_length: int = 300,
    ) -> str:
        """
        Generate summary of process movements.
        
        Args:
            movements: List of movement dictionaries
            audience: Target audience (cliente or advogado)
            max_length: Maximum summary length in characters
        
        Returns:
            Summary text adapted for audience
        """
        logger.info(
            "Generating movement summary",
            extra={
                "tenant_id": str(self.tenant_id),
                "movement_count": len(movements),
                "audience": audience,
            },
        )
        
        movements_text = self._format_movements(movements)
        
        if audience == "cliente":
            prompt = f"""Resuma estas movimentações processuais para um cliente (linguagem simples):

{movements_text}

Requisitos:
- Máximo {max_length} caracteres
- Linguagem acessível (sem juridiquês)
- Destaque o que é importante para o cliente
- Tom empático e tranquilizador
- Explique termos técnicos se necessário
"""
        else:  # advogado
            prompt = f"""Resuma estas movimentações processuais para um advogado:

{movements_text}

Requisitos:
- Máximo {max_length} caracteres
- Linguagem técnica apropriada
- Destaque pontos estratégicos
- Mencione prazos e ações necessárias
"""
        
        response = await self.execute(
            user_message=prompt,
            temperature=0.6,
            max_tokens=150,
            use_case="document",
        )
        
        # Truncate if needed
        if len(response) > max_length:
            response = response[:max_length-3] + "..."
        
        return response.strip()
    
    def _format_movements(self, movements: list[dict[str, Any]]) -> str:
        """Format movements for LLM."""
        formatted = []
        
        for mov in movements:
            date_str = mov.get("date", "")
            description = mov.get("description", "")
            movement_type = mov.get("type", "")
            
            line = f"- {date_str}"
            if movement_type:
                line += f" [{movement_type}]"
            line += f": {description}"
            
            formatted.append(line)
        
        return "\n".join(formatted)
    
    async def create_briefing(
        self,
        client_name: str,
        processes: list[dict[str, Any]],
        period: str = "últimas 24 horas",
    ) -> str:
        """
        Create personalized briefing for client.
        
        Args:
            client_name: Client's name
            processes: List of process dictionaries with movements
            period: Time period covered
        
        Returns:
            Formatted briefing text
        """
        logger.info(
            "Creating briefing",
            extra={
                "tenant_id": str(self.tenant_id),
                "client": client_name,
                "process_count": len(processes),
            },
        )
        
        # Format process information
        processes_text = []
        for proc in processes:
            cnj = proc.get("cnj_number", "N/A")
            movements = proc.get("movements", [])
            
            if movements:
                mov_text = self._format_movements(movements)
                processes_text.append(f"Processo {cnj}:\n{mov_text}")
        
        all_processes = "\n\n".join(processes_text)
        
        prompt = f"""Crie um briefing personalizado para o cliente {client_name}.

Período: {period}

Atualizações:
{all_processes}

O briefing deve:
1. Começar com saudação personalizada
2. Resumir as atualizações de forma clara
3. Destacar pontos importantes
4. Indicar próximos passos se houver
5. Encerrar de forma profissional

Use linguagem acessível e tom empático.
"""
        
        response = await self.execute(
            user_message=prompt,
            temperature=0.7,
            use_case="document",
        )
        
        return response.strip()
    
    async def translate_legal_jargon(
        self,
        legal_text: str,
        add_explanations: bool = True,
    ) -> str:
        """
        Translate legal jargon to simple language.
        
        Args:
            legal_text: Text with legal terminology
            add_explanations: Whether to add explanations of technical terms
        
        Returns:
            Simplified text
        
        Validates: Requirement 2.9
        """
        logger.info(
            "Translating legal jargon",
            extra={
                "tenant_id": str(self.tenant_id),
                "text_length": len(legal_text),
                "add_explanations": add_explanations,
            },
        )
        
        if add_explanations:
            prompt = f"""Traduza este texto jurídico para linguagem simples:

{legal_text}

Requisitos:
- Use linguagem acessível
- Mantenha a precisão do significado
- Adicione explicações breves de termos técnicos entre parênteses
- Seja claro e objetivo

Exemplo:
"O réu foi citado" → "O réu foi oficialmente informado sobre o processo (citação é a notificação formal)"
"""
        else:
            prompt = f"""Traduza este texto jurídico para linguagem simples:

{legal_text}

Requisitos:
- Use linguagem acessível
- Mantenha a precisão do significado
- Não use termos técnicos sem necessidade
- Seja claro e objetivo
"""
        
        response = await self.execute(
            user_message=prompt,
            temperature=0.5,
            use_case="document",
        )
        
        return response.strip()
    
    async def adapt_tone(
        self,
        text: str,
        target_audience: Literal["cliente", "advogado", "executivo"],
    ) -> str:
        """
        Adapt text tone for specific audience.
        
        Args:
            text: Original text
            target_audience: Target audience type
        
        Returns:
            Text adapted for audience
        """
        audience_instructions = {
            "cliente": "Linguagem simples, empática e explicativa. Evite termos técnicos.",
            "advogado": "Linguagem técnica, objetiva e precisa. Use terminologia jurídica apropriada.",
            "executivo": "Linguagem resumida, estratégica e focada em ações. Destaque impactos e decisões.",
        }
        
        instruction = audience_instructions.get(target_audience, audience_instructions["cliente"])
        
        prompt = f"""Adapte este texto para {target_audience}:

{text}

Instruções: {instruction}
"""
        
        response = await self.execute(
            user_message=prompt,
            temperature=0.6,
            use_case="document",
        )
        
        return response.strip()
    
    async def draft_document(
        self,
        document_type: str,
        case_info: dict[str, Any],
        instructions: str,
    ) -> str:
        """
        Draft legal document.
        
        Args:
            document_type: Type of document (petição, contestação, etc.)
            case_info: Case information
            instructions: Specific instructions for the document
        
        Returns:
            Drafted document text
        """
        logger.info(
            "Drafting document",
            extra={
                "tenant_id": str(self.tenant_id),
                "document_type": document_type,
            },
        )
        
        context = {
            "case": case_info,
        }
        
        prompt = f"""Redija um(a) {document_type} com base nas seguintes informações:

Instruções específicas:
{instructions}

Informações do caso:
- Número do processo: {case_info.get('cnj_number', 'N/A')}
- Tribunal: {case_info.get('court', 'N/A')}
- Partes: {case_info.get('parties', 'N/A')}
- Descrição: {case_info.get('description', 'N/A')}

O documento deve:
1. Seguir estrutura formal apropriada
2. Incluir fundamentação legal
3. Ser claro e objetivo
4. Ter linguagem técnica apropriada
"""
        
        response = await self.execute(
            user_message=prompt,
            context=context,
            temperature=0.7,
            max_tokens=2000,
            use_case="document",
        )
        
        return response.strip()
    
    async def generate_executive_summary(
        self,
        data: dict[str, Any],
        focus_areas: Optional[list[str]] = None,
    ) -> str:
        """
        Generate executive summary.
        
        Args:
            data: Data to summarize
            focus_areas: Optional list of areas to focus on
        
        Returns:
            Executive summary text
        """
        focus_text = ""
        if focus_areas:
            focus_text = f"\nFocar em: {', '.join(focus_areas)}"
        
        prompt = f"""Gere um resumo executivo dos seguintes dados:

{data}
{focus_text}

O resumo deve:
- Ser conciso (máximo 300 palavras)
- Destacar pontos-chave
- Incluir métricas importantes
- Indicar ações recomendadas
- Usar linguagem estratégica
"""
        
        response = await self.execute(
            user_message=prompt,
            temperature=0.6,
            max_tokens=400,
            use_case="document",
        )
        
        return response.strip()
