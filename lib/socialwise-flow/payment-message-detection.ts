const INFINITEPAY_RECEIPT_URL_REGEX = /https:\/\/recibo\.infinitepay\.io\/[A-Za-z0-9-]+(?:\?[\w%=&.-]+)?\/?/i;

export const CANONICAL_INFINITEPAY_RECEIPT_TEXT = "recibo.infinitepay.io";

export function isInfinitePayReceiptMessage(text: string | null | undefined): boolean {
	if (typeof text !== "string") {
		return false;
	}

	const normalizedText = text.trim();
	if (!normalizedText) {
		return false;
	}

	return INFINITEPAY_RECEIPT_URL_REGEX.test(normalizedText);
}

export function normalizeInfinitePayReceiptMessage(text: string | null | undefined): string {
	return isInfinitePayReceiptMessage(text) ? CANONICAL_INFINITEPAY_RECEIPT_TEXT : (text ?? "");
}