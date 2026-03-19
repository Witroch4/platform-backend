export interface RequestLogContext {
	requestId?: string;
	traceId?: string;
	correlationId?: string;
	leadKey?: string;
	accountId?: number | string;
	sessionId?: string;
	conversationId?: number | string;
	conversationDisplayId?: number | string;
	conversationUrl?: string;
	inboxId?: number | string;
	contactId?: number | string;
	contactPhone?: string;
	contactName?: string;
	userId?: string;
	channelType?: string;
	method?: string;
	route?: string;
	requestUrl?: string;
	eventStage?: string;
	[key: string]: unknown;
}

type RequestContextAccessor = {
	__SW_GET_LOG_CONTEXT__?: () => RequestLogContext | undefined;
};

type AsyncLocalStorageLike<T> = {
	run<R>(store: T, callback: () => R): R;
	getStore(): T | undefined;
};

const globalLogContext = globalThis as typeof globalThis & RequestContextAccessor;

let requestLogContextStorage: AsyncLocalStorageLike<RequestLogContext> | undefined;

if (typeof window === "undefined") {
	try {
		const nodeRequire = new Function("return require")() as (id: string) => any;
		const { AsyncLocalStorage } = nodeRequire("node:async_hooks") as {
			AsyncLocalStorage: new <T>() => AsyncLocalStorageLike<T>;
		};
		requestLogContextStorage = new AsyncLocalStorage<RequestLogContext>();
	} catch {
		requestLogContextStorage = undefined;
	}
}

globalLogContext.__SW_GET_LOG_CONTEXT__ = () => requestLogContextStorage?.getStore();

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export function runWithLogContext<T>(
	initialContext: RequestLogContext,
	callback: () => Promise<T> | T,
): Promise<T> | T {
	if (!requestLogContextStorage) {
		return callback();
	}

	return requestLogContextStorage.run(removeUndefined({ ...initialContext }), callback);
}

export function getLogContext(): RequestLogContext | undefined {
	return requestLogContextStorage?.getStore();
}

export function updateLogContext(partialContext: Partial<RequestLogContext>): void {
	const currentContext = requestLogContextStorage?.getStore();
	if (!currentContext) {
		return;
	}

	Object.assign(currentContext, removeUndefined({ ...partialContext }));
}