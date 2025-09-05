// services/openai-components/server-socialwise.ts
// ==== ARQUIVO PAI - Re-exporta todas as funções dos módulos filhos ====

// Re-exportar funções de AI do módulo ai-functions
export {
  generateShortTitlesBatch,
  generateFreeChatButtons,
  generateWarmupButtons,
  routerLLM
} from "./ai-functions";

// Re-exportar utilitários dos módulos filhos para compatibilidade
export { structuredOrJson } from "./structured-outputs";
export { ensureSession } from "./session-manager";
export { buildMessages, createMasterPrompt } from "./prompt-manager";
export { getModelCaps, isGPT5, normEffort, normVerb } from "./model-capabilities";
export { 
  getConstraintsForChannel,
  createButtonsSchema,
  createRouterSchema 
} from "./channel-constraints";
