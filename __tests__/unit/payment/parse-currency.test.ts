import { parseCurrencyToCents } from "@/lib/payment/parse-currency";

describe("parseCurrencyToCents", () => {
	it("interpreta valores com prefixo R$ e sem casas decimais como reais inteiros", () => {
		expect(parseCurrencyToCents("R$ 1")).toBe(100);
		expect(parseCurrencyToCents("R$ 27")).toBe(2700);
	});

	it("mantém números sem prefixo monetário como centavos", () => {
		expect(parseCurrencyToCents("2790")).toBe(2790);
		expect(parseCurrencyToCents(2790)).toBe(2790);
	});

	it("continua aceitando formatos monetários com separador decimal", () => {
		expect(parseCurrencyToCents("R$ 27,90")).toBe(2790);
		expect(parseCurrencyToCents("27.90")).toBe(2790);
	});
});