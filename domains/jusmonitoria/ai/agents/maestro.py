"""Agente Maestro - Orchestrator using LangGraph."""

import logging
from typing import Annotated, Any, Literal, Optional, Sequence, TypedDict
from uuid import UUID

import operator
from langgraph.graph import END, START, StateGraph
from sqlalchemy.ext.asyncio import AsyncSession

from domains.jusmonitoria.ai.agents.base_agent import BaseAgent
from domains.jusmonitoria.ai.agents.investigator import InvestigadorAgent
from domains.jusmonitoria.ai.agents.triage import TriagemAgent
from domains.jusmonitoria.ai.agents.writer import RedatorAgent

logger = logging.getLogger(__name__)


class AgentState(TypedDict):
    """State shared between agents in the workflow."""
    
    messages: Annotated[Sequence[str], operator.add]
    current_agent: str
    task_type: str
    context: dict[str, Any]
    result: Optional[dict[str, Any]]
    next_action: Optional[str]
    iteration_count: int


class MaestroAgent(BaseAgent):
    """
    Agente Maestro - Workflow Orchestrator.
    
    Coordinates multiple specialized agents using LangGraph:
    - Routes tasks to appropriate agents
    - Manages workflow state
    - Implements conditional routing
    - Handles refinement loops
    - Consolidates results
    
    Workflow: Triagem -> Investigação -> Redação
    
    Validates: Requirements 2.7, 2.8
    """
    
    def __init__(
        self,
        session: AsyncSession,
        tenant_id: UUID,
    ):
        """
        Initialize Maestro agent.
        
        Args:
            session: Database session
            tenant_id: Tenant ID for isolation
        """
        super().__init__(session, tenant_id)
        
        # Initialize specialized agents
        self.triagem = TriagemAgent(session, tenant_id)
        self.investigador = InvestigadorAgent(session, tenant_id)
        self.redator = RedatorAgent(session, tenant_id)
        
        # Build LangGraph workflow
        self.graph = self._build_graph()
    
    def get_agent_name(self) -> str:
        return "Maestro"
    
    def get_system_prompt(self) -> str:
        return """Você é o coordenador de uma equipe de assistentes jurídicos especializados.

AGENTES DISPONÍVEIS:
1. Triagem: Qualifica leads, extrai informações, classifica urgência
2. Investigador: Analisa processos, identifica padrões, detecta prazos
3. Redator: Gera resumos, cria briefings, traduz juridiquês

SUA FUNÇÃO:
1. Entender a solicitação do usuário
2. Decidir qual agente deve atuar
3. Coordenar múltiplos agentes se necessário
4. Consolidar resultados
5. Determinar se precisa de mais informações

DECISÕES:
- "triagem": Para qualificação de leads
- "investigador": Para análise de processos
- "redator": Para geração de documentos
- "none": Quando a tarefa está completa

RESPONDA EM JSON:
{
    "agent": "triagem|investigador|redator|none",
    "reasoning": "string (explicação da decisão)",
    "needs_more_info": boolean,
    "confidence": 0.0-1.0
}
"""
    
    def _build_graph(self) -> StateGraph:
        """
        Build LangGraph workflow.
        
        Creates a state graph with:
        - Entry point: maestro decision node
        - Agent nodes: triagem, investigador, redator
        - Conditional routing based on maestro decisions
        - Loop back to maestro for multi-step workflows
        """
        workflow = StateGraph(AgentState)
        
        # Add nodes
        workflow.add_node("maestro", self._maestro_node)
        workflow.add_node("triagem", self._triagem_node)
        workflow.add_node("investigador", self._investigador_node)
        workflow.add_node("redator", self._redator_node)
        
        # Set entry point
        workflow.add_edge(START, "maestro")
        
        # Add conditional edges from maestro
        workflow.add_conditional_edges(
            "maestro",
            self._route_decision,
            {
                "triagem": "triagem",
                "investigador": "investigador",
                "redator": "redator",
                "end": END,
            },
        )
        
        # All agents return to maestro for next decision
        workflow.add_edge("triagem", "maestro")
        workflow.add_edge("investigador", "maestro")
        workflow.add_edge("redator", "maestro")
        
        return workflow.compile()
    
    async def _maestro_node(self, state: AgentState) -> AgentState:
        """
        Maestro decision node.
        
        Analyzes current state and decides next action.
        """
        logger.info(
            "Maestro making decision",
            extra={
                "tenant_id": str(self.tenant_id),
                "iteration": state["iteration_count"],
                "current_agent": state["current_agent"],
            },
        )
        
        # Check iteration limit to prevent infinite loops
        if state["iteration_count"] >= 5:
            logger.warning(
                "Max iterations reached",
                extra={"tenant_id": str(self.tenant_id)},
            )
            state["next_action"] = "none"
            return state
        
        # Get last message
        last_message = state["messages"][-1] if state["messages"] else ""
        
        # Build decision prompt
        prompt = f"""Tarefa: {state['task_type']}
Iteração: {state['iteration_count']}
Agente anterior: {state['current_agent']}
Última mensagem: {last_message}

Resultado atual: {state.get('result')}

Decida qual agente deve atuar a seguir ou se a tarefa está completa.
"""
        
        try:
            decision_text = await self.execute(
                user_message=prompt,
                context=state["context"],
                temperature=0.3,
            )
            
            decision = self.parse_json_response(decision_text)
            
            state["next_action"] = decision.get("agent", "none")
            state["messages"].append(
                f"Maestro: {decision.get('reasoning', 'Decisão tomada')}"
            )
            
            logger.info(
                "Maestro decision made",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "next_action": state["next_action"],
                    "confidence": decision.get("confidence"),
                },
            )
        
        except Exception as e:
            logger.error(
                "Maestro decision failed",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "error": str(e),
                },
            )
            # Default to ending on error
            state["next_action"] = "none"
        
        return state
    
    async def _triagem_node(self, state: AgentState) -> AgentState:
        """Triagem agent node."""
        logger.info(
            "Executing Triagem agent",
            extra={"tenant_id": str(self.tenant_id)},
        )
        
        try:
            # Get message to analyze
            message = state["context"].get("message", "")
            contact_info = state["context"].get("contact", {})
            
            # Qualify lead
            result = await self.triagem.qualify_lead(
                message=message,
                contact_info=contact_info,
            )
            
            state["result"] = result
            state["current_agent"] = "triagem"
            state["iteration_count"] += 1
            state["messages"].append("Triagem: Lead qualificado")
        
        except Exception as e:
            logger.error(
                "Triagem agent failed",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "error": str(e),
                },
            )
            state["messages"].append(f"Triagem: Erro - {str(e)}")
        
        return state
    
    async def _investigador_node(self, state: AgentState) -> AgentState:
        """Investigador agent node."""
        logger.info(
            "Executing Investigador agent",
            extra={"tenant_id": str(self.tenant_id)},
        )
        
        try:
            process_info = state["context"].get("process", {})
            movements = state["context"].get("movements", [])
            
            # Analyze movements
            result = await self.investigador.analyze_movements(
                process_info=process_info,
                movements=movements,
            )
            
            state["result"] = result
            state["current_agent"] = "investigador"
            state["iteration_count"] += 1
            state["messages"].append("Investigador: Análise concluída")
        
        except Exception as e:
            logger.error(
                "Investigador agent failed",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "error": str(e),
                },
            )
            state["messages"].append(f"Investigador: Erro - {str(e)}")
        
        return state
    
    async def _redator_node(self, state: AgentState) -> AgentState:
        """Redator agent node."""
        logger.info(
            "Executing Redator agent",
            extra={"tenant_id": str(self.tenant_id)},
        )
        
        try:
            task_type = state["task_type"]
            
            if "briefing" in task_type.lower():
                # Generate briefing
                client_name = state["context"].get("client_name", "Cliente")
                processes = state["context"].get("processes", [])
                
                result = await self.redator.create_briefing(
                    client_name=client_name,
                    processes=processes,
                )
                
                state["result"] = {"briefing": result}
            
            elif "resumo" in task_type.lower():
                # Generate summary
                movements = state["context"].get("movements", [])
                audience = state["context"].get("audience", "cliente")
                
                result = await self.redator.generate_movement_summary(
                    movements=movements,
                    audience=audience,
                )
                
                state["result"] = {"summary": result}
            
            elif "traduzir" in task_type.lower():
                # Translate legal jargon
                legal_text = state["context"].get("legal_text", "")
                
                result = await self.redator.translate_legal_jargon(
                    legal_text=legal_text,
                )
                
                state["result"] = {"translated": result}
            
            else:
                # Generic document drafting
                document_type = state["context"].get("document_type", "documento")
                case_info = state["context"].get("case", {})
                instructions = state["context"].get("instructions", "")
                
                result = await self.redator.draft_document(
                    document_type=document_type,
                    case_info=case_info,
                    instructions=instructions,
                )
                
                state["result"] = {"document": result}
            
            state["current_agent"] = "redator"
            state["iteration_count"] += 1
            state["messages"].append("Redator: Documento gerado")
        
        except Exception as e:
            logger.error(
                "Redator agent failed",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "error": str(e),
                },
            )
            state["messages"].append(f"Redator: Erro - {str(e)}")
        
        return state
    
    def _route_decision(self, state: AgentState) -> str:
        """
        Route to next agent based on maestro decision.
        
        Args:
            state: Current workflow state
        
        Returns:
            Next node name or "end"
        """
        next_action = state.get("next_action", "none")
        
        if next_action in ["triagem", "investigador", "redator"]:
            return next_action
        
        return "end"
    
    async def execute_workflow(
        self,
        task_type: str,
        initial_message: str,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Execute complete workflow.
        
        Args:
            task_type: Type of task (e.g., "qualificar_lead", "analisar_processo")
            initial_message: Initial message/query
            context: Context dictionary with relevant data
        
        Returns:
            Final result dictionary
        """
        logger.info(
            "Starting workflow",
            extra={
                "tenant_id": str(self.tenant_id),
                "task_type": task_type,
            },
        )
        
        # Initialize state
        initial_state: AgentState = {
            "messages": [initial_message],
            "current_agent": "maestro",
            "task_type": task_type,
            "context": context,
            "result": None,
            "next_action": None,
            "iteration_count": 0,
        }
        
        try:
            # Execute workflow
            final_state = await self.graph.ainvoke(initial_state)
            
            logger.info(
                "Workflow completed",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "iterations": final_state["iteration_count"],
                    "final_agent": final_state["current_agent"],
                },
            )
            
            return final_state.get("result", {})
        
        except Exception as e:
            logger.error(
                "Workflow failed",
                extra={
                    "tenant_id": str(self.tenant_id),
                    "task_type": task_type,
                    "error": str(e),
                },
            )
            raise
