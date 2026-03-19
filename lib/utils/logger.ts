/**
 * Simples utilitário de log para debugar aplicações
 */

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";
type MaybeLogContext = Record<string, unknown> | undefined;

function getLogContext(): MaybeLogContext {
	const globalLogContext = globalThis as typeof globalThis & {
		__SW_GET_LOG_CONTEXT__?: () => MaybeLogContext;
	};

	return globalLogContext.__SW_GET_LOG_CONTEXT__?.();
}

function getLogTimeZone() {
	return process.env.LOG_TIMEZONE || process.env.TZ || "America/Sao_Paulo";
}

function formatTimestamp(date: Date, timeZone: string) {
	return new Intl.DateTimeFormat("pt-BR", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).format(date);
}

function serializeError(error: Error) {
	return {
		name: error.name,
		message: error.message,
		stack: error.stack,
	};
}

function sanitizeLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
	if (value instanceof Error) {
		return serializeError(value);
	}

	if (typeof value === "bigint") {
		return value.toString();
	}

	if (Array.isArray(value)) {
		return value.map((entry) => sanitizeLogValue(entry, seen));
	}

	if (value && typeof value === "object") {
		if (seen.has(value as object)) {
			return "[Circular]";
		}

		seen.add(value as object);
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitizeLogValue(entry, seen)]),
		);
	}

	return value;
}

function splitLogArgs(args: any[]) {
	const fields: Record<string, unknown> = {};
	const extra: unknown[] = [];

	for (const arg of args) {
		if (arg instanceof Error) {
			extra.push(serializeError(arg));
			continue;
		}

		if (arg && typeof arg === "object" && !Array.isArray(arg)) {
			Object.assign(fields, arg);
			continue;
		}

		if (arg !== undefined) {
			extra.push(arg);
		}
	}

	return { fields, extra };
}

function emitLog(level: LogLevel, module: string, message: string, args: any[]) {
	const now = new Date();
	const timeZone = getLogTimeZone();
	const logContext = getLogContext() || {};
	const { fields, extra } = splitLogArgs(args);

	const entry = sanitizeLogValue({
		timestamp: formatTimestamp(now, timeZone),
		isoTimestamp: now.toISOString(),
		tz: timeZone,
		level,
		module,
		message,
		...logContext,
		...fields,
		...(extra.length ? { extra } : {}),
	});

	const serialized = JSON.stringify(entry);

	if (level === "ERROR") {
		console.error(serialized);
		return;
	}

	if (level === "WARN") {
		console.warn(serialized);
		return;
	}

	if (level === "DEBUG") {
		console.debug(serialized);
		return;
	}

	console.log(serialized);
}

/**
 * Cria um logger com um prefixo
 * @param prefix Prefixo a ser adicionado nas mensagens de log
 * @returns Objeto com métodos para log
 */
export function createLogger(prefix: string) {
	return {
		info: (message: string, ...args: any[]) => emitLog("INFO", prefix, message, args),
		error: (message: string, ...args: any[]) => emitLog("ERROR", prefix, message, args),
		warn: (message: string, ...args: any[]) => emitLog("WARN", prefix, message, args),
		debug: (message: string, ...args: any[]) => (process.env.DEBUG ? emitLog("DEBUG", prefix, message, args) : undefined),
	};
}

/**
 * Logger padrão sem prefixo
 */
const defaultLogger = {
	info: (message: string, ...args: any[]) => emitLog("INFO", "default", message, args),
	error: (message: string, ...args: any[]) => emitLog("ERROR", "default", message, args),
	warn: (message: string, ...args: any[]) => emitLog("WARN", "default", message, args),
	debug: (message: string, ...args: any[]) => (process.env.DEBUG ? emitLog("DEBUG", "default", message, args) : undefined),
};

export default defaultLogger;
