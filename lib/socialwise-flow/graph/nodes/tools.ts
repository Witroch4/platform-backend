// lib/socialwise-flow/graph/nodes/tools.ts
// Optional tools/RAG node (not wired yet). Keeps future-ready hooks for retrieval and ops facts.
import type { AgentStateSchema } from '../state';
import { getAvailableTools, executeRetrievalTool } from '@/lib/ai-tools/retrieval-tools';
import { createLogger } from '@/lib/utils/logger';

const log = createLogger('Graph-Node:Tools');

export interface ToolCallRequest {
  name: string;
  parameters: any;
}

export async function toolsNode(state: AgentStateSchema & { toolCalls?: ToolCallRequest[] }): Promise<Partial<AgentStateSchema>> {
  const { context } = state;

  // Detect available tools (simple heuristics; replace with DB-backed flags later)
  const available = getAvailableTools({ hasBusinessInfo: true, hasIntents: true, hasDocuments: true });
  if (!available.length || !state.toolCalls || !state.toolCalls.length) {
    return {};
  }

  const outputs: string[] = [];
  for (const call of state.toolCalls) {
    try {
      const out = await executeRetrievalTool(call.name, call.parameters, {
        userId: context.userId || '',
        assistantId: context.assistantId,
        accountId: context.chatwitAccountId
      });
      outputs.push(`Tool ${call.name}:\n${out}`);
    } catch (e: any) {
      log.warn('Tool execution failed', { name: call.name, err: e?.message || String(e) });
    }
  }

  // For now, just log; future versions can feed this back into synthesis
  if (outputs.length) {
    log.info('Tools executed', { count: outputs.length });
  }
  return {};
}

