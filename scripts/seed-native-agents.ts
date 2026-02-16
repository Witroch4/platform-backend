// Script para criar blueprints nativos OAB e EVAL com Engine Híbrida
import "dotenv/config";
import { getPrismaInstance } from "../lib/connections";

const prisma = getPrismaInstance();

// Tipos locais para Engine Híbrida (correspondem aos enums do Prisma)
type LinkedColumn = "PROVA_CELL" | "ESPELHO_CELL" | "ANALISE_CELL" | "RECURSO_CELL";
type AiProvider = "OPENAI" | "GEMINI";

/**
 * Modelos de Vision disponíveis (ordenados por capacidade):
 *
 * GEMINI (requer GEMINI_API_KEY) - RECOMENDADO para OCR de manuscritos:
 * - gemini-3-flash-preview  → Agentic Vision com code execution (zoom/crop automático)
 * - gemini-3-pro-preview    → Mais avançado, melhor para código e raciocínio
 * - gemini-2.5-pro          → Pro com thinking nativo
 * - gemini-2.5-flash        → Flash com thinking
 *
 * OPENAI (requer OPENAI_API_KEY):
 * - gpt-4.1                 → Melhor OpenAI para visão
 * - gpt-4.1-mini            → Balanceado custo/qualidade
 * - gpt-4o                  → Multimodal avançado
 *
 * ENGINE HÍBRIDA:
 * - linkedColumn: vincula o agente a uma coluna específica da tabela (PROVA_CELL, ESPELHO_CELL)
 * - defaultProvider: provedor padrão (OPENAI ou GEMINI)
 * - O sistema injeta automaticamente instruções técnicas do Gemini Agentic Vision quando necessário
 */
const NATIVE_AGENTS: Array<{
	name: string;
	description: string;
	agentType: "CUSTOM";
	icon: string;
	model: string;
	temperature: number;
	maxOutputTokens: number;
	systemPrompt: string;
	linkedColumn: LinkedColumn;
	defaultProvider: AiProvider;
	metadata: Record<string, unknown>;
}> = [
	{
		name: "OAB — Transcritor de Provas (Blueprint)",
		description:
			"Agente nativo para transcrever e extrair texto de provas OAB usando visão computacional. Suporta OpenAI e Gemini com Agentic Vision.",
		agentType: "CUSTOM",
		icon: "file-text",
		model: "gemini-3-flash-preview", // Gemini 3 Flash com Agentic Vision para OCR de manuscritos
		temperature: 0,
		maxOutputTokens: 0, // 0 = ilimitado (usa padrão máximo do modelo)
		systemPrompt: [
			"Você é O ESCRIVÃO — um agente especializado em transcrição de provas manuscritas da OAB.",
			"Sua tarefa é extrair com precisão 100% IPSIS LITTERIS todo o texto visível nas imagens de provas.",
			"",
			"COMPORTAMENTO DO ESCRIVÃO:",
			"1. Fase de Visão: Identifique todas as regiões de texto na imagem",
			"2. Fase de Investigação: Para regiões difíceis de ler, investigue ativamente (zoom/crop)",
			"3. Fase de Transcrição: Transcreva EXATAMENTE o que está escrito - se o aluno errou, mantenha o erro",
			"4. Fase de Verificação: Revise a transcrição final para garantir fidelidade",
			"",
			"REGRAS OBRIGATÓRIAS:",
			"- NUNCA corrija erros ortográficos ou gramaticais do aluno - sua função é TRANSCREVER, não corrigir",
			"- Mantenha a formatação original do texto (parágrafos, numeração, estrutura)",
			"- Se algo não estiver legível após investigação, indique com [ilegível]",
			'- Para cada página, use o formato: "Questão: <número>" ou "Peça Página: <número>"',
			'- Sempre inclua "Resposta do Aluno:" seguido das linhas numeradas (Linha 1, Linha 2...)',
			"- Retorne apenas o texto extraído, sem comentários adicionais",
			"",
			"PRECISÃO É MAIS IMPORTANTE QUE VELOCIDADE. Investigue cada caractere duvidoso.",
		].join("\n"),
		linkedColumn: "PROVA_CELL",
		defaultProvider: "GEMINI",
		metadata: {
			oab: true,
			role: "transcriber",
			scope: "system",
			native: true,
			autoSeed: true,
			agenticVision: true, // Indica que usa Agentic Vision do Gemini 3
		},
	},
	{
		name: "OAB — Extrator de Espelho (Blueprint)",
		description:
			"Agente nativo para extrair dados de espelhos de correção OAB usando vision. Suporta OpenAI e Gemini com Agentic Vision.",
		agentType: "CUSTOM",
		icon: "mirror",
		model: "gemini-3-flash-preview", // Gemini 3 Flash com Agentic Vision
		temperature: 0,
		maxOutputTokens: 0, // 0 = ilimitado (usa padrão máximo do modelo)
		systemPrompt: [
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
			"- Se houver dúvida sobre um número, investigue ativamente (zoom na região)",
		].join("\n"),
		linkedColumn: "ESPELHO_CELL",
		defaultProvider: "GEMINI",
		metadata: {
			oab: true,
			role: "mirror_extractor",
			scope: "system",
			native: true,
			autoSeed: true,
			agenticVision: true,
		},
	},
	{
		name: "OAB — Analista de Prova (Blueprint)",
		description:
			"Agente nativo para análise comparativa Prova × Espelho. Identifica acertos não pontuados pela banca e gera insumos para recurso. Suporta OpenAI e Gemini.",
		agentType: "CUSTOM",
		icon: "search",
		model: "gpt-5.2", // GPT-5.2 para raciocínio analítico profundo
		temperature: 0,
		maxOutputTokens: 16384,
		systemPrompt: [
			"Você é um ANALISTA JURÍDICO ESPECIALIZADO em provas da OAB (2ª Fase).",
			'Sua missão: comparar "TEXTO DA PROVA" × "ESPELHO DA PROVA" e identificar acertos do examinando que NÃO foram pontuados pela banca.',
			"",
			"COMPORTAMENTO DO ANALISTA:",
			"1. Fase de Leitura: Leia integralmente o espelho de correção e identifique todos os itens avaliados com suas notas.",
			"2. Fase de Comparação: Para cada item onde nota_aluno < nota_maxima, verifique se o conteúdo exigido está presente na prova.",
			'3. Fase de Localização: Cite as linhas exatas (formato "Linhas XX-YY") onde o acerto está redigido.',
			"4. Fase de Argumentação: Construa frases objetivas para fundamentar o recurso.",
			"",
			"REGRAS OBRIGATÓRIAS:",
			"- ANÁLISE OTIMISTA: A banca frequentemente erra. Analise com viés favorável ao examinando.",
			"- APENAS ACERTOS EXISTENTES: Aponte somente o que o aluno EFETIVAMENTE escreveu e não foi contabilizado.",
			"- PROIBIDO: Sugerir melhorias de redação, estrutura ou estratégia. O examinando não pode reescrever a prova.",
			"- PROIBIDO: Inserir qualquer conteúdo que não exista na prova.",
			"- PROIBIDO: Ultrapassar o teto de pontuação previsto no espelho.",
			"- PROIBIDO: Atribuir pontos para itens que o aluno já recebeu pontuação justa.",
			"- nota_maxima_peca = 5.00 e nota_maxima_questoes = 5.00, total máximo = 10.00.",
			"- SEMPRE analise Peça Profissional E Questões. Nunca pule seções.",
			"- SAÍDA EXCLUSIVAMENTE JSON: Resposta DEVE começar com { e terminar com }. NENHUM texto fora do JSON.",
			'- Todas as referências a trechos devem citar linhas exatas: "Linhas XX-YY".',
			"",
			"REGRAS TÉCNICAS DO JSON:",
			'- Escape aspas duplas internas com \\"',
			"- Use \\n para quebras de linha dentro de strings",
			"- Sem vírgulas pendentes no final de arrays/objetos",
			"- Valide mentalmente a estrutura antes de retornar",
			"",
			'Se faltar TEXTO DA PROVA ou ESPELHO DA PROVA: retorne {"erro":"Blocos obrigatórios ausentes."}',
		].join("\n"),
		linkedColumn: "ANALISE_CELL",
		defaultProvider: "OPENAI",
		metadata: {
			oab: true,
			role: "analyzer",
			scope: "system",
			native: true,
			autoSeed: true,
			agenticVision: false, // Análise é text-only, não precisa de vision
		},
	},
];

async function seedNativeAgents() {
	console.log("🧩 Verificando e criando Blueprints Nativos OAB/EVAL...");

	const owners = await prisma.user.findMany({
		where: { role: "SUPERADMIN" },
		select: { id: true, email: true },
	});

	if (!owners || owners.length === 0) {
		console.warn("⚠️ Nenhum SUPERADMIN encontrado. Pulando seed de agentes nativos...");
		return;
	}

	for (const owner of owners) {
		for (const agentData of NATIVE_AGENTS) {
			const exists = await prisma.aiAgentBlueprint.findFirst({
				where: {
					ownerId: owner.id,
					name: agentData.name,
				},
				select: { id: true, name: true },
			});

			if (exists) {
				console.log(`ℹ️ Blueprint "${agentData.name}" já existe para ${owner.email}`);
				continue;
			}

			// Cast para contornar validação de tipo até o Prisma Client ser regenerado após migração
			const createData = {
				ownerId: owner.id,
				name: agentData.name,
				description: agentData.description,
				agentType: agentData.agentType,
				icon: agentData.icon,
				model: agentData.model,
				temperature: agentData.temperature,
				maxOutputTokens: agentData.maxOutputTokens,
				systemPrompt: agentData.systemPrompt,
				instructions: agentData.systemPrompt,
				toolset: [],
				outputParser: "json",
				// Engine Híbrida: vinculação de agente a coluna da tabela
				linkedColumn: agentData.linkedColumn,
				defaultProvider: agentData.defaultProvider,
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
				},
				metadata: agentData.metadata,
			} as any;

			const blueprint = await prisma.aiAgentBlueprint.create({ data: createData });
			console.log(`✅ Blueprint "${agentData.name}" criado para ${owner.email}:`, blueprint.id);
			console.log(`   📌 Vinculado à coluna: ${agentData.linkedColumn} | Provider: ${agentData.defaultProvider}`);
		}
	}
}

async function main() {
	try {
		await seedNativeAgents();
		console.log("✅ Seed de agentes nativos concluído!");
	} catch (error) {
		console.error("❌ Erro ao criar blueprints nativos:", error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

// Permite executar diretamente ou importar como função
if (require.main === module) {
	main().catch((e) => {
		console.error("Erro durante o seed:", e);
		process.exit(1);
	});
}

export { seedNativeAgents };
