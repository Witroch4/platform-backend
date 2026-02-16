// Script para criar apenas o blueprint do extrator de espelho
import "dotenv/config";
import { getPrismaInstance } from "@/lib/connections";

const prisma = getPrismaInstance();

async function seedOabMirrorExtractorBlueprint() {
	console.log("🧩 Criando Blueprint: OAB — Extrator de Espelho");

	const owners = await prisma.user.findMany({
		where: { role: "SUPERADMIN" },
		select: { id: true, email: true },
	});

	if (!owners || owners.length === 0) {
		console.warn("⚠️ Nenhum SUPERADMIN encontrado para criar Blueprint. Pulando...");
		return;
	}

	const systemPrompt = [
		"Você é um agente especializado em extrair dados de espelhos de correção da OAB.",
		"Sua tarefa é identificar e extrair com precisão máxima:",
		"1. Dados do candidato: nome completo, número de inscrição, nota final, situação (APROVADO/REPROVADO)",
		"2. Notas de cada item avaliado no formato do ID da rubrica (ex: PECA-01A, Q1-01A, Q2-03B)",
		"3. Totais parciais: pontuação total da peça profissional, pontuação total das questões",
		"",
		"REGRAS IMPORTANTES:",
		"- Retorne APENAS um objeto JSON válido, sem markdown ou formatação extra",
		'- Quando um dado não estiver visível ou legível na imagem, use a string "[não-visivel]"',
		'- Para todas as notas, use formato numérico com 2 casas decimais (ex: "0.65", "1.25", "2.30")',
		"- Os IDs dos itens devem manter o formato EXATO da rubrica fornecida",
		'- Caso o aluno esteja ausente ou a prova em branco, atribua "0.00" a todas as notas',
		"",
		"FORMATO DA SAÍDA:",
		"{",
		'  "nome_do_examinando": "Nome Completo do Aluno",',
		'  "inscricao": "123456789",',
		'  "nota_final": "6.50",',
		'  "situacao": "APROVADO",',
		'  "pontuacao_total_peca": "4.00",',
		'  "pontuacao_total_questoes": "2.50",',
		'  "nota_obtida_PECA-01A": "0.10",',
		'  "nota_obtida_PECA-02A": "0.20",',
		'  "nota_obtida_Q1-01A": "0.65",',
		'  "nota_obtida_Q1-02B": "0.60",',
		"  ...",
		"}",
	].join("\n");

	for (const owner of owners) {
		const exists = await prisma.aiAgentBlueprint.findFirst({
			where: { ownerId: owner.id, name: { contains: "Extrator de Espelho", mode: "insensitive" } },
			select: { id: true },
		});

		if (exists) {
			// Atualizar se já existir
			await prisma.aiAgentBlueprint.update({
				where: { id: exists.id },
				data: {
					model: "gpt-4.1",
					maxOutputTokens: 4000,
					temperature: 0,
					systemPrompt,
					instructions: systemPrompt,
					canvasState: {
						nodes: [
							{ id: "agent", position: { x: 180, y: 20 }, type: "agentDetails" },
							{ id: "model", position: { x: 20, y: 240 }, type: "modelConfig" },
							{ id: "output", position: { x: 440, y: 240 }, type: "outputParser" },
						],
						edges: [
							{ id: "agent-model", source: "agent", target: "model" },
							{ id: "agent-output", source: "agent", target: "output" },
						],
					} as any,
					metadata: { oab: true, role: "mirror_extractor", scope: "system" } as any,
				},
			});
			console.log(`ℹ️ Blueprint de Extrator de Espelho atualizado para ${owner.email}:`, exists.id);
			continue;
		}

		const blueprint = await prisma.aiAgentBlueprint.create({
			data: {
				ownerId: owner.id,
				name: "OAB — Extrator de Espelho (Blueprint)",
				description: "Agente LangGraph para extrair dados de espelhos de correção OAB usando vision",
				agentType: "CUSTOM" as any,
				icon: "mirror",
				model: "gpt-4.1",
				temperature: 0,
				maxOutputTokens: 4000,
				systemPrompt,
				instructions: systemPrompt,
				toolset: [],
				outputParser: "json",
				memory: null,
				canvasState: {
					nodes: [
						{ id: "agent", position: { x: 180, y: 20 }, type: "agentDetails" },
						{ id: "model", position: { x: 20, y: 240 }, type: "modelConfig" },
						{ id: "output", position: { x: 440, y: 240 }, type: "outputParser" },
					],
					edges: [
						{ id: "agent-model", source: "agent", target: "model" },
						{ id: "agent-output", source: "agent", target: "output" },
					],
				} as any,
				metadata: { oab: true, role: "mirror_extractor", scope: "system" } as any,
			},
		});
		console.log(`✅ Blueprint de Extrator de Espelho criado para ${owner.email}:`, blueprint.id);
	}
}

async function main() {
	try {
		await seedOabMirrorExtractorBlueprint();
		console.log("✅ Blueprint criado com sucesso!");
	} catch (error) {
		console.error("❌ Erro ao criar blueprint:", error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((e) => {
	console.error("Erro durante o seed:", e);
	process.exit(1);
});
