/**
 * Simples utilitário de log para debugar aplicações
 */

/**
 * Cria um logger com um prefixo
 * @param prefix Prefixo a ser adicionado nas mensagens de log
 * @returns Objeto com métodos para log
 */
export function createLogger(prefix: string) {
  return {
    info: (message: string, ...args: any[]) => console.log(`[${prefix}] INFO: ${message}`, ...args),
    error: (message: string, data?: any, ...args: any[]) => {
      if (data && typeof data === 'object') {
        // Format object data properly
        const formattedData = Object.entries(data)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        console.error(`[${prefix}] ERROR: ${message} {${formattedData}}`, ...args);
      } else {
        console.error(`[${prefix}] ERROR: ${message}`, data, ...args);
      }
    },
    warn: (message: string, ...args: any[]) => console.warn(`[${prefix}] WARN: ${message}`, ...args),
    debug: (message: string, ...args: any[]) => 
      process.env.DEBUG ? console.debug(`[${prefix}] DEBUG: ${message}`, ...args) : undefined
  };
}

/**
 * Logger padrão sem prefixo
 */
const defaultLogger = {
  info: (message: string, ...args: any[]) => console.log(`INFO: ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`ERROR: ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`WARN: ${message}`, ...args),
  debug: (message: string, ...args: any[]) => 
    process.env.DEBUG ? console.debug(`DEBUG: ${message}`, ...args) : undefined
};

export default defaultLogger; 