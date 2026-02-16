/**
 * Verifica se uma string é uma URL válida
 * @param url String a ser validada como URL
 * @returns true se for uma URL válida, false caso contrário
 */
export function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch (e) {
		return false;
	}
}

/**
 * Sanitiza uma URL para evitar possíveis vulnerabilidades
 * @param url URL a ser sanitizada
 * @returns URL sanitizada ou null se for inválida
 */
export function sanitizeUrl(url: string): string | null {
	if (!isValidUrl(url)) {
		return null;
	}

	// Remove caracteres potencialmente perigosos
	const sanitized = url.replace(/[^\w\s:/.?=&%\-_~#@!$'()*+,;[\]]/gi, "").trim();

	// Verifica se a URL começa com http:// ou https://
	if (!sanitized.startsWith("http://") && !sanitized.startsWith("https://")) {
		return null;
	}

	return sanitized;
}

/**
 * Extrai o nome do arquivo de uma URL
 * @param url - URL da qual extrair o nome do arquivo
 * @returns string - Nome do arquivo ou null se inválido
 */
export function getFileNameFromUrl(url: string): string | null {
	if (!isValidUrl(url)) return null;

	try {
		const urlObj = new URL(url);
		const pathname = urlObj.pathname;

		// Pega o último segmento do pathname como nome do arquivo
		const segments = pathname.split("/").filter(Boolean);
		return segments.length > 0 ? segments[segments.length - 1] : null;
	} catch (error) {
		return null;
	}
}
