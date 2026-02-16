#!/usr/bin/env node

import * as fs from "fs";
import { parseGabaritoDeterministico, verificarPontuacao } from "./lib/oab/gabarito-parser-deterministico";
import pdfParse from "pdf-parse";

// Force debug mode OFF for accurate scoring
process.env.DEBUG_GABARITO = "0";

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
	const result = await pdfParse(buffer, { pagerender: undefined });
	return result.text
		.replace(/\r\n/g, "\n")
		.replace(/\u0000/g, "")
		.replace(/\t+/g, " ")
		.replace(/[ \t]+\n/g, "\n");
}

async function testPDF(fileName: string) {
	const pdfPath = `./lib/oab/pdf-exemplos-gabaritos/${fileName}`;

	console.log(`🧪 TESTANDO: ${fileName}`);

	try {
		const buffer = fs.readFileSync(pdfPath);
		const rawText = await extractTextFromPdf(buffer);

		console.log(`📄 Texto extraído: ${rawText.length} caracteres`);

		const meta = {
			exam: "43º Exame de Ordem Unificado",
			area: fileName.replace(".pdf", ""),
			data_aplicacao: "2025-06-15",
			fonte: "Padrão de Resposta da FGV",
		};

		const parsed = parseGabaritoDeterministico(rawText, meta);
		const verificacao = verificarPontuacao(parsed.itens);

		console.log(`\n📊 RESULTADO FINAL:`);
		console.log(`   📋 Itens: ${parsed.itens.length}`);
		console.log(
			`   🎯 PEÇA: ${verificacao.peca.total} pts (esperado: ${verificacao.peca.esperado}, desvio: ${verificacao.peca.desvio})`,
		);
		console.log(
			`   🎯 QUESTÕES: ${verificacao.questoes.total} pts (esperado: ${verificacao.questoes.esperado}, desvio: ${verificacao.questoes.desvio})`,
		);
		console.log(
			`   🎯 GERAL: ${verificacao.geral.total} pts (esperado: ${verificacao.geral.esperado}, desvio: ${verificacao.geral.desvio})`,
		);

		const pecaOk = verificacao.peca.ok;
		const questoesOk = verificacao.questoes.ok;
		const geralOk = verificacao.geral.ok;

		if (pecaOk && questoesOk && geralOk) {
			console.log(`\n🎉 ✅ PASSOU - Pontuação perfeita!`);
		} else {
			console.log(`\n💥 ❌ FALHOU - Pontuação incorreta!`);

			if (!pecaOk) console.log(`   ❌ PEÇA: problema na pontuação`);
			if (!questoesOk) console.log(`   ❌ QUESTÕES: problema na pontuação`);
			if (!geralOk) console.log(`   ❌ GERAL: problema na pontuação`);
		}
	} catch (error: any) {
		console.error(`💀 ERRO: ${error.message}`);
	}
}

// Test specific file
const targetFile = process.argv[2] || "DIREITO TRIBUTÁRIO.pdf";
testPDF(targetFile).catch(console.error);
