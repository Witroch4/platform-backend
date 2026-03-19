/**
 * Módulo simples de logs para a aplicação
 */

// Interface para os métodos do logger
interface Logger {
	info(message: string, data?: any): void;
	error(message: string, data?: any): void;
	warn(message: string, data?: any): void;
	debug(message: string, data?: any): void;
}

/**
 * Logger simples que escreve no console com timestamps e cores
 */
class ConsoleLogger implements Logger {
	info(message: string, data?: any): void {
		const dataStr = data ? ` - ${JSON.stringify(data)}` : "";
		console.log(`[INFO] ${new Date().toISOString()} - ${message}${dataStr}`);
	}

	error(message: string, data?: any): void {
		const dataStr = data ? ` - ${JSON.stringify(data)}` : "";
		console.error(`[ERROR] ${new Date().toISOString()} - ${message}${dataStr}`);
	}

	warn(message: string, data?: any): void {
		const dataStr = data ? ` - ${JSON.stringify(data)}` : "";
		console.warn(`[WARN] ${new Date().toISOString()} - ${message}${dataStr}`);
	}

	debug(message: string, data?: any): void {
		if (process.env.LOG_LEVEL !== "debug" && process.env.DEBUG !== "1" && process.env.DEBUG !== "true") return;
		const dataStr = data ? ` - ${JSON.stringify(data)}` : "";
		console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}${dataStr}`);
	}
}

// Exportar uma instância do logger
const log = new ConsoleLogger();

export default log;
