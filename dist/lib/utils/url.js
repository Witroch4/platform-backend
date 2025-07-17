"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidUrl = isValidUrl;
exports.sanitizeUrl = sanitizeUrl;
exports.getFileNameFromUrl = getFileNameFromUrl;
/**
 * Verifica se uma string é uma URL válida
 * @param url String a ser validada como URL
 * @returns true se for uma URL válida, false caso contrário
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    }
    catch (e) {
        return false;
    }
}
/**
 * Sanitiza uma URL para evitar possíveis vulnerabilidades
 * @param url URL a ser sanitizada
 * @returns URL sanitizada ou null se for inválida
 */
function sanitizeUrl(url) {
    if (!isValidUrl(url)) {
        return null;
    }
    // Remove caracteres potencialmente perigosos
    let sanitized = url
        .replace(/[^\w\s:/.?=&%\-_~#@!$'()*+,;[\]]/gi, '')
        .trim();
    // Verifica se a URL começa com http:// ou https://
    if (!sanitized.startsWith('http://') && !sanitized.startsWith('https://')) {
        return null;
    }
    return sanitized;
}
/**
 * Extrai o nome do arquivo de uma URL
 * @param url - URL da qual extrair o nome do arquivo
 * @returns string - Nome do arquivo ou null se inválido
 */
function getFileNameFromUrl(url) {
    if (!isValidUrl(url))
        return null;
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        // Pega o último segmento do pathname como nome do arquivo
        const segments = pathname.split('/').filter(Boolean);
        return segments.length > 0 ? segments[segments.length - 1] : null;
    }
    catch (error) {
        return null;
    }
}
