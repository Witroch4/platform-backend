/**
 * PlaygroundCollector — Captura deliveries async do FlowExecutor no modo playground
 *
 * Em vez de enviar HTTP ao Chatwit, o delivery service deposita os payloads
 * aqui para o API route coletar e retornar ao frontend.
 */

import type { DeliveryPayload } from "@/types/flow-engine";

export interface CollectedDelivery {
	payload: DeliveryPayload;
	timestamp: number;
}

const collectors = new Map<string, CollectedDelivery[]>();

export function initCollector(id: string): void {
	collectors.set(id, []);
}

export function addToCollector(id: string, payload: DeliveryPayload): void {
	const list = collectors.get(id);
	if (list) {
		list.push({ payload, timestamp: Date.now() });
	}
}

export function drainCollector(id: string): CollectedDelivery[] {
	const items = collectors.get(id) ?? [];
	collectors.delete(id);
	return items;
}
