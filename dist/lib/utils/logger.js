"use strict";
/**
 * Simples utilitário de log para debugar aplicações
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
/**
 * Cria um logger com um prefixo
 * @param prefix Prefixo a ser adicionado nas mensagens de log
 * @returns Objeto com métodos para log
 */
function createLogger(prefix) {
    return {
        info: (message, ...args) => console.log(`[${prefix}] INFO: ${message}`, ...args),
        error: (message, ...args) => console.error(`[${prefix}] ERROR: ${message}`, ...args),
        warn: (message, ...args) => console.warn(`[${prefix}] WARN: ${message}`, ...args),
        debug: (message, ...args) => process.env.DEBUG ? console.debug(`[${prefix}] DEBUG: ${message}`, ...args) : undefined
    };
}
/**
 * Logger padrão sem prefixo
 */
const defaultLogger = {
    info: (message, ...args) => console.log(`INFO: ${message}`, ...args),
    error: (message, ...args) => console.error(`ERROR: ${message}`, ...args),
    warn: (message, ...args) => console.warn(`WARN: ${message}`, ...args),
    debug: (message, ...args) => process.env.DEBUG ? console.debug(`DEBUG: ${message}`, ...args) : undefined
};
exports.default = defaultLogger;
