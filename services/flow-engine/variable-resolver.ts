/**
 * VariableResolver — Resolução de {{variáveis}} em textos
 *
 * Substitui placeholders `{{nomeVariável}}` pelo valor correspondente
 * no contexto de execução do flow (variáveis da sessão + contato + sistema).
 *
 * @see docs/interative_message_flow_builder.md §14.4
 */

import log from "@/lib/log";
import type { DeliveryContext } from "@/types/flow-engine";

// Regex: captura conteúdo entre {{ e }}, ignorando espaços internos
const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export class VariableResolver {
	private readonly context: DeliveryContext;
	private readonly sessionVars: Record<string, unknown>;

	constructor(context: DeliveryContext, sessionVariables: Record<string, unknown> = {}) {
		this.context = context;
		this.sessionVars = sessionVariables;
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * Resolve todas as `{{variáveis}}` em uma string.
	 * Variáveis não encontradas ficam inalteradas.
	 */
	resolve(template: string): string {
		if (!template || !template.includes("{{")) return template;

		return template.replace(VARIABLE_PATTERN, (_match, varName: string) => {
			const value = this.lookup(varName);
			if (value === undefined) {
				log.debug("[VariableResolver] Variável não encontrada, mantendo placeholder", { varName });
				return `{{${varName}}}`;
			}
			return String(value);
		});
	}

	/**
	 * Resolve variáveis em todos os campos string de um objeto (shallow).
	 */
	resolveObject<T extends Record<string, unknown>>(obj: T): T {
		const resolved = { ...obj };
		for (const [key, value] of Object.entries(resolved)) {
			if (typeof value === "string") {
				(resolved as Record<string, unknown>)[key] = this.resolve(value);
			}
		}
		return resolved;
	}

	/**
	 * Retorna todas as variáveis disponíveis (para UI de highlight / autocomplete).
	 */
	getAvailableVariables(): Array<{ name: string; value: string; source: string }> {
		const vars: Array<{ name: string; value: string; source: string }> = [];

		// Sistema
		vars.push(
			{ name: "system_timestamp", value: new Date().toISOString(), source: "system" },
			{ name: "system_date", value: new Date().toLocaleDateString("pt-BR"), source: "system" },
			{ name: "system_time", value: new Date().toLocaleTimeString("pt-BR"), source: "system" },
		);

		// Contato
		vars.push(
			{ name: "contact_name", value: this.context.contactName ?? "", source: "contact" },
			{ name: "contact_phone", value: this.context.contactPhone ?? "", source: "contact" },
			{ name: "contact_id", value: String(this.context.contactId), source: "contact" },
		);

		// Conversa
		vars.push(
			{ name: "conversation_id", value: String(this.context.conversationId), source: "conversation" },
			{ name: "conversation_channel", value: this.context.channelType ?? "", source: "conversation" },
			{ name: "conversation_inbox_id", value: String(this.context.inboxId), source: "conversation" },
		);

		// Variáveis da sessão
		for (const [key, value] of Object.entries(this.sessionVars)) {
			vars.push({
				name: key,
				value: value !== undefined && value !== null ? String(value) : "",
				source: "session",
			});
		}

		return vars;
	}

	/**
	 * Atualiza variável da sessão (usado por SET_VARIABLE node).
	 */
	setVariable(name: string, value: unknown): void {
		this.sessionVars[name] = value;
	}

	getVariable(name: string): unknown {
		return this.sessionVars[name];
	}

	/**
	 * Retorna uma cópia das variáveis da sessão (para persistir no Prisma).
	 */
	getSessionVariables(): Record<string, unknown> {
		return { ...this.sessionVars };
	}

	// ---------------------------------------------------------------------------
	// Lookup chain
	// ---------------------------------------------------------------------------

	private lookup(varName: string): unknown {
		// 1. Variáveis de sessão (maior prioridade)
		if (varName in this.sessionVars) {
			return this.sessionVars[varName];
		}

		// Normalizar: aceitar tanto dot notation (contact.name) quanto underscore (contact_name)
		const normalized = varName.includes("_") && !varName.includes(".")
			? varName.replace(/^(contact|conversation|system)_/, "$1.")
			: varName;

		// 2. Variáveis de contato (prefixo contact.)
		if (normalized.startsWith("contact.")) {
			return this.lookupContact(normalized.slice("contact.".length));
		}

		// 3. Variáveis de conversa (prefixo conversation.)
		if (normalized.startsWith("conversation.")) {
			return this.lookupConversation(normalized.slice("conversation.".length));
		}

		// 4. Variáveis de sistema (prefixo system.)
		if (normalized.startsWith("system.")) {
			return this.lookupSystem(normalized.slice("system.".length));
		}

		// 5. Fallback: buscar sem prefixo nas variáveis de sessão com dot notation
		return this.lookupNested(this.sessionVars, varName);
	}

	private lookupContact(field: string): unknown {
		const contactMap: Record<string, unknown> = {
			name: this.context.contactName,
			phone: this.context.contactPhone,
			id: this.context.contactId,
		};
		return contactMap[field];
	}

	private lookupConversation(field: string): unknown {
		const convMap: Record<string, unknown> = {
			id: this.context.conversationId,
			channel: this.context.channelType,
			inbox_id: this.context.inboxId,
			account_id: this.context.accountId,
		};
		return convMap[field];
	}

	private lookupSystem(field: string): unknown {
		const now = new Date();
		const systemMap: Record<string, unknown> = {
			timestamp: now.toISOString(),
			date: now.toLocaleDateString("pt-BR"),
			time: now.toLocaleTimeString("pt-BR"),
			epoch: now.getTime(),
		};
		return systemMap[field];
	}

	/**
	 * Resolve dot notation em objeto aninhado.
	 * Ex: `lookupNested({user: {name: "João"}}, "user.name")` → "João"
	 */
	private lookupNested(obj: Record<string, unknown>, path: string): unknown {
		const parts = path.split(".");
		let current: unknown = obj;

		for (const part of parts) {
			if (current === null || current === undefined || typeof current !== "object") {
				return undefined;
			}
			current = (current as Record<string, unknown>)[part];
		}

		return current;
	}
}
