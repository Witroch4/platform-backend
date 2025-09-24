// lib/socialwise-flow/graph/supervisor.ts
import { StateGraph, END, START } from '@langchain/langgraph';
import { AgentState, type AgentStateSchema } from './state';
import { classifyNode } from './nodes/classify';
import { gatingNode } from './nodes/gating';
import { reactAgentNode } from './nodes/react-agent';
import { routerNode } from './nodes/router';

/**
 * Build the SocialWise Flow orchestrator graph. Nodes mostly delegate to existing
 * functions to preserve logic, while enabling semantic gating and future tools/RAG.
 */
export function buildSocialWiseGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('classify', classifyNode)
    .addNode('gating', gatingNode)
    .addNode('react_agent', reactAgentNode)
    .addNode('router', routerNode)
    .addEdge(START, 'classify')
    .addEdge('classify', 'gating')
    .addConditionalEdges(
      'gating',
      (state: any) => {
        const band = state?.classification?.band;
        if (band === 'ROUTER') {
          return 'react_agent';
        }
        return 'router';
      },
      {
        react_agent: 'react_agent',
        router: 'router',
      }
    )
    .addEdge('react_agent', 'router')
    .addEdge('router', END)
    .compile();

  return graph;
}

export async function runSocialWiseGraph(initial: AgentStateSchema) {
  const app = buildSocialWiseGraph();
  const result = await app.invoke(initial);
  return result as AgentStateSchema;
}
