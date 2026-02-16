#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { parseGabaritoDeterministico, verificarPontuacao, debugResumo } from "./lib/oab/gabarito-parser-deterministico";
import { extractTextFromPdf } from "./lib/oab-eval/rubric-from-pdf";

// Force debug mode OFF for accurate scoring
process.env.DEBUG_GABARITO = "0";

const PDF_DIR = "./lib/oab/pdf-exemplos-gabaritos";

async function testSinglePdf(pdfPath: string) {
	const fileName = path.basename(pdfPath);
	const area = fileName.replace(".pdf", "");

	console.log(`\n${"=".repeat(80)}`);
	console.log(`🧪 TESTANDO: ${fileName}`);
	console.log(`${"=".repeat(80)}`);

	try {
		// Extract text from PDF
		const buffer = fs.readFileSync(pdfPath);
		const rawText = await extractTextFromPdf(buffer);

		console.log(`📄 [${fileName}] Texto extraído: ${rawText.length} caracteres`);

		// Parse with deterministic parser
		const meta = {
			exam: "43º Exame de Ordem Unificado",
			area: area,
			data_aplicacao: "2025-06-15",
			fonte: "Padrão de Resposta da FGV",
		};

		const parsed = parseGabaritoDeterministico(rawText, meta);
		const verificacao = verificarPontuacao(parsed.itens);

		// Check if scoring is correct
		const pecaOk = verificacao.peca.ok;
		const questoesOk = verificacao.questoes.ok;
		const geralOk = verificacao.geral.ok;
		const scoringPerfect = pecaOk && questoesOk && geralOk;

		console.log(`\n📊 [${fileName}] RESULTADO:`);
		console.log(`   📋 Itens gerados: ${parsed.itens.length}`);
		console.log(
			`   🎯 PEÇA: ${verificacao.peca.total} pts (esperado: ${verificacao.peca.esperado}) - ${pecaOk ? "✅ OK" : "❌ FALHOU"}`,
		);
		console.log(
			`   🎯 QUESTÕES: ${verificacao.questoes.total} pts (esperado: ${verificacao.questoes.esperado}) - ${questoesOk ? "✅ OK" : "❌ FALHOU"}`,
		);
		console.log(
			`   🎯 GERAL: ${verificacao.geral.total} pts (esperado: ${verificacao.geral.esperado}) - ${geralOk ? "✅ OK" : "❌ FALHOU"}`,
		);

		if (scoringPerfect) {
			console.log(`\n🎉 [${fileName}] ✅ PASSOU - Pontuação perfeita!`);
			return { fileName, status: "PASSOU", verificacao, rawText: null }; // Não salva texto se passou
		} else {
			console.log(`\n💥 [${fileName}] ❌ FALHOU - Pontuação incorreta!`);

			// Show detailed breakdown for failures
			console.log(`\n🔍 [${fileName}] DETALHAMENTO DOS PROBLEMAS:`);
			if (!pecaOk) {
				console.log(`   ❌ PEÇA: desvio de ${verificacao.peca.desvio} pts`);
			}
			if (!questoesOk) {
				console.log(`   ❌ QUESTÕES: desvio de ${verificacao.questoes.desvio} pts`);
				Object.entries(verificacao.questoes.porQuestao).forEach(([q, dados]) => {
					if (!dados.ok) {
						console.log(`      ❌ ${q}: ${dados.total} pts (esperado: ${dados.esperado}, desvio: ${dados.desvio})`);
					}
				});
			}

			return { fileName, status: "FALHOU", verificacao, rawText, parsed };
		}
	} catch (error: any) {
		console.log(`\n💀 [${fileName}] 🚨 ERRO FATAL: ${error.message}`);
		console.log(`   Stack: ${error.stack}`);
		return { fileName, status: "ERRO", error: error.message, rawText: null };
	}
}

async function runBatchTest() {
	console.log(`🚀 INICIANDO TESTE BATCH DE GABARITOS OAB`);
	console.log(`📁 Diretório: ${PDF_DIR}`);

	const pdfFiles = fs
		.readdirSync(PDF_DIR)
		.filter((file) => file.endsWith(".pdf"))
		.map((file) => path.join(PDF_DIR, file));

	console.log(`📚 Encontrados ${pdfFiles.length} PDFs para testar`);

	const results: any[] = [];
	let passed = 0;
	let failed = 0;
	let errors = 0;

	for (const pdfPath of pdfFiles) {
		const result = await testSinglePdf(pdfPath);
		results.push(result);

		if (result.status === "PASSOU") passed++;
		else if (result.status === "FALHOU") failed++;
		else if (result.status === "ERRO") errors++;
	}

	// Summary Table
	console.log(`\n${"=".repeat(100)}`);
	console.log(`📊 TABELA RESUMO - PONTUAÇÃO DE TODOS OS PDFs`);
	console.log(`${"=".repeat(100)}`);
	console.log(
		`┌${"─".repeat(35)}┬${"─".repeat(10)}┬${"─".repeat(12)}┬${"─".repeat(10)}┬${"─".repeat(10)}┬${"─".repeat(10)}┐`,
	);
	console.log(
		`│ ${"PDF".padEnd(33)} │ ${"PEÇA".padEnd(8)} │ ${"QUESTÕES".padEnd(10)} │ ${"GERAL".padEnd(8)} │ ${"ESPERADO".padEnd(8)} │ ${"STATUS".padEnd(8)} │`,
	);
	console.log(
		`├${"─".repeat(35)}┼${"─".repeat(10)}┼${"─".repeat(12)}┼${"─".repeat(10)}┼${"─".repeat(10)}┼${"─".repeat(10)}┤`,
	);

	results.forEach((r) => {
		const fileName = r.fileName.replace(".pdf", "").substring(0, 33).padEnd(33);
		const peca = `${r.verificacao.peca.total}/5`.padEnd(8);
		const questoes = `${r.verificacao.questoes.total}/5`.padEnd(10);
		const geral = `${r.verificacao.geral.total}/10`.padEnd(8);
		const esperado = "10/10".padEnd(8);
		const status =
			r.status === "PASSOU" ? "✅ OK".padEnd(8) : r.status === "FALHOU" ? "❌ FALHA".padEnd(8) : "🚨 ERRO".padEnd(8);
		console.log(`│ ${fileName} │ ${peca} │ ${questoes} │ ${geral} │ ${esperado} │ ${status} │`);
	});

	console.log(
		`└${"─".repeat(35)}┴${"─".repeat(10)}┴${"─".repeat(12)}┴${"─".repeat(10)}┴${"─".repeat(10)}┴${"─".repeat(10)}┘`,
	);

	console.log(`\n${"=".repeat(100)}`);
	console.log(`📈 RESUMO GERAL DO TESTE BATCH`);
	console.log(`${"=".repeat(100)}`);
	console.log(`✅ Passou: ${passed}/${pdfFiles.length} (${((passed / pdfFiles.length) * 100).toFixed(1)}%)`);
	console.log(`❌ Falhou: ${failed}/${pdfFiles.length} (${((failed / pdfFiles.length) * 100).toFixed(1)}%)`);
	console.log(`🚨 Erro: ${errors}/${pdfFiles.length} (${((errors / pdfFiles.length) * 100).toFixed(1)}%)`);

	// Show failed files content
	const failedResults = results.filter((r) => r.status === "FALHOU");
	if (failedResults.length > 0) {
		console.log(`\n${"=".repeat(80)}`);
		console.log(`💥 CONTEÚDO COMPLETO DOS PDFs QUE FALHARAM`);
		console.log(`${"=".repeat(80)}`);

		failedResults.forEach((result) => {
			console.log(`\n📄 ARQUIVO: ${result.fileName}`);
			console.log(`📊 PONTUAÇÃO OBTIDA:`);
			console.log(`   PEÇA: ${result.verificacao.peca.total} (esperado: ${result.verificacao.peca.esperado})`);
			console.log(
				`   QUESTÕES: ${result.verificacao.questoes.total} (esperado: ${result.verificacao.questoes.esperado})`,
			);
			console.log(`   GERAL: ${result.verificacao.geral.total} (esperado: ${result.verificacao.geral.esperado})`);

			console.log(`\n📝 TEXTO COMPLETO EXTRAÍDO:`);
			console.log(`${"─".repeat(60)}`);
			console.log(result.rawText);
			console.log(`${"─".repeat(60)}`);

			console.log(`\n📋 ITENS GERADOS (${result.parsed.itens.length} total):`);
			result.parsed.itens.forEach((item: any, idx: number) => {
				const peso = item.peso || 0;
				const grupo = item.ou_group_id ? ` [OU:${item.ou_group_id}]` : "";
				console.log(
					`   ${idx + 1}. [${item.questao}] ${peso.toFixed(2)} pts${grupo} - ${item.descricao.substring(0, 100)}...`,
				);
			});
		});
	}

	// Show error files
	const errorResults = results.filter((r) => r.status === "ERRO");
	if (errorResults.length > 0) {
		console.log(`\n${"=".repeat(80)}`);
		console.log(`🚨 ARQUIVOS COM ERRO`);
		console.log(`${"=".repeat(80)}`);
		errorResults.forEach((result) => {
			console.log(`❌ ${result.fileName}: ${result.error}`);
		});
	}

	console.log(`\n${"=".repeat(80)}`);
	console.log(`🏁 TESTE BATCH CONCLUÍDO`);
	console.log(`${"=".repeat(80)}`);

	process.exit(failed > 0 || errors > 0 ? 1 : 0);
}

// Run the batch test
runBatchTest().catch(console.error);
