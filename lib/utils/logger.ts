/**
 * Utilitário de log estruturado com timestamp TZ, chaves key=value e truncamento de payloads grandes.
 */

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";
type MaybeLogContext = Record<string, unknown> | undefined;

const LOG_TZ = process.env.TZ || "America/Sao_Paulo";
const LOG_MAX_VALUE_LENGTH = 2000; // Trunca valores maiores que 2000 chars nos logs

function getLogContext(): MaybeLogContext {
	const globalLogContext = globalThis as typeof globalThis & {
		__SW_GET_LOG_CONTEXT__?: () => MaybeLogContext;
	};

	return globalLogContext.__SW_GET_LOG_CONTEXT__?.();
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

function formatFieldValue(value: unknown, truncate: boolean): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") {
		if (truncate && value.length > LOG_MAX_VALUE_LENGTH) {
			return `${value.slice(0, LOG_MAX_VALUE_LENGTH)}...[truncated ${value.length} chars]`;
		}
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (value instanceof Error) return `${value.name}: ${value.message}`;
	try {
		const json = JSON.stringify(value);
		if (truncate && json.length > LOG_MAX_VALUE_LENGTH) {
			return `${json.slice(0, LOG_MAX_VALUE_LENGTH)}...[truncated ${json.length} chars]`;
		}
		return json;
	} catch {
		return String(value);
	}
}

function formatExtraFields(fields: Record<string, unknown>, truncate: boolean): string {
	const parts: string[] = [];
	for (const [key, val] of Object.entries(fields)) {
		if (val === undefined || val === null) continue;
		parts.push(`${key}=${formatFieldValue(val, truncate)}`);
	}
	return parts.length > 0 ? ` | ${parts.join(" ")}` : "";
}

function emitLog(level: LogLevel, module: string, message: string, args: any[]) {
	const now = new Date();
	const logContext = getLogContext() || {};
	const { fields, extra } = splitLogArgs(args);

	// Merge context + fields, skip redundant metadata
	const allFields = sanitizeLogValue({ ...logContext, ...fields }) as Record<string, unknown>;
	// Remove fields already in the prefix
	delete allFields.level;
	delete allFields.module;
	delete allFields.message;

	const truncate = level !== "DEBUG";
	const extraStr = extra.length > 0 ? ` ${extra.map((e) => formatFieldValue(e, truncate)).join(" ")}` : "";
	const fieldsStr = formatExtraFields(allFields, truncate);

	const timestamp = now.toLocaleString("sv-SE", { timeZone: LOG_TZ }).replace(" ", "T") +
		"." + String(now.getMilliseconds()).padStart(3, "0");
	const line = `[${timestamp}] ${level} [${module}] ${message}${extraStr}${fieldsStr}`;

	if (level === "ERROR") {
		console.error(line);
		return;
	}

	if (level === "WARN") {
		console.warn(line);
		return;
	}

	if (level === "DEBUG") {
		console.debug(line);
		return;
	}

	console.log(line);
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
