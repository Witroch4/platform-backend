// services/openai-components/server-socialwise.ts
// ==== ARQUIVO PAI - Re-exporta todas as funções dos módulos filhos ====

// Re-exportar funções de AI do módulo ai-functions
export {
	generateShortTitlesBatch,
	generateFreeChatButtons,
	generateWarmupButtons,
	routerLLM, // ← Agora usa a implementação nova do ai-functions
	sanitizeHintsWithDesc,
	type HintOut,
} from "./server-socialwise-componentes/ai-functions";

// REMOVIDO: Export antigo do router-llm.ts
// export { routerLLM } from "./server-socialwise-componentes/router-llm";

// Re-exportar utilitários dos módulos filhos para compatibilidade
export {
	structuredOrJson,
	stripCodeFences,
	removeNullBytes,
	coerceLengths,
	extractJsonLoose,
	sanitizeRawTextForJson,
} from "./server-socialwise-componentes/structured-outputs";
export { ensureSession } from "./server-socialwise-componentes/session-manager";
export { buildMessages, createMasterPrompt } from "./server-socialwise-componentes/prompt-manager";
export { getModelCaps, isGPT5, normEffort, normVerb } from "./server-socialwise-componentes/model-capabilities";
export {
	getConstraintsForChannel,
	createButtonsSchema,
	createRouterSchema,
} from "./server-socialwise-componentes/channel-constraints";
