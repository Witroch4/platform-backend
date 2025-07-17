"use strict";
/**
 * Módulo simples de logs para a aplicação
 */
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Logger simples que escreve no console com timestamps e cores
 */
class ConsoleLogger {
    info(message) {
        console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
    }
    error(message) {
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
    }
    warn(message) {
        console.warn(`[WARN] ${new Date().toISOString()} - ${message}`);
    }
    debug(message) {
        console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`);
    }
}
// Exportar uma instância do logger
const log = new ConsoleLogger();
exports.default = log;
