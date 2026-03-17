/**
 * Parser de valor monetário → centavos.
 *
 * Aceita múltiplos formatos:
 *   "R$ 27,90"  → 2790
 *   "R$27.90"   → 2790
 *   "27,90"     → 2790
 *   "27.90"     → 2790
 *   "2790"      → 2790 (já em centavos)
 *   2790        → 2790
 */
export function parseCurrencyToCents(value: string | number): number {
	if (typeof value === "number") {
		return Math.round(value);
	}

	// Remove "R$", espaços e pontos de milhar
	let cleaned = value
		.replace(/R\$\s*/gi, "")
		.replace(/\s/g, "")
		.trim();

	// Se tem vírgula como separador decimal (formato BR: 1.234,56 ou 27,90)
	if (cleaned.includes(",")) {
		// Remove pontos de milhar e troca vírgula por ponto
		cleaned = cleaned.replace(/\./g, "").replace(",", ".");
	}

	const num = Number.parseFloat(cleaned);
	if (Number.isNaN(num)) {
		throw new Error(`Valor monetário inválido: "${value}"`);
	}

	// Se o número parece ser em reais (tem decimal ou é pequeno demais para centavos)
	// Heurística: se tem ponto decimal no string limpo, está em reais
	if (cleaned.includes(".")) {
		return Math.round(num * 100);
	}

	// Sem decimal = já está em centavos
	return Math.round(num);
}
