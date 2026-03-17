// =============================================================================
// Shared variable types and constants for the Flow Builder
// =============================================================================

export interface FlowBuilderVariable {
	name: string;
	label: string;
	description: string;
	category: "contact" | "conversation" | "system" | "custom" | "mtf" | "session";
	/** Resolved value for preview (only MTF vars have this at design time) */
	value?: string;
	/** Sub-category for MTF variables */
	subCategory?: "normal" | "lote" | "special";
}

// Static variables available in every flow
export const STATIC_FLOW_VARIABLES: FlowBuilderVariable[] = [
	// Contato
	{ name: "contact_name", label: "Nome do contato", description: "Nome do cliente", category: "contact" },
	{ name: "contact_phone", label: "Telefone", description: "Número do WhatsApp", category: "contact" },
	{ name: "contact_id", label: "ID do contato", description: "ID interno do contato", category: "contact" },
	// Conversa
	{ name: "conversation_id", label: "ID da conversa", description: "ID da conversa atual", category: "conversation" },
	{
		name: "conversation_channel",
		label: "Canal",
		description: "WhatsApp, Instagram, etc",
		category: "conversation",
	},
	{
		name: "conversation_inbox_id",
		label: "ID da caixa",
		description: "ID da caixa de entrada",
		category: "conversation",
	},
	// Sistema
	{ name: "system_date", label: "Data atual", description: "Data no formato DD/MM/YYYY", category: "system" },
	{ name: "system_time", label: "Hora atual", description: "Hora no formato HH:MM:SS", category: "system" },
	{ name: "system_timestamp", label: "Timestamp", description: "Data/hora ISO 8601", category: "system" },
];

// Special MTF variable (always available, resolved dynamically at send time)
export const SPECIAL_MTF_VARIABLES: FlowBuilderVariable[] = [
	{
		name: "nome_lead",
		label: "Nome do Lead",
		description: "Nome da pessoa que receberá a mensagem",
		category: "mtf",
		subCategory: "special",
	},
];

export const CATEGORY_LABELS: Record<string, string> = {
	contact: "Contato",
	conversation: "Conversa",
	system: "Sistema",
	custom: "Personalizadas",
	mtf: "MTF Diamante",
	session: "Variáveis de Sessão",
};

export const CATEGORY_COLORS: Record<string, string> = {
	contact: "border border-blue-300 bg-blue-200/90 text-blue-900 dark:border-blue-800/70 dark:bg-blue-900/30 dark:text-blue-300",
	conversation:
		"border border-violet-300 bg-violet-200/90 text-violet-900 dark:border-violet-800/70 dark:bg-violet-900/30 dark:text-violet-300",
	system: "border border-emerald-300 bg-emerald-200/90 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-900/30 dark:text-emerald-300",
	custom: "border border-orange-300 bg-orange-200/90 text-orange-900 dark:border-orange-800/70 dark:bg-orange-900/30 dark:text-orange-300",
	mtf: "border border-amber-300 bg-amber-200/90 text-amber-900 dark:border-amber-800/70 dark:bg-amber-900/30 dark:text-amber-300",
	session: "border border-cyan-300 bg-cyan-200/90 text-cyan-900 dark:border-cyan-800/70 dark:bg-cyan-900/30 dark:text-cyan-300",
};

// Regex to find {{variable}} patterns
export const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
