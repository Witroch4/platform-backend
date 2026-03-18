export const MTF_LOTE_TIME_ZONE = process.env.TZ || "America/Sao_Paulo";

const loteDateFormatter = new Intl.DateTimeFormat("pt-BR", {
	timeZone: MTF_LOTE_TIME_ZONE,
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

const loteDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
	timeZone: MTF_LOTE_TIME_ZONE,
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

function toValidDate(value: string | Date): Date | null {
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function formatMtfLoteDate(value: string | Date): string {
	const date = toValidDate(value);
	if (!date) {
		return typeof value === "string" ? value : "";
	}

	return loteDateFormatter.format(date);
}

export function formatMtfLoteDateTime(value: string | Date): string {
	const date = toValidDate(value);
	if (!date) {
		return typeof value === "string" ? value : "";
	}

	return loteDateTimeFormatter.format(date);
}