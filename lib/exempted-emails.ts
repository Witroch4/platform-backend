// lib/exempted-emails.ts
// Arquivo puro sem dependências servidor - pode ser usado em Client Components

// Lista de emails com acesso liberado
export const EXEMPTED_EMAILS = ["amandasousa22.adv@gmail.com", "witalorocha216@gmail.com", "witalo_rocha@outlook.com"];

/**
 * Verifica se o email está na lista de exceções
 * Pode ser usado em Client Components
 */
export function isExemptedEmail(email: string): boolean {
	return EXEMPTED_EMAILS.includes(email);
}
