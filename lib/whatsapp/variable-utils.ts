// lib/whatsapp/variable-utils.ts
export const extractVariables = (text: string): string[] => {
	if (!text) return [];
	const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
	return [...new Set(matches)];
};
