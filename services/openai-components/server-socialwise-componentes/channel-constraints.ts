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
			bodyMax: 1000,
			buttonTitleMax: 20,
			payloadMax: 1000,
			maxButtons: 13,
			titleWordMax: 4,
		};
	}
	// facebook / genérico
	return {
		bodyMax: 1000,
		buttonTitleMax: 20,
		payloadMax: 1000,
		maxButtons: 13,
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
			response_text: z.string().min(1, "mín 1").max(bodyMax, `máx ${bodyMax} caracteres`),
			// mínimo 2 botões, máximo conforme canal (3 no WhatsApp; 13 em IG/FB)
			buttons: z.array(Btn).min(2).max(maxButtons),
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
			response_text: z.string().min(3, "mín 3").max(bodyMax, `máx ${bodyMax} caracteres`),
			// Botões são obrigatórios para facilitar interação - mínimo 2, máximo conforme canal
			// WhatsApp: 3; Instagram/Facebook: até 13
			buttons: z.array(Btn).min(2).max(maxButtons),
		})
		.strict();
}

/**
 * Schema relaxado para fallback de providers (Gemini/Claude via generateObject).
 *
 * Objetivo: aceitar respostas que o schema estrito rejeitaria, mas que são
 * "quase certas". O caller DEVE aplicar coerceLengths() na saída para
 * garantir que os limites reais do canal (buttonTitleMax, maxButtons, bodyMax)
 * sejam respeitados antes de entregar ao Chatwit/WhatsApp.
 *
 * Diferenças vs strict:
 * - buttons min(0) (respeita agent instructions que pedem poucos botões)
 * - bodyMax com margem (aceita texto levemente acima — coerceLengths trunca depois)
 * - maxButtons com margem (aceita extras — coerceLengths corta depois)
 * - button title com margem (aceita títulos levemente longos — coerceLengths trunca depois)
 * - Sem .strict() (tolera campos extras que o modelo invente)
 */
export function createRelaxedRouterSchema(channel: ChannelType) {
	const { bodyMax, buttonTitleMax, payloadMax, maxButtons } = getConstraintsForChannel(channel);

	// Botão relaxado: aceita títulos até buttonTitleMax+10 (coerceLengths trunca pra 20)
	const titleRegex = new RegExp(`^.{1,${buttonTitleMax + 10}}$`, "u");
	const payloadRegex = new RegExp(`^(|@[a-z0-9_]{1,${payloadMax}})$`, "u");
	const BtnRelaxed = z.object({
		title: z.string().regex(titleRegex),
		payload: z.string().regex(payloadRegex),
	});

	return z.object({
		mode: z.enum(["intent", "chat"]),
		intent_payload: z.string().regex(/^(|@[a-z0-9_]+)$/u),
		// Aceita até 2x bodyMax — coerceLengths() trunca pra bodyMax real
		response_text: z.string().min(1).max(bodyMax * 2),
		// Aceita 0 a maxButtons+2 — coerceLengths() corta pro máximo real do canal
		buttons: z.array(BtnRelaxed).min(0).max(maxButtons + 2),
	});
}
