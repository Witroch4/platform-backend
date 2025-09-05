// services/openai-components/model-capabilities.ts
import { zodTextFormat } from "openai/helpers/zod";
import { AgentConfig } from "../types";

export interface ModelCapabilities {
  reasoning: boolean;    // Supports reasoning.effort
  structured: boolean;   // Supports Structured Outputs
  sampling: boolean;     // Supports temperature/top_p
  label: string;
}

const MODEL_CAPS: Record<string, ModelCapabilities> = {
  "gpt-5": { reasoning: true, structured: true, sampling: true, label: "GPT-5" },
  "gpt-5-nano": { reasoning: true, structured: true, sampling: false, label: "GPT-5 Nano" }, // Não suporta temperature com reasoning
  "gpt-4.1-nano": { reasoning: false, structured: true, sampling: true, label: "GPT-4.1 Nano" },
};

// ==== Helpers GPT-5 (case-insensitive) ====
export const isGPT5 = (m?: string): boolean => (m || "").toLowerCase().includes("gpt-5");

export const normEffort = (e?: string): "low" | "medium" | "high" =>
  e === "low" || e === "medium" || e === "high" ? e : "low"; // "minimal" => "low"

export const normVerb = (v?: string): "low" | "medium" | "high" =>
  v === "low" || v === "medium" || v === "high" ? v : "low";

// Get model capabilities with fallback
export function getModelCaps(model: string): ModelCapabilities {
  return MODEL_CAPS[model] ?? { 
    reasoning: false, 
    structured: true, 
    sampling: false, 
    label: model 
  };
}

// Resolve sampling preferences following the test route pattern
export function resolveSamplingPrefs(args: {
  caps: ModelCapabilities;
  agent: AgentConfig;
}): { temperature?: number; top_p?: number } | undefined {
  if (!args.caps.sampling) return undefined;

  const temperature = args.agent.tempCopy ?? args.agent.temperature;
  const top_p = args.agent.topP;

  // ⚠️ REGRA DA BÍBLIA:
  // Em modelos com reasoning, a API só aceita sampling "neutro".
  // Se o agente tem sampling configurado, normalize para { temperature:1, top_p:1 }.
  if (args.caps.reasoning) {
    const userAskedSampling = (temperature !== undefined && temperature !== null) || 
                             (top_p !== undefined && top_p !== null);
    if (userAskedSampling) {
      return { temperature: 1, top_p: 1 };
    }
    // Se o agente NÃO pediu sampling, não envie nada.
    return undefined;
  }

  // —— Comportamento para modelos sem reasoning ——
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const resolved: { temperature?: number; top_p?: number } = {
    temperature: (temperature !== undefined && temperature !== null) ? clamp(temperature, 0, 2) : 0.2, // default conservador
    top_p: (top_p !== undefined && top_p !== null) ? clamp(top_p, 0, 1) : undefined,
  };
  // Se nada setado de fato, não envie
  if (resolved.temperature === undefined && resolved.top_p === undefined) return undefined;
  return resolved;
}

// Mescla Structured Outputs + (opcional) verbosity do GPT-5
export function buildTextFormat<T>(schema: T, name: string, agent: AgentConfig) {
  const caps = getModelCaps(agent.model);
  const base: any = { format: zodTextFormat(schema as any, name) };
  
  // Só adiciona verbosity se o modelo suportar (GPT-5 family)
  if (caps.reasoning && isGPT5(agent.model)) {
    base.verbosity = normVerb((agent as any).verbosity);
  }
  
  return base;
}