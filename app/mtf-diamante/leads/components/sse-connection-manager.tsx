"use client";

import type { LeadChatwit } from "../types";

interface SSEConnectionManagerProps {
	leads: LeadChatwit[];
	onLeadUpdate: (lead: LeadChatwit) => void;
	onForceRefresh?: () => void;
}

/**
 * Componente legado.
 * A conexão SSE agora é centralizada em `SSEUserConnection`.
 * Mantemos este wrapper vazio para evitar novas conexões por lead.
 */
export function SSEConnectionManager(_props: SSEConnectionManagerProps) {
	return null;
}
