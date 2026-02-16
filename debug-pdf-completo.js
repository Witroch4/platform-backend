import { readFileSync } from "fs";
import pdfParse from "pdf-parse";

async function test() {
	const buffer = readFileSync("lib/oab/pdf-exemplos-gabaritos/direito ADM.pdf");
	const pdf = await pdfParse(buffer, { pagerender: undefined });
	const rawText = pdf.text
		.replace(/\r\n/g, "\n")
		.replace(/\u0000/g, "")
		.replace(/\t+/g, " ")
		.replace(/[ \t]+\n/g, "\n");

	console.log("=== ANÁLISE GERAL DO PDF ===");
	console.log("Tamanho total do texto:", rawText.length);

	// Buscar diferentes padrões de seção
	console.log("\n=== BUSCA POR SEÇÕES ===");
	const secoes = ["PEÇA", "PEÇA PRÁTICO-PROFISSIONAL", "PRÁTICO-PROFISSIONAL", "ITEM  PONTUAÇÃO", "ITEM PONTUAÇÃO"];

	secoes.forEach((secao) => {
		const regex = new RegExp(secao, "i");
		const match = rawText.match(regex);
		console.log(`"${secao}": ${match ? "✅ encontrado" : "❌ não encontrado"}`);
	});

	// Buscar por todas as pontuações individuais no documento
	console.log("\n=== TODAS AS PONTUAÇÕES (0,XX) ===");
	const todasPontuacoes = rawText.match(/\(\s*0[,\.]\d{2}\s*\)/g);
	if (todasPontuacoes) {
		console.log(`Total de pontuações encontradas: ${todasPontuacoes.length}`);

		let somaTotal = 0;
		const contadorPontos = new Map();

		todasPontuacoes.forEach((pont) => {
			const valorMatch = pont.match(/0[,\.](\d{2})/);
			if (valorMatch) {
				const valor = parseFloat(`0.${valorMatch[1]}`);
				somaTotal += valor;

				const chave = valor.toFixed(2);
				contadorPontos.set(chave, (contadorPontos.get(chave) || 0) + 1);
			}
		});

		console.log(`SOMA TOTAL: ${somaTotal.toFixed(2)}`);
		console.log("\nDistribuição por valor:");
		Array.from(contadorPontos.entries())
			.sort(([a], [b]) => parseFloat(b) - parseFloat(a))
			.forEach(([valor, count]) => {
				console.log(`  ${valor}: ${count}x = ${(parseFloat(valor) * count).toFixed(2)}`);
			});
	}

	// Buscar por matrizes de pontuação
	console.log("\n=== MATRIZES DE PONTUAÇÃO (0,00/X,XX) ===");
	const matrizes = rawText.match(/0[,\.]00\s*\/\s*\d{1,2}[,\.]\d{2}/g);
	if (matrizes) {
		console.log(`Total de matrizes: ${matrizes.length}`);
		matrizes.forEach((matriz, idx) => {
			console.log(`${idx + 1}. ${matriz}`);
		});
	} else {
		console.log("❌ Nenhuma matriz encontrada");
	}
}

test().catch(console.error);
