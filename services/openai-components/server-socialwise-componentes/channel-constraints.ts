// services/openai-components/channel-constraints.ts
import { z } from "zod";
import { ChannelType } from "../types";

export interface ChannelConstraints {
  bodyMax: number;
  buttonTitleMax: number;
  payloadMax: number;
  maxButtons: number;
  titleWordMax: number;
}

/** Helper para limites por canal */
export function getConstraintsForChannel(channel: ChannelType): ChannelConstraints {
  if (channel === "whatsapp") {
    return {
      bodyMax: 1024,
      buttonTitleMax: 20,
      payloadMax: 256,
      maxButtons: 3,
      titleWordMax: 4,
    };
  }
  if (channel === "instagram") {
    return {
      bodyMax: 640,
      buttonTitleMax: 20,
      payloadMax: 1000,
      maxButtons: 3,
      titleWordMax: 4,
    };
  }
  // facebook / genérico
  return {
    bodyMax: 640,
    buttonTitleMax: 20,
    payloadMax: 1000,
    maxButtons: 3,
    titleWordMax: 4,
  };
}

/** Factory de schema de botão por canal (evita allOf/anyOf) */
export function createButtonSchemaForChannel(channel: ChannelType) {
  const { buttonTitleMax, payloadMax } = getConstraintsForChannel(channel);
  
  // Usar apenas regex para evitar allOf - não combinar múltiplas validações
  const titleRegex = new RegExp(`^.{1,${buttonTitleMax}}$`, "u");
  // Permitir string vazia OU formato @slug para payload
  const payloadRegex = new RegExp(`^(|@[a-z0-9_]{1,${payloadMax}})$`, "u");
  
  return z
    .object({
      title: z.string().regex(titleRegex, `máx ${buttonTitleMax} caracteres`),
      // Para evitar anyOf, usar string com default vazio em vez de nullable
      payload: z.string().regex(payloadRegex, `formato @slug ou vazio`).default(""),
    })
    .strict();
}

/** Schema Zod para botões de warmup/freechat (compatível com Structured Outputs) */
export function createButtonsSchema(channel: ChannelType) {
  const { bodyMax, maxButtons } = getConstraintsForChannel(channel);
  const Btn = createButtonSchemaForChannel(channel);
  
  return z
    .object({
      response_text: z
        .string()
        .regex(new RegExp(`^.{1,${bodyMax}}$`, "u"), `máx ${bodyMax} caracteres`),
      buttons: z.array(Btn).min(1).max(maxButtons),
    })
    .strict();
}

/** Schema Zod para decisão do router (compatível com Structured Outputs) */
export function createRouterSchema(channel: ChannelType) {
  const { bodyMax, maxButtons } = getConstraintsForChannel(channel);
  const Btn = createButtonSchemaForChannel(channel);
  
  return z
    .object({
      mode: z.enum(["intent", "chat"]),
      // Para evitar anyOf, usar string com default vazio em vez de nullable
      // Permitir string vazia OU formato @slug
      intent_payload: z
        .string()
        .regex(/^(|@[a-z0-9_]+)$/u)
        .default(""),
      // response_text é obrigatório e deve ser útil em ambos os modos
      response_text: z
        .string()
        .min(3, "texto muito curto")
        .regex(new RegExp(`^.{3,${bodyMax}}$`, "u"), `mín 3, máx ${bodyMax} caracteres`),
      // Botões são obrigatórios para facilitar interação - mínimo 2, máximo 3
      buttons: z.array(Btn).min(2).max(3),
    })
    .strict();
}