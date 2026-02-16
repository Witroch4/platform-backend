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

	console.log("=== SEPARAÇÃO POR QUESTÕES ===");

	// Separar o texto em seções
	const secoes = rawText.split(/(?=Q[1-4]\s|Questão\s[1-4])/i);

	console.log(`Total de seções encontradas: ${secoes.length}`);

	secoes.forEach((secao, idx) => {
		const pontuacoes = secao.match(/\(\s*0[,\.]\d{2}\s*\)/g);
		const count = pontuacoes ? pontuacoes.length : 0;
		let soma = 0;

		if (pontuacoes) {
			pontuacoes.forEach((pont) => {
				const valorMatch = pont.match(/0[,\.](\d{2})/);
				if (valorMatch) {
					soma += parseFloat(`0.${valorMatch[1]}`);
				}
			});
		}

		const primeirasLinhas = secao.trim().split("\n").slice(0, 3).join(" ").substring(0, 100);
		console.log(`\nSeção ${idx}: ${count} pontuações, soma: ${soma.toFixed(2)}`);
		console.log(`Início: "${primeirasLinhas}..."`);

		// Se esta for a seção da PEÇA (primeira seção geralmente)
		if (idx === 0 && !secao.match(/^Q[1-4]/i)) {
			console.log(">>> ESTA É A SEÇÃO DA PEÇA <<<");

			if (pontuacoes) {
				console.log("Pontuações encontradas na PEÇA:");
				const contadorPeca = new Map();
				pontuacoes.forEach((pont) => {
					const valorMatch = pont.match(/0[,\.](\d{2})/);
					if (valorMatch) {
						const valor = parseFloat(`0.${valorMatch[1]}`);
						const chave = valor.toFixed(2);
						contadorPeca.set(chave, (contadorPeca.get(chave) || 0) + 1);
					}
				});

				Array.from(contadorPeca.entries())
					.sort(([a], [b]) => parseFloat(b) - parseFloat(a))
					.forEach(([valor, count]) => {
						console.log(`  ${valor}: ${count}x = ${(parseFloat(valor) * count).toFixed(2)}`);
					});
			}
		}
	});

	// Buscar especificamente por matrizes na primeira seção (PEÇA)
	const primeiraSecao = secoes[0];
	const matrizesPeca = primeiraSecao.match(/0[,\.]00\s*\/\s*\d{1,2}[,\.]\d{2}/g);
	if (matrizesPeca) {
		console.log(`\n=== MATRIZES DA PEÇA (${matrizesPeca.length}) ===`);
		let somaMatrizes = 0;
		matrizesPeca.forEach((matriz, idx) => {
			const valorMatch = matriz.match(/\/\s*(\d{1,2})[,\.](\d{2})/);
			if (valorMatch) {
				const valor = parseFloat(`${valorMatch[1]}.${valorMatch[2]}`);
				somaMatrizes += valor;
				console.log(`${idx + 1}. ${matriz} = ${valor}`);
			}
		});
		console.log(`SOMA DAS MATRIZES DA PEÇA: ${somaMatrizes.toFixed(2)}`);
	}
}

test().catch(console.error);
