import { readFileSync } from "fs";
import { parseGabaritoDeterministico, verificarPontuacao } from "./lib/oab/gabarito-parser-deterministico.js";
import pdfParse from "pdf-parse";

async function test() {
	const buffer = readFileSync("lib/oab/pdf-exemplos-gabaritos/direito ADM.pdf");
	const pdf = await pdfParse(buffer, { pagerender: undefined });
	const rawText = pdf.text
		.replace(/\r\n/g, "\n")
		.replace(/\u0000/g, "")
		.replace(/\t+/g, " ")
		.replace(/[ \t]+\n/g, "\n");
	const meta = {
		exam: "43º Exame de Ordem Unificado",
		area: "direito ADM",
		data_aplicacao: "2025-06-15",
		fonte: "Padrão de Resposta da FGV",
	};

	const parsed = parseGabaritoDeterministico(rawText, meta);

	// Analisar grupos OU
	console.log("=== ANÁLISE GRUPOS OU ===");
	const gruposOu = new Map();
	parsed.itens.forEach((item) => {
		if (item.ou_group_id) {
			if (!gruposOu.has(item.ou_group_id)) {
				gruposOu.set(item.ou_group_id, []);
			}
			gruposOu.get(item.ou_group_id).push({
				rotulo: item.rotulo,
				peso: item.peso,
				descricao: (item.descricao || "").substring(0, 80) + "...",
			});
		}
	});

	console.log("Total de grupos OU:", gruposOu.size);
	gruposOu.forEach((itens, groupId) => {
		console.log(`\nGrupo OU: ${groupId}`);
		itens.forEach((item) => {
			console.log(`  - Item ${item.rotulo}: ${item.peso} | ${item.descricao}`);
		});
		const melhorPeso = Math.max(...itens.map((i) => i.peso));
		const pesoTotal = itens.reduce((acc, i) => acc + i.peso, 0);
		console.log(`  Soma total: ${pesoTotal} | Melhor peso: ${melhorPeso} | Redução: ${pesoTotal - melhorPeso}`);
	});

	const verificacao = verificarPontuacao(parsed.itens);
	console.log(`\nTotal final: ${verificacao.peca.total}`);
}

test().catch(console.error);
