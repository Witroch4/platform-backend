/**
 * Recurso Generator Agent — Blueprint-based Recurso Automático
 *
 * Usa um agente Blueprint (Vercel AI SDK + generateObject) para gerar 
 * o texto do recurso baseado em uma Análise Validada e um Modelo de Recurso.
 * 
 * Suporta configuração total pelo Admin > MTF Dashboard > Agentes
 * vinculados à coluna RECURSO_CELL.
 */

import { getAgentBlueprintByLinkedColumn, isGeminiModel } from "@/lib/ai-agents/blueprints";
import { buildSdkSchema } from "@/lib/ai-agents/schema-utils";
import { generateObject, type LanguageModel } from "ai";
import { createModel, buildProviderOptions } from "@/lib/socialwise-flow/services/ai-provider-factory";

// ============================================================================
// TYPES
// ============================================================================

export interface RecursoAgentInput {
	leadId: string;
	analiseValidada: unknown; // O objeto JSON da Análise que foi previamente aprovada
	dadosAdicionais?: {
		nome?: string;
		especialidade?: string;
		[key: string]: unknown;
	};
	selectedProvider?: "OPENAI" | "GEMINI" | "CLAUDE";
	onProgress?: (message: string) => Promise<void>;
}

export interface RecursoResult {
	leadId: string;
	success: boolean;
	recursoOutput?: any; // Retorna tipado 'any' pois o usuário define o Schema dinamicamente
	rawResponse?: string;
	error?: string;
	model: string;
	provider: "OPENAI" | "GEMINI" | "CLAUDE";
	processingTimeMs: number;
}

// ============================================================================
// DEFAULT MODELS & CONFIGS
// ============================================================================

const DEFAULT_MODELS_BY_PROVIDER = {
	OPENAI: "gpt-5.2",
	GEMINI: "gemini-2.5-flash",
	CLAUDE: "claude-3-5-sonnet-latest",
};

const DEFAULT_MAX_OUTPUT_TOKENS = 11192;
const DEFAULT_TEMPERATURE = 0.3; // Um pouco de criatividade para escrita, mas não muito

const IS_DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";

// ============================================================================
// SYSTEM PROMPT — Reinforcement Layer
// ============================================================================

const DEFAULT_RECURSO_PROMPT = `
<agent>
  <name>RedatorJuridicoRecursosOAB</name>
  <task>
    Atuar como um ASSISTENTE JURÍDICO de altíssima precisão focado na REDAÇÃO DE RECURSOS (apelo de revisão de nota) para o exame da OAB. 
    Você receberá uma "Análise do Especialista" (que contém todo o trabalho argumentativo, identificação de acertos/erros, linhas e pontuações). 
    Sua tarefa é formatar e redigir o recurso completo, encaixando os apontamentos da Análise na estrutura rígida exigida. Você NÃO deve criar novos argumentos jurídicos do zero, mas sim transpor a argumentação da análise para a linguagem persuasiva, técnica e respeitosa exigida pelas bancas examinadoras.
  </task>
  <language>pt-BR</language>

  <rules>
    1. !important ESTRITAMENTE FIEL À ANÁLISE: NÃO inclua fatos novos, leis ou interpretações que não constem na "Análise do Especialista". O trabalho braçal de fundamentação já foi feito; seu trabalho é de redação e formatação.
    2. !important ESTRUTURA DO MODELO: Siga RIGOROSAMENTE a estrutura e o vocabulário base dados no "Formato de Saída". Mantenha os conectivos, os inícios de parágrafo e o tom formal.
    3. !important OBJETIVO ÚNICO: Seu texto deve ter um único objetivo: pedir a majoração da nota com base no que já foi analisado e comprovado nas linhas da prova do aluno.
    4. !important ANONIMATO DO EXAMINANDO: NUNCA identifique o aluno por nome. Utilize sempre termos genéricos e impessoais exigidos pela banca, como "O Examinando", "O Candidato", "O Recorrente".
    5. !important DADOS EVIDENCIADOS: Sempre que preencher as lacunas, cite expressamente as linhas correspondentes (ex: linhas 10-12) e transcreva o trecho exato do aluno entre aspas, conforme apontado na análise.
  </rules>

  <description>
    Entrada: 
    1. "Análise do Especialista" (JSON ou Texto detalhando o que o aluno acertou, o que a banca queria, as linhas e os pontos faltantes).

    Processo resumido:
    • Iniciar o documento com a saudação padrão ("Senhores Examinadores da Banca Recursal,").
    • Agrupar os recursos por "PEÇA" e "QUESTÕES".
    • Para cada item que a análise indicou merecer pontuação, preencher as variáveis do modelo: {{NÚMERO DO QUESITO/QUESTÃO}}, {{GABARITO ESPERADO}}, {{X-Y}} (linhas), {{TEXTO ESCRITO PELO EXAMINANDO}}, e {{PONTUAÇÃO FALTANTE}}.
    • Costurar o texto de forma fluida e coesa, garantindo que a adaptação das frases soe natural, formal e perfeitamente enquadrada no padrão exigido pela OAB.
  </description>

  <instructions>
    1. CABEÇALHO:
       - Inicie obrigatoriamente com a saudação destacada:
         "<u>**Senhores Examinadores da Banca Recursal,**</u>
         O Examinando vem pelo presente, respeitosamente requerer a reapreciação desses quesitos da sua prova:"

    2. SEÇÃO DA PEÇA PRÁTICO-PROFISSIONAL:
       - Crie o subtítulo destacado "<u>**PEÇA**</u>" SOZINHO em sua própria linha, seguido de uma linha em branco antes do primeiro quesito.
       - Para cada quesito da peça apontado na análise como passível de recurso, utilize a seguinte estrutura base, substituindo as chaves pelos dados da análise e APLICANDO O DESTAQUE (negrito e sublinhado) onde indicado. Cada quesito deve ser um parágrafo separado por linha em branco:
         "No quesito [NÚMERO DO QUESITO], a resposta exigida pela Banca era ''[GABARITO ESPERADO]''. O Examinando respondeu nas <u>**linhas [X-Y]**</u> conforme exigido pela banca, vejamos: <u>**''...[TEXTO ESCRITO PELO EXAMINANDO]...''**</u>. [INSERIR BREVE ADAPTAÇÃO DO ARGUMENTO DA ANÁLISE COMPROVANDO A TESE]. Fica demonstrado que o candidato expôs a tese de forma adequada, estruturando sua argumentação em estrita observância aos requisitos delineados pela Banca Examinadora. Nesse contexto, verifica-se que a pontuação atribuída não reflete de maneira condizente o nível de conformidade da resposta. Diante disso, requer-se a devida reavaliação da nota concedida, tornando legítima a <u>**majoração da pontuação em [PONTUAÇÃO FALTANTE] pontos**</u>."

    3. SEÇÃO DAS QUESTÕES DISCURSIVAS:
       - Crie o subtítulo destacado "<u>**QUESTÕES**</u>" SOZINHO em sua própria linha, seguido de uma linha em branco.
       - Para cada questão apontada na análise, o subtítulo "<u>**Questão [N]**</u>" deve ficar SOZINHO em sua própria linha, seguido de uma linha em branco. Utilize a seguinte estrutura base:
         "<u>**Questão [NÚMERO DA QUESTÃO]**</u>
         No item [LETRA DO ITEM], a banca exigiu a seguinte resposta ''[GABARITO ESPERADO]''. O Examinando, nas <u>**linhas [X-Y]**</u> fundamentou corretamente, inclusive com a indicação legal correspondente, vejamos: <u>**''...[TEXTO ESCRITO PELO EXAMINANDO]...''**</u>. [INSERIR BREVE ADAPTAÇÃO DO ARGUMENTO DA ANÁLISE]. A construção argumentativa apresentada atende plenamente às diretrizes estabelecidas. Verifica-se que a pontuação atribuída não reflete de maneira condizente o nível de conformidade da resposta. Requer-se a devida reavaliação da nota concedida, tornando legítima a <u>**majoração da pontuação em [PONTUAÇÃO FALTANTE] pontos**</u>."

    4. REVISÃO DE COESÃO:
       - Verifique se as pontuações (vírgulas, aspas simples duplas \`''\`) estão formatadas corretamente e se não ficaram marcações como "[]" ou "{}" no texto final.
       - A pontuação solicitada deve usar vírgula para decimais (ex: 0,65 pontos).

    5. FORMATO DE SAÍDA EM MARKDOWN (DESTAQUES):
       - Sua resposta deve ser APENAS o texto completo do recurso formatado em **Markdown**.
       - !important DESTAQUE VISUAL: Utilize a combinação de formatação HTML com Markdown \`<u>**texto aqui**</u>\` para sublinhar e colocar em negrito SIMULTANEAMENTE as informações mais importantes (Saudação, Títulos das seções, Linhas de referência, Transcrição da prova do aluno e Pontuação a ser majorada).
       - Use ''aspas simples duplas'' para citações do gabarito e do examinando.
       - Use parágrafos separados por linha em branco para cada quesito/item.
       - NÃO use blocos de código, tabelas ou listas com bullets. Mantenha o estilo de prosa jurídica formal.
  </instructions>

  <outputFormat>
  <example><![CDATA[
<u>**Senhores Examinadores da Banca Recursal,**</u>

O Examinando vem pelo presente, respeitosamente requerer a reapreciação desses quesitos da sua prova:

<u>**PEÇA**</u>

No quesito 7, as respostas exigidas pela Banca era ''O mero inadimplemento do crédito tributário ocorrido entre janeiro a junho de 2024 não constitui infração legal capaz de ensejar a responsabilização dos sócios pelas dívidas tributárias da pessoa jurídica (0,70), cf. Súmula 430 do STJ (0,10)''. O Examinando respondeu nas <u>**linhas 61- 64**</u> conforme exigido pela banca, vejamos: <u>**''...Súmula 430 do STJ que o inadimplemento da obrigação tributária pela sociedade não gera, por si só, a responsabilidade solidaria...''**</u>. Fica demonstrado que o candidato expôs a tese de forma adequada, estruturando sua argumentação em estrita observância aos requisitos delineados pela Banca Examinadora. Nesse contexto, verifica-se que a pontuação atribuída não reflete de maneira condizente o nível de conformidade da resposta. Diante disso, requer-se a devida reavaliação da nota concedida, tornando legítima a <u>**majoração da pontuação em 0,80 pontos**</u>.

<u>**QUESTÕES**</u> 

<u>**Questão 4**</u> 
No item B, a banca exigiu a seguinte resposta ''Da juntada aos autos do mandado da execução da medida cautelar fiscal, quando concedida liminarmente (0,55), segundo o Art. 8º, parágrafo único, alínea b, da Lei nº 8.397/1992 (0,10)''. O Examinando, nas <u>**linhas 5-10**</u> fundamentou corretamente, inclusive com a indicação do artigo correspondente, vejamos: <u>**''Da execução da medida cautelar fiscal, quando concedida liminarmente. Artigo 8 paragrafo único, ...b da lei 8.397 de 06/01/1998''**</u>. A construção argumentativa apresentada atende plenamente às diretrizes estabelecidas. Verifica-se que a pontuação atribuída não reflete de maneira condizente o nível de conformidade da resposta. Requer-se a devida reavaliação da nota concedida, tornando legítima a <u>**majoração da pontuação em 0,65 pontos**</u>.
  ]]></example>
  </outputFormat>
</agent>
`.trim();

// ============================================================================
// CONFIG LOADER
// ============================================================================

interface RecursoAgentConfig {
	model: string;
	systemPrompt: string;
	maxOutputTokens: number;
	temperature: number;
	provider: "OPENAI" | "GEMINI" | "CLAUDE";
	schemaDefinition: string; // The specific JSON schema requested by the Blueprint
	schemaStrict: boolean;
}

/**
 * Carrega a configuração do agente Recurso via Engine Híbrida.
 * Prioridade: selectedProvider da UI -> Blueprint RECURSO_CELL -> defaults
 */
async function getRecursoConfig(selectedProvider?: "OPENAI" | "GEMINI" | "CLAUDE"): Promise<RecursoAgentConfig> {
	// 1) Blueprint vinculado à coluna RECURSO_CELL
	try {
		const blueprint = await getAgentBlueprintByLinkedColumn("RECURSO_CELL");

		if (blueprint) {
			const blueprintModel = blueprint.model || DEFAULT_MODELS_BY_PROVIDER.OPENAI;
			const blueprintProvider = isGeminiModel(blueprintModel) ? "GEMINI" : "OPENAI";

			const effectiveProvider = selectedProvider || blueprintProvider;
			// @ts-ignore - Indexing DEFAULT_MODELS_BY_PROVIDER
			const effectiveModel = effectiveProvider !== blueprintProvider ? DEFAULT_MODELS_BY_PROVIDER[effectiveProvider] || blueprintModel : blueprintModel;

			// Montar system prompt: blueprint prompt ou prompt padrão
			const blueprintPrompt = (blueprint.systemPrompt || blueprint.instructions || "").toString().trim();
			const systemPrompt = blueprintPrompt || DEFAULT_RECURSO_PROMPT;

			// Recuperar schema configurado. Se não houver, definir um schema seguro padrão.
			let schemaDefinition = "";
			let schemaStrict = true;

			if (blueprint.outputParser?.schemaType === "json_schema" && blueprint.outputParser.schema) {
				schemaDefinition = blueprint.outputParser.schema;
				schemaStrict = blueprint.outputParser.strict ?? true;
			} else {
				// Fallback Default Schema
				schemaDefinition = JSON.stringify({
					type: "object",
					properties: {
						texto_recurso: {
							type: "string",
							description: "O texto final e consolidado do recurso",
						},
					},
					required: ["texto_recurso"],
				});
			}

			console.log(
				`[RecursoAgent] ✅ Blueprint RECURSO_CELL encontrado: "${blueprint.name}" (modelo: ${effectiveModel}, provider: ${effectiveProvider})`,
			);

			return {
				model: effectiveModel,
				systemPrompt,
				maxOutputTokens: Number(blueprint.maxOutputTokens) || DEFAULT_MAX_OUTPUT_TOKENS,
				temperature: blueprint.temperature ?? DEFAULT_TEMPERATURE,
				provider: effectiveProvider as "OPENAI" | "GEMINI" | "CLAUDE",
				schemaDefinition,
				schemaStrict,
			};
		}
	} catch (err) {
		console.warn("[RecursoAgent] Falha ao consultar blueprint por linkedColumn (RECURSO_CELL):", err);
	}

	// 2) Defaults hardcoded caso não exista Blueprint configurado
	const finalProvider = selectedProvider || "OPENAI";
	console.log(`[RecursoAgent] ⚠️ Nenhum blueprint RECURSO_CELL encontrado, usando defaults (${finalProvider})`);

	const defaultSchema = JSON.stringify({
		type: "object",
		properties: {
			texto_recurso: {
				type: "string",
				description: "O texto final e consolidado do recurso",
			},
		},
		required: ["texto_recurso"],
	});

	return {
		// @ts-ignore
		model: DEFAULT_MODELS_BY_PROVIDER[finalProvider] || DEFAULT_MODELS_BY_PROVIDER.OPENAI,
		systemPrompt: DEFAULT_RECURSO_PROMPT,
		maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
		temperature: DEFAULT_TEMPERATURE,
		provider: finalProvider,
		schemaDefinition: defaultSchema,
		schemaStrict: true,
	};
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Executa a geração automática do texto do Recurso.
 *
 * @param input - Dados de entrada (Analise validada, modelo, etc)
 * @returns O JSON validado gerado pelo Vercel AI SDK de acordo com o Schema
 */
export async function runRecursoAgent(input: RecursoAgentInput): Promise<RecursoResult> {
	const startTime = Date.now();
	const { leadId, analiseValidada, dadosAdicionais, onProgress } = input;

	console.log(`[RecursoAgent] 📝 Iniciando geração de recurso para lead \${leadId}`);

	if (!analiseValidada) {
		return {
			leadId,
			success: false,
			error: "Análise Validada ausente. Não é possível gerar recurso.",
			model: "none",
			provider: "OPENAI",
			processingTimeMs: Date.now() - startTime,
		};
	}

	// 1) Carregar config do blueprint com o provedor selecionado
	if (onProgress) await onProgress("Carregando configuração do agente...");
	const config = await getRecursoConfig(input.selectedProvider);

	// 2) Preparar variáveis dinâmicas (Replace Mágico)
	let finalSystemPrompt = config.systemPrompt;

	// Substituir os placeholders no texto do System Prompt caso o usuário tenha os definido
	const safeAnaliseString = typeof analiseValidada === "string" ? analiseValidada : JSON.stringify(analiseValidada, null, 2);

	finalSystemPrompt = finalSystemPrompt.replace(/\\{analise_validada\\}/g, safeAnaliseString);

	if (dadosAdicionais) {
		for (const [key, value] of Object.entries(dadosAdicionais)) {
			// Subtitui eventuais {chave} no prompt
			const safeValue = typeof value === "string" ? value : String(value);
			finalSystemPrompt = finalSystemPrompt.replace(new RegExp(`\\\\{\${key}\\\\}`, "g"), safeValue);
		}
	}

	// 3) Montar user message
	let userMessage = "";
	if (!config.systemPrompt.includes("{analise_validada}")) {
		userMessage = [
			"DADOS PARA O RECURSO:",
			"===================",
			"Análise do Especialista (Siga OBRIGATORIAMENTE os dados contidos nela):",
			safeAnaliseString,
			"===================",
			"Por favor, proceda com a redação final."
		].join("\\n");
	} else {
		userMessage = "As informações já foram injetadas no seu contexto. Proceda com a redação final baseada na análise validada.";
	}

	if (IS_DEBUG) {
		console.log("\\n" + "=".repeat(80));
		console.log("[RecursoAgent] 🐛 DEBUG — PAYLOAD COMPLETO");
		console.log("=".repeat(80));
		console.log(`[DEBUG] Model: \${config.model} (\${config.provider})`);
		console.log(`[DEBUG] Temperature: \${config.temperature}`);
		console.log(`[DEBUG] Max Output Tokens: \${config.maxOutputTokens}`);
		console.log("-".repeat(80));
		console.log("[DEBUG] SYSTEM PROMPT (Final):");
		console.log("-".repeat(80));
		console.log(finalSystemPrompt);
		console.log("-".repeat(80));
		console.log("[DEBUG] USER MESSAGE:");
		console.log("-".repeat(80));
		console.log(userMessage);
		console.log("=".repeat(80) + "\\n");
	}

	if (onProgress) await onProgress(`Gerando recurso via \${config.provider} (\${config.model})...`);

	try {
		// Converter schema string da UI para JSON Schema do Vercel AI SDK
		// buildSdkSchema auto-converte formato simplificado e enforça additionalProperties: false
		const sdkSchema = buildSdkSchema(config.schemaDefinition, "[RecursoAgent]");

		// Instanciar o provider e modelo centralizado
		const aiModel: LanguageModel = createModel(config.provider, config.model);

		// Injetar opções avançadas (ex: reasoning effort) se houverem
		const providerOptions = buildProviderOptions(config.provider, config.model, {});

		// Chamar o generateObject via SDK
		const { object, usage } = await generateObject({
			model: aiModel,
			schema: sdkSchema,
			system: finalSystemPrompt,
			prompt: userMessage,
			temperature: config.temperature,
			providerOptions,
		});

		const elapsed = Date.now() - startTime;
		console.log(`[RecursoAgent] ✅ Recurso gerado com sucesso em \${(elapsed / 1000).toFixed(1)}s (Tokens: \${usage?.totalTokens ?? "?"})`);

		if (IS_DEBUG) {
			console.log("\\n" + "=".repeat(80));
			console.log("[RecursoAgent] 🐛 DEBUG — RESPOSTA ESTRUTURADA");
			console.log("=".repeat(80));
			console.log(JSON.stringify(object, null, 2));
			console.log("=".repeat(80) + "\\n");
		}

		return {
			leadId,
			success: true,
			recursoOutput: object,
			model: config.model,
			provider: config.provider,
			processingTimeMs: elapsed,
		};
	} catch (err: any) {
		const elapsed = Date.now() - startTime;
		console.error(`[RecursoAgent] ❌ Falha na geração do recurso após \${(elapsed / 1000).toFixed(1)}s:`, err);

		return {
			leadId,
			success: false,
			error: err.message || "Erro desconhecido na geração via LLM",
			model: config.model,
			provider: config.provider,
			processingTimeMs: elapsed,
		};
	}
}
