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

	console.log("=== DEBUG DETALHADO DOS ITENS PEÇA ===");
	const itensPeca = parsed.itens.filter((item) => item.questao === "PEÇA");

	console.log(`Total de subitens PEÇA: ${itensPeca.length}`);

	// Separar grupos OU e itens normais
	const gruposOu = new Map();
	const itensNormais = [];

	itensPeca.forEach((item, idx) => {
		if (item.ou_group_id) {
			if (!gruposOu.has(item.ou_group_id)) {
				gruposOu.set(item.ou_group_id, []);
			}
			gruposOu.get(item.ou_group_id).push(item);
		} else {
			itensNormais.push(item);
		}
	});

	console.log(`\\nItens normais (${itensNormais.length}):`);
	let somaNormais = 0;
	itensNormais.forEach((item, idx) => {
		const peso = item.peso || 0;
		somaNormais += peso;
		console.log(`${idx + 1}. ${peso.toFixed(2)} | ${item.descricao.substring(0, 80)}...`);
	});
	console.log(`Soma itens normais: ${somaNormais.toFixed(2)}`);

	console.log(`\\nGrupos OU (${gruposOu.size}):`);
	let somaGruposOu = 0;
	gruposOu.forEach((itens, groupId) => {
		const pesos = itens.map((i) => i.peso || 0);
		const melhorPeso = Math.max(...pesos);
		somaGruposOu += melhorPeso;
		console.log(`${groupId}: melhor peso ${melhorPeso.toFixed(2)} de [${pesos.map((p) => p.toFixed(2)).join(", ")}]`);
	});
	console.log(`Soma grupos OU: ${somaGruposOu.toFixed(2)}`);

	const somaTotal = somaNormais + somaGruposOu;
	console.log(`\\nSOMA TOTAL CALCULADA: ${somaTotal.toFixed(2)}`);

	const verificacao = verificarPontuacao(parsed.itens);
	console.log(`TOTAL FUNÇÃO verificarPontuacao: ${verificacao.peca.total}`);

	if (Math.abs(somaTotal - verificacao.peca.total) > 0.001) {
		console.log("❌ DISCREPÂNCIA detectada entre cálculo manual e função!");
	} else {
		console.log("✅ Cálculo manual bate com função verificarPontuacao");
	}
}

test().catch(console.error);
