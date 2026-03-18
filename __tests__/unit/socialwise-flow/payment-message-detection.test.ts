import {
	CANONICAL_INFINITEPAY_RECEIPT_TEXT,
	isInfinitePayReceiptMessage,
	normalizeInfinitePayReceiptMessage,
} from "@/lib/socialwise-flow/payment-message-detection";

describe("isInfinitePayReceiptMessage", () => {
	it("returns true for InfinitePay receipt URLs", () => {
		expect(isInfinitePayReceiptMessage("https://recibo.infinitepay.io/dd1afc80-f6c9-43de-83c1-1b2bfd5a2ec6")).toBe(true);
		expect(
			isInfinitePayReceiptMessage(
				" https://recibo.infinitepay.io/DD1AFC80-F6C9-43DE-83C1-1B2BFD5A2EC6?src=wa ",
			),
		).toBe(true);
		expect(
			isInfinitePayReceiptMessage(
				"segue o comprovante https://recibo.infinitepay.io/dd1afc80-f6c9-43de-83c1-1b2bfd5a2ec6",
			),
		).toBe(true);
	});

	it("returns false for non-receipt messages", () => {
		expect(isInfinitePayReceiptMessage("https://infinitepay.io/checkout/123")).toBe(false);
		expect(isInfinitePayReceiptMessage("enviei o comprovante")).toBe(false);
		expect(isInfinitePayReceiptMessage("")).toBe(false);
		expect(isInfinitePayReceiptMessage(undefined)).toBe(false);
	});

	it("normalizes receipt URLs to a canonical alias string", () => {
		expect(
			normalizeInfinitePayReceiptMessage("https://recibo.infinitepay.io/dd1afc80-f6c9-43de-83c1-1b2bfd5a2ec6"),
		).toBe(CANONICAL_INFINITEPAY_RECEIPT_TEXT);
		expect(
			normalizeInfinitePayReceiptMessage(
				"segue o comprovante https://recibo.infinitepay.io/dd1afc80-f6c9-43de-83c1-1b2bfd5a2ec6",
			),
		).toBe(CANONICAL_INFINITEPAY_RECEIPT_TEXT);
		expect(normalizeInfinitePayReceiptMessage("texto comum")).toBe("texto comum");
	});
});