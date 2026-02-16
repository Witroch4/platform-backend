//app\api\chatwitia\route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { Message } from "@/hooks/useChatwitIA";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { uploadToMinIO } from "@/lib/minio";
import { openaiChatWithCost, responsesCall } from "@/lib/cost/openai-wrapper";
// @ts-ignore - Adding Anthropic SDK
// Removido Anthropic (focar somente OpenAI)

// Declare the global latestOSeriesModels variable type
declare global {
	var latestOSeriesModels: Record<string, string>;
	var modelIdCache: { [key: string]: { id: string; ts: number } } | undefined;
}

// Change to Node.js runtime to support Prisma
export const runtime = "nodejs";

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

// Anthropic removido

// ====== [NOVO] Classificação de intenção + capacidades por modelo ======
type Intent = "chat" | "image_generate" | "image_edit" | "image_analyze" | "web_search" | "other";

const MODEL_CAPS: Record<string, { tools: { image_generation?: boolean; web_search_preview?: boolean } }> = {
	// Seu padrão de chat: não anexe hosted tools aqui
	"gpt-5-chat-latest": { tools: {} },

	// Modelos com hosted tool de geração de imagem na Responses API
	"gpt-5": { tools: { image_generation: true } },
	"gpt-5-nano": { tools: { image_generation: true } },
	"gpt-4o-2024-11-20": { tools: { image_generation: true, web_search_preview: true } },
	"gpt-4o-2024-08-06": { tools: { image_generation: true, web_search_preview: true } },
	"gpt-4o-2024-05-13": { tools: { image_generation: true } },
	"gpt-4.1-2025-04-14": { tools: { image_generation: true, web_search_preview: true } },
	"gpt-4.1-mini-2025-04-14": { tools: { image_generation: true, web_search_preview: true } },
	"gpt-4.1-nano-2025-04-14": { tools: { image_generation: true } },
	"o4-mini": { tools: { image_generation: true, web_search_preview: true } },
	o3: { tools: { image_generation: true } },
	"o3-mini": { tools: { image_generation: true } },
};

function hasToolSupport(modelId: string, tool: keyof (typeof MODEL_CAPS)["gpt-5-chat-latest"]["tools"]): boolean {
	if (MODEL_CAPS[modelId]?.tools?.[tool]) return true;
	const base = modelId.replace(/-\d{4}-\d{2}-\d{2}$/, "");
	return !!MODEL_CAPS[base]?.tools?.[tool];
}

function pickImageCapableFallback(requested: string): string {
	// Preferências: manter família se possível → cair para 4o estável → 4.1-mini
	const order = [requested, "gpt-4o-2024-11-20", "o4-mini", "gpt-4.1-mini-2025-04-14"];
	return order.find((m) => hasToolSupport(m, "image_generation")) || "gpt-4o-2024-11-20";
}

async function classifyTurn(messages: Message[]): Promise<{ intent: Intent; reasons: string[] }> {
	// Extrai o último texto do usuário (PT/EN).
	const lastUser = [...messages].reverse().find((m) => m.role === "user");
	let text = "";
	if (lastUser) {
		if (typeof lastUser.content === "string") text = lastUser.content;
		else if (Array.isArray(lastUser.content)) {
			text = lastUser.content
				.map((c: any) => (typeof c?.text === "string" ? c.text : ""))
				.join(" ")
				.trim();
		}
	}

	try {
		// Use the regular chat completions API for intent classification with cost tracking
		const res = await openaiChatWithCost(
			openai,
			"gpt-4o-mini", // Use a reliable model for classification
			[
				{
					role: "user",
					content: `Classifique a intenção do usuário (pt/en).
Categorias:
- chat: conversa normal
- image_generate: quer GERAR uma imagem nova
- image_edit: quer EDITAR imagem fornecida (arquivo/URL)
- image_analyze: quer ANALISAR imagem fornecida (arquivo/URL)
- web_search: quer buscar informação atualizada na web
- other: qualquer outra

Retorne SOMENTE um JSON com formato: {"intent": "categoria", "reasons": ["motivo1", "motivo2"]}

Texto do usuário:
"""${text}"""`,
				},
			],
			{
				traceId: `intent-classification-${Date.now()}`,
				intent: "intent_classification",
			},
		);

		const out = JSON.parse(res.choices[0]?.message?.content || "{}");
		return { intent: out.intent || "chat", reasons: out.reasons || [] };
	} catch (e) {
		console.warn("⚠️ Falha ao classificar intenção; assumindo 'chat'.", e);
		return { intent: "chat", reasons: [] };
	}
}
// ====== [FIM] Classificação / capacidades ======

export async function POST(req: Request) {
	try {
		const bodyData: any = await req.json();
		const {
			messages,
			model = "gpt-4o-latest",
			sessionId,
			generateSummary = false,
			document,
			stream = false,
			fileIds = [],
			previousResponseId,
			webSearchActive = false,
		} = bodyData;

		console.log(`Recebida requisição para o modelo: ${model}`);
		console.log(`Sessão ID: ${sessionId || "nova sessão"}`);
		console.log(`Número de mensagens: ${messages?.length || 0}`);
		console.log(`Streaming habilitado: ${stream}`);
		console.log(`Web Search ativo: ${webSearchActive}`);
		console.log(`Previous Response ID recebido: ${previousResponseId || "nenhum"}`);
		console.log(`Captain Playground: ${!!bodyData?.captainPlayground}`);
		if (fileIds.length > 0) {
			console.log(`Arquivos referenciados: ${fileIds.length} (${fileIds.join(", ")})`);
		}

		if (!messages || !Array.isArray(messages)) {
			return NextResponse.json({ error: "Mensagens inválidas" }, { status: 400 });
		}

		// 🔗 Determinar o responseId a ser usado (se fornecido)
		let finalPreviousResponseId = previousResponseId || null;

		// Removido suporte a Anthropic/Claude
		const isClaudeModel = false;

		// Verifica se há conteúdo de áudio nas mensagens
		const hasAudioContent = messages.some((msg: any) => {
			if (Array.isArray(msg.content)) {
				return msg.content.some((item: any) => item.type === "audio" && item.audio_data);
			}
			return false;
		});

		// Se tiver conteúdo de áudio, usar o modelo de áudio automaticamente (somente para OpenAI)
		let modelToUse = hasAudioContent && !isClaudeModel ? "gpt-4o-audio-preview" : model;

		// Se web search estiver ativo e o modelo for gpt-4.1-nano, trocar por gpt-4.1-mini
		if (webSearchActive && (modelToUse === "gpt-4.1-nano" || modelToUse === "gpt-4.1-nano-latest")) {
			console.log(`🔄 Web Search ativo: trocando modelo ${modelToUse} por gpt-4.1-mini (nano não suporta web search)`);
			modelToUse = "gpt-4.1-mini";
		}

		// Para modelos da família GPT-4o ou modelos com sufixo -o, garantir que usamos a responses.create API
		// quando temos arquivos anexados
		const isFileCompatibleModel =
			modelToUse === "gpt-4o" ||
			modelToUse.includes("gpt-4o") ||
			modelToUse.startsWith("gpt-5") || // ✅ gpt-5 suporta arquivos
			modelToUse.includes("-o") ||
			modelToUse.startsWith("o");

		if (fileIds.length > 0 && !isFileCompatibleModel) {
			console.log("Arquivos detectados, forçando upgrade para modelo gpt-4o que suporta arquivos");
			modelToUse = "gpt-4o-latest";
		}

		// Verifique se temos um documento para processar
		if (document) {
			// Exemplo: extrair texto do documento e adicionar ao contexto
			const documentText = document.content;

			// Adicionar o conteúdo do documento como contexto para o modelo
			const documentSystemMessage = {
				role: "system",
				content: `O usuário enviou um documento chamado "${document.name}". Aqui está o conteúdo do documento:\n\n${documentText}\n\nPor favor, considere este documento ao responder.`,
			};

			// Adicionar mensagem de sistema adicional com o conteúdo do documento
			messages.push(documentSystemMessage);
		}

		// Determinar qual handler usar com base no modelo
		let aiResponse;
		// Passar fileIds para o handler da OpenAI quando presentes
		aiResponse = await handleOpenAIRequest(
			messages,
			modelToUse,
			sessionId,
			fileIds,
			finalPreviousResponseId,
			webSearchActive,
			!!bodyData?.captainPlayground,
		);

		// Se o streaming estiver habilitado, retorne diretamente a resposta
		if (stream) {
			return aiResponse;
		}

		// Se precisamos gerar um resumo para o título do chat e temos um ID de sessão válido
		if (generateSummary && sessionId) {
			const session = await auth();
			if (session?.user?.id) {
				try {
					// Verificar se a sessão pertence ao usuário
					const chatSession = await getPrismaInstance().chatSession.findUnique({
						where: {
							id: sessionId,
							userId: session.user.id,
						},
					});

					if (chatSession) {
						// Encontrar a primeira mensagem do usuário
						const firstUserMessage = messages.find((m) => m.role === "user");
						if (firstUserMessage) {
							// Extrair as primeiras palavras da mensagem (até 5 palavras)
							let content = "";
							if (typeof firstUserMessage.content === "string") {
								content = firstUserMessage.content;
							} else if (Array.isArray(firstUserMessage.content)) {
								const textContent = firstUserMessage.content.find((item: any) => item.type === "text" && item.text);
								content = textContent ? textContent.text : "[Conteúdo não textual]";
							}

							// Pegar as primeiras 5 palavras e adicionar reticências se necessário
							const words = content.split(/\s+/).filter(Boolean);
							const summary = words.slice(0, 5).join(" ") + (words.length > 5 ? "..." : "");

							// Atualizar o título da sessão no banco de dados
							await getPrismaInstance().chatSession.update({
								where: { id: sessionId },
								data: {
									title: summary,
									summary: summary,
								},
							});

							// Extrair os dados da resposta (já em formato JSON)
							const responseData = await aiResponse.json();

							// Incluir o resumo na resposta
							return NextResponse.json({
								response: responseData.response,
								summary,
							});
						}
					}
				} catch (error) {
					console.error("Erro ao gerar resumo:", error);
					// Se falhar o resumo, retornar apenas a resposta
				}
			}
		}

		return aiResponse;
	} catch (error) {
		console.error("ChatwitIA error:", error);
		return NextResponse.json({ error: "Erro no processamento da solicitação" }, { status: 500 });
	}
}

export async function GET() {
	try {
		// Buscar lista de modelos disponíveis na API da OpenAI
		const modelsList = await openai.models.list();

		console.log("📊 Total de modelos encontrados na API da OpenAI:", modelsList.data.length);
		console.log("🔍 Lista completa de modelos:");
		modelsList.data.forEach((model, index) => {
			console.log(`  ${index + 1}. ${model.id}`);
		});

		// 🔧 Categorização dinâmica — reconhece gpt-5, gpt-6… automaticamente
		const buildDynamicCategories = (list: any[]) => {
			const cats: Record<string, any[]> = {
				gpt4o: [],
				oSeries: [],
				embedding: [],
				audio: [],
				image: [],
				other: [],
			};
			for (const m of list) {
				const id: string = m.id || "";
				if (/^o\d/.test(id)) {
					cats.oSeries.push(m);
					continue;
				}
				if (/embedding/.test(id)) {
					cats.embedding.push(m);
					continue;
				}
				if (/whisper/.test(id)) {
					cats.audio.push(m);
					continue;
				}
				if (/dall-e|^image-/.test(id)) {
					cats.image.push(m);
					continue;
				}
				if (/^gpt-4o/.test(id)) {
					cats.gpt4o.push(m);
					continue;
				}
				// gpt-N (pega 5,6,7…); mantém buckets separados: gpt5, gpt6, etc.
				const gptMajor = id.match(/^gpt-(\d)(?:[.-]|$)/);
				if (gptMajor) {
					const key = `gpt${gptMajor[1]}`;
					(cats as any)[key] ||= [];
					(cats as any)[key].push(m);
					continue;
				}
				cats.other.push(m);
			}
			return cats;
		};
		const categorizedModels = buildDynamicCategories(modelsList.data);

		// Log das categorias criadas
		console.log("📂 Categorias de modelos criadas:");
		Object.entries(categorizedModels).forEach(([category, models]) => {
			console.log(`  📁 ${category}: ${models.length} modelo(s)`);
			if (models.length > 0) {
				models.forEach((model) => {
					console.log(`    - ${model.id}`);
				});
			}
		});

		// Criar um mapa para armazenar as versões mais recentes dos modelos da série O
		global.latestOSeriesModels = {};

		// Função para extrair a data de um ID de modelo (ex: o1-2024-12-17 -> 2024-12-17)
		const extractDate = (modelId: string): string | null => {
			const match = modelId.match(/(\d{4}-\d{2}-\d{2})/);
			return match ? match[1] : null;
		};

		// Para cada tipo de modelo da série O, encontrar a versão mais recente disponível
		const oModelTypes = ["o1", "o1-mini", "o1-pro", "o1-preview", "o4-mini"];
		oModelTypes.forEach((baseModel) => {
			// Filtrar modelos que começam com o tipo base (ex: todos os modelos 'o1-mini-*')
			const modelsOfType = categorizedModels.oSeries.filter(
				(m) => m.id === baseModel || m.id.startsWith(`${baseModel}-`),
			);

			if (modelsOfType.length > 0) {
				// Ordenar por data (mais recente primeiro)
				modelsOfType.sort((a, b) => {
					const dateA = extractDate(a.id);
					const dateB = extractDate(b.id);

					// Se não tem data, coloca por último
					if (!dateA) return 1;
					if (!dateB) return -1;

					// Comparar datas (mais recente primeiro)
					return dateB.localeCompare(dateA);
				});

				// Armazenar o modelo mais recente no mapa global
				global.latestOSeriesModels[baseModel] = modelsOfType[0].id;
				console.log(`✅ Modelo mais recente para ${baseModel}: ${modelsOfType[0].id}`);
			} else {
				console.log(`⚠️ Nenhum modelo disponível para ${baseModel}`);
			}
		});

		// Log do mapa final de modelos O series
		console.log("🧠 Mapa de modelos O Series mais recentes:");
		Object.entries(global.latestOSeriesModels).forEach(([base, latest]) => {
			console.log(`  ${base} → ${latest}`);
		});

		// Removido: busca de modelos da Anthropic

		// Imprimir todos os modelos para debug
		// console.log('Todos os modelos disponíveis:', modelsList.data.map(m => m.id));
		//console.log('Modelos O Series:', modelsList.data.filter(m => /^o[1-9]/.test(m.id)).map(m => m.id));

		// Log do cache de modelos (se existir)
		if (global.modelIdCache) {
			console.log("💾 Cache de modelos ativo:");
			Object.entries(global.modelIdCache).forEach(([base, cache]) => {
				const age = Math.round((Date.now() - cache.ts) / 1000);
				console.log(`  ${base} → ${cache.id} (cacheado há ${age}s)`);
			});
		} else {
			console.log("💾 Cache de modelos: vazio");
		}

		console.log("✅ Listagem de modelos concluída com sucesso");

		return NextResponse.json({
			success: true,
			models: categorizedModels,
			allModels: [...modelsList.data],
		});
	} catch (error) {
		console.error("Error fetching models:", error);
		return NextResponse.json({ error: "Falha ao obter modelos disponíveis", success: false }, { status: 500 });
	}
}

// Cache simples para resolver qualquer "*-latest" → ID mais novo (TTL 10 min)
const CACHE_TTL_MS = 10 * 60 * 1000;
async function getLatest(base: string): Promise<string> {
	try {
		const now = Date.now();
		global.modelIdCache ||= {};
		const cached = global.modelIdCache[base];
		if (cached && now - cached.ts < CACHE_TTL_MS) {
			console.log(
				`💾 Cache hit para ${base}: ${cached.id} (válido por mais ${Math.round((CACHE_TTL_MS - (now - cached.ts)) / 1000)}s)`,
			);
			return cached.id;
		} else if (cached) {
			console.log(
				`⏰ Cache expirado para ${base}: ${cached.id} (expirou há ${Math.round((now - cached.ts - CACHE_TTL_MS) / 1000)}s)`,
			);
		}

		console.log(`🔍 Buscando modelo mais recente para ${base}...`);
		const list = await openai.models.list();
		const candidates = list.data.filter((m) => m.id === base || m.id.startsWith(`${base}-`));
		console.log(`📋 Candidatos encontrados para ${base}: ${candidates.length}`);
		candidates.forEach((c) => console.log(`  - ${c.id}`));

		if (candidates.length === 0) {
			console.log(`⚠️ Nenhum candidato encontrado para ${base}, usando base como fallback`);
			global.modelIdCache[base] = { id: base, ts: now };
			return base;
		}

		const withDate = candidates.map((m) => {
			const d = m.id.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "0000-00-00";
			return { id: m.id, date: d };
		});
		withDate.sort((a, b) => b.date.localeCompare(a.date));
		const resolved = withDate[0].id;

		console.log(`✅ Modelo mais recente para ${base}: ${resolved} (de ${candidates.length} candidatos)`);
		global.modelIdCache[base] = { id: resolved, ts: now };
		return resolved;
	} catch (error) {
		console.error(`❌ Erro ao buscar modelo mais recente para ${base}:`, error);
		return base;
	}
}

// Função para testar se uma URL de imagem é acessível
async function testImageUrl(url: string): Promise<boolean> {
	try {
		const response = await fetch(url, {
			method: "HEAD",
		});

		if (!response.ok) {
			console.error(`❌ URL não acessível: ${url} (status: ${response.status})`);
			return false;
		}

		const contentType = response.headers.get("content-type");
		if (!contentType || !contentType.startsWith("image/")) {
			console.error(`❌ URL não é uma imagem: ${url} (content-type: ${contentType})`);
			return false;
		}

		console.log(`✅ URL de imagem acessível: ${url} (${contentType})`);
		return true;
	} catch (error) {
		console.error(`❌ Erro ao testar URL: ${url}`, error);
		return false;
	}
}

// Função para processar requisições para a API do OpenAI, agora usando exclusivamente Responses API
async function handleOpenAIRequest(
	messages: Message[],
	model: string,
	sessionId?: string,
	fileIds: string[] = [],
	previousResponseId?: string,
	webSearchActive = false,
	captainPlayground: boolean = false,
) {
	try {
		// 🔧 CARREGAR CONFIGURAÇÕES DO ASSISTENTE QUANDO CAPTAIN PLAYGROUND É TRUE
		let assistantConfig: any = null;
		if (captainPlayground) {
			try {
				// Extrair ID do assistente das mensagens de sistema
				const systemMessage = messages.find((m) => m.role === "system");
				if (systemMessage && typeof systemMessage.content === "string") {
					const assistantIdMatch = systemMessage.content.match(/assistente\s+([a-zA-Z0-9]+)/);
					if (assistantIdMatch) {
						const assistantId = assistantIdMatch[1];
						console.log(`🔍 Captain Playground detectado, carregando configurações do assistente: ${assistantId}`);

						// Carregar configurações do assistente do banco de dados
						const session = await auth();
						if (session?.user?.id) {
							const assistant = await getPrismaInstance().aiAssistant.findFirst({
								where: {
									id: assistantId,
									userId: session.user.id,
									isActive: true,
								},
								select: {
									id: true,
									model: true,
									instructions: true,
									reasoningEffort: true,
									verbosity: true,
									temperature: true,
									topP: true,
									tempSchema: true,
									tempCopy: true,
									warmupDeadlineMs: true,
									hardDeadlineMs: true,
									softDeadlineMs: true,
									shortTitleLLM: true,
									toolChoice: true,
									embedipreview: true,
								},
							});

							if (assistant) {
								assistantConfig = assistant;
								console.log(`✅ Configurações do assistente carregadas:`, {
									model: assistant.model,
									reasoningEffort: assistant.reasoningEffort,
									verbosity: assistant.verbosity,
									temperature: assistant.temperature,
									tempSchema: assistant.tempSchema,
									tempCopy: assistant.tempCopy,
								});

								// Usar o modelo do assistente se disponível
								if (assistant.model && assistant.model !== model) {
									console.log(`🔄 Usando modelo do assistente: ${assistant.model} (ao invés de ${model})`);
									model = assistant.model;
								}
							} else {
								console.log(`⚠️ Assistente ${assistantId} não encontrado ou não pertence ao usuário`);
							}
						} else {
							console.log(`⚠️ Usuário não autenticado para carregar configurações do assistente`);
						}
					} else {
						console.log(`⚠️ ID do assistente não encontrado nas mensagens de sistema`);
					}
				}
			} catch (error) {
				console.error(`❌ Erro ao carregar configurações do assistente:`, error);
			}
		}

		// Verificar se é um modelo Claude (não deveria chegar aqui, mas por segurança)
		if (model.includes("claude")) {
			throw new Error("Modelo Claude não pode ser processado pelo handler OpenAI");
		}

		// Preparar o modelo correto para a API da OpenAI
		let openaiModel = model;

		// Transformar os nomes amigáveis em identificadores corretos da API
		// GPT-4.1 Series
		if (model === "gpt-4.1") openaiModel = "gpt-4.1-2025-04-14";
		if (model === "gpt-4.1-latest") openaiModel = "gpt-4.1-2025-04-14";
		if (model === "gpt-4.1-mini-latest") openaiModel = "gpt-4.1-mini-2025-04-14";
		if (model === "gpt-4.1-nano-latest") openaiModel = "gpt-4.1-nano-2025-04-14";
		// Para suporte a nomes sem o sufixo -latest
		if (model === "gpt-4.1 Nano") openaiModel = "gpt-4.1-nano-2025-04-14";
		if (model === "GPT-4.1 Nano") openaiModel = "gpt-4.1-nano-2025-04-14";
		if (model === "gpt-4.5-preview-latest") openaiModel = "gpt-4.5-preview-2025-02-27";

		// GPT-4o Series
		if (model === "gpt-4o") openaiModel = "gpt-4o-2024-05-13";
		if (model === "gpt-4o-mini") openaiModel = "gpt-4o-mini-2024-07-18";
		if (model === "gpt-4o-mini-latest") openaiModel = "gpt-4o-mini-2024-07-18";
		if (model === "chatgpt-4o-latest") openaiModel = "chatgpt-4o-latest"; // Manter para mapeamento posterior
		if (model === "gpt-4o-latest") openaiModel = "gpt-4o-latest"; // Manter para mapeamento posterior
		if (model === "gpt-4o-audio-preview") openaiModel = "gpt-4o-2024-05-13"; // Usar o GPT-4o mais recente com suporte a áudio
		if (model === "gpt-4o-2024-11-20") openaiModel = "gpt-4o-2024-11-20"; // Usar GPT-4o mais recente
		if (model === "ChatGPT 4o") openaiModel = "gpt-4o-2024-08-06"; // Interface mostra este nome
		if (model === "gpt-4o-audio-preview-latest") openaiModel = "gpt-4o-audio-preview-2024-12-17";
		if (model === "gpt-4o-realtime-preview-latest") openaiModel = "gpt-4o-realtime-preview-2024-12-17";
		if (model === "gpt-4o-mini-audio-preview-latest") openaiModel = "gpt-4o-mini-audio-preview-2024-12-17";
		if (model === "gpt-4o-mini-realtime-preview-latest") openaiModel = "gpt-4o-mini-realtime-preview-2024-12-17";
		if (model === "gpt-4o-search-preview-latest") openaiModel = "gpt-4o-search-preview-2025-03-11";
		if (model === "gpt-4o-mini-search-preview-latest") openaiModel = "gpt-4o-mini-search-preview-2025-03-11";

		// GPT-5 Series (aliases e latest)
		if (model === "gpt-5-latest" || model === "GPT-5-latest") openaiModel = await getLatest("gpt-5");
		if (model === "gpt-5" || model === "GPT-5") openaiModel = "gpt-5";

		// Mapeamento especial para o4-mini-high (usa o4-mini com reasoning effort high)
		let reasoningEffort: string | undefined;
		if (model === "o4-mini-high") {
			openaiModel = "o4-mini";
			reasoningEffort = "high";
			console.log(`🧠 Mapeando ${model} para ${openaiModel} com reasoning effort: ${reasoningEffort}`);
		}

		// Mapeamento direto para O series usando fetch e busca ativa para garantir sempre usar a versão com data
		// Extrair tipo base do modelo (o1, o1-mini, o4-mini, etc.)
		const isOModel = openaiModel.match(/^(o\d+)(-[a-z]+)?$/);
		if (isOModel) {
			try {
				const baseModel = openaiModel.includes("-") ? openaiModel : `${openaiModel}`; // Se já tem sufixo como -mini, usar como está

				// Tentar buscar a lista de modelos disponíveis diretamente
				const response = await fetch("https://api.openai.com/v1/models", {
					headers: {
						Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
					},
				});

				if (response.ok) {
					const data = await response.json();
					// Filtrar modelos que correspondem ao tipo base (o1, o1-mini, etc.)
					const matchingModels = data.data.filter((m: any) => m.id === baseModel || m.id.startsWith(`${baseModel}-`));

					if (matchingModels.length > 0) {
						// Extrair data (YYYY-MM-DD) dos modelos
						const modelsWithDates = matchingModels.map((m: any) => {
							const dateMatch = m.id.match(/(\d{4}-\d{2}-\d{2})/);
							return {
								id: m.id,
								date: dateMatch ? dateMatch[1] : null,
							};
						});

						// Filtrar apenas modelos com data
						const datedModels = modelsWithDates.filter((m: any) => m.date !== null);

						if (datedModels.length > 0) {
							// Ordenar por data (mais recente primeiro)
							datedModels.sort((a: any, b: any) => b.date.localeCompare(a.date));

							// Usar o modelo mais recente
							openaiModel = datedModels[0].id;
							console.log(`Modelo selecionado para ${baseModel}: ${openaiModel} (mais recente)`);
						} else {
							// Nenhum modelo com data encontrado, usar o modelo base
							console.log(`Nenhum modelo com data encontrado para ${baseModel}, usando modelo base`);
						}
					} else {
						console.log(`Nenhum modelo encontrado para ${baseModel}`);
					}
				}
			} catch (error) {
				console.error(`Erro ao buscar modelo dinâmico para ${openaiModel}:`, error);
				// Em caso de erro, continuar usando o modelo original
			}
		}

		// Usar mapeamento de fallback do cache global se o fetch direto falhar
		if (openaiModel === model) {
			// Fallback para versões em cache global
			if ((model === "o1" || model === "o1-latest") && global.latestOSeriesModels?.["o1"]) {
				openaiModel = global.latestOSeriesModels["o1"];
			} else if ((model === "o1-mini" || model === "o1-mini-latest") && global.latestOSeriesModels?.["o1-mini"]) {
				openaiModel = global.latestOSeriesModels["o1-mini"];
			} else if ((model === "o1-pro" || model === "o1-pro-latest") && global.latestOSeriesModels?.["o1-pro"]) {
				openaiModel = global.latestOSeriesModels["o1-pro"];
			} else if (
				(model === "o1-preview" || model === "o1-preview-latest") &&
				global.latestOSeriesModels?.["o1-preview"]
			) {
				openaiModel = global.latestOSeriesModels["o1-preview"];
			} else if (
				(model === "o4-mini" || model === "o4-mini-latest" || model === "o4-mini-high") &&
				global.latestOSeriesModels?.["o4-mini"]
			) {
				openaiModel = global.latestOSeriesModels["o4-mini"];
			}
		}

		// Genérico: qualquer "*-latest" cai na resolução dinâmica
		if (/-latest$/.test(model) && !openaiModel.includes("-")) {
			const base = model.replace(/-latest$/, "");
			openaiModel = await getLatest(base);
		}

		// Aliases para garantir compatibilidade com diferentes nomes de exibição
		if (model.startsWith("GPT-")) openaiModel = model.replace("GPT-", "gpt-");
		if (model === "ChatGPT 4o") openaiModel = "gpt-4o-2024-11-20";
		if (model === "ChatGPT-4o") openaiModel = "gpt-4o-2024-11-20";
		if (model === "ChatGPT 4") openaiModel = "gpt-4o-2024-11-20";
		if (model === "GPT 4o") openaiModel = "gpt-4o-2024-11-20";
		if (model === "GPT 4") openaiModel = "gpt-4o-2024-11-20";
		if (model === "GPT-4o") openaiModel = "gpt-4o-2024-11-20";

		// Verificar se o modelo suporta geração de imagem
		// Lista específica de modelos que suportam a ferramenta image_generation na Responses API
		const imageCompatibleModels = [
			"gpt-5", // ✅ compatível com image_generation
			"gpt-4o-2024-11-20",
			"gpt-4o",
			"gpt-4o-2024-05-13",
			"gpt-4o-2024-08-06",
			"gpt-4.1",
			"gpt-4.1-2025-04-14",
			"gpt-4.1-mini",
			"gpt-4.1-mini-2025-04-14",
			"gpt-4.1-nano",
			"gpt-4.1-nano-2025-04-14",
			"o3-mini",
			"o3",
		];

		// Mapear modelos "latest" para versões específicas compatíveis com Responses API
		let modelForImageGeneration = openaiModel;
		if (model.includes("latest") || model.includes("chatgpt-4o")) {
			// Mapear modelos latest para versões compatíveis com imagem
			if (model.includes("4o") || model.includes("chatgpt-4o")) {
				modelForImageGeneration = "gpt-4o-2024-11-20"; // Versão estável com suporte a imagem
				console.log(`🔄 Mapeando ${openaiModel} para ${modelForImageGeneration} para suporte a geração de imagem`);
			} else if (model.includes("4.1-mini")) {
				modelForImageGeneration = "gpt-4.1-mini-2025-04-14";
				console.log(`🔄 Mapeando ${openaiModel} para ${modelForImageGeneration} para suporte a geração de imagem`);
			} else if (model.includes("4.1-nano")) {
				modelForImageGeneration = "gpt-4.1-nano-2025-04-14";
				console.log(`🔄 Mapeando ${openaiModel} para ${modelForImageGeneration} para suporte a geração de imagem`);
			} else if (model.includes("4.1")) {
				modelForImageGeneration = "gpt-4.1-2025-04-14";
				console.log(`🔄 Mapeando ${openaiModel} para ${modelForImageGeneration} para suporte a geração de imagem`);
			}
		}

		const supportsImageGeneration = imageCompatibleModels.some(
			(compatibleModel) =>
				openaiModel === compatibleModel ||
				openaiModel.startsWith(compatibleModel + "-") ||
				modelForImageGeneration === compatibleModel ||
				modelForImageGeneration.startsWith(compatibleModel + "-"),
		);

		console.log(`Modelo ${openaiModel} suporta geração de imagem: ${supportsImageGeneration}`);

		if (modelForImageGeneration !== openaiModel) {
			console.log(`✅ Modelo mapeado com sucesso: ${openaiModel} → ${modelForImageGeneration}`);
		}

		// Verificar se o modelo é da família O (reasoning models)
		const isOSeriesModel = openaiModel.startsWith("o") || model.startsWith("o"); // gpt-5 não é 'o-series'; reasoning padrão via Responses

		// 🔍 Verificar compatibilidade entre modelo atual e previous_response_id
		// Se temos um previous_response_id, verificar se há incompatibilidade entre reasoning/non-reasoning models
		// Usar o previousResponseId diretamente (modelos antigos não possuem mais relacionamentos)
		let compatiblePreviousResponseId = previousResponseId;

		console.log(
			`🚀 Usando Responses API exclusivamente para modelo original: ${model}, modelo mapeado: ${openaiModel}`,
		);
		console.log(`📊 É modelo da série O (reasoning): ${isOSeriesModel}`);

		// Por padrão, usamos o modelo mapeado de chat (sem supor tools).
		let apiModel = openaiModel;
		console.log(`Modelo para API (pré-intenção): ${apiModel} (original: ${openaiModel})`);

		// Extrair a última mensagem do usuário para usar como prompt
		const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
		let userContent = "";
		let imageUrls: string[] = [];
		let extractedFileIds: string[] = [];
		let hasDirectImageUrls = false; // Flag para URLs diretas (que removem image_generation)

		if (lastUserMessage) {
			if (typeof lastUserMessage.content === "string") {
				console.log("📝 Conteúdo da mensagem recebida:", lastUserMessage.content);
				userContent = lastUserMessage.content.trim();

				// 🖼️ CORREÇÃO: Separar claramente URLs de imagem de file IDs
				// 🔧 NOVA LÓGICA: Sempre extrair URLs diretas, independente de previous_response_id

				// Extrair URLs de imagem do markdown (tipo "Imagem para análise")
				const imageMarkdownRegex = /!\[.*?\]\((https?:\/\/[^\)]+)\)/g;
				const imageMatches = [...userContent.matchAll(imageMarkdownRegex)];

				if (imageMatches.length > 0) {
					imageUrls = imageMatches.map((match) => match[1]);
					hasDirectImageUrls = true; // URLs diretas removem image_generation tool
					// Remover as referências de imagem do texto
					userContent = userContent.replace(imageMarkdownRegex, "").trim();
					console.log(
						`🖼️ Extraídas ${imageUrls.length} URLs de imagem diretas (remove image_generation):`,
						imageUrls.map((url) => url.substring(0, 50) + "..."),
					);

					// 🚨 CORREÇÃO CRÍTICA: Limpar previous_response_id quando há URLs diretas
					if (compatiblePreviousResponseId) {
						console.log(
							`🔧 LIMPANDO previous_response_id (${compatiblePreviousResponseId}) - usando URL direta ao invés de contexto`,
						);
						compatiblePreviousResponseId = undefined;
					}
				}

				// Extrair file IDs válidos (que começam com 'file-') - tipo "Imagens" via Files API
				const fileIdRegex = /\[.*?\]\(file_id:(file-[^)]+)\)/g;
				const fileIdMatches = [...userContent.matchAll(fileIdRegex)];

				if (fileIdMatches.length > 0) {
					extractedFileIds = fileIdMatches.map((match) => match[1]);
					// Remover as referências de arquivo do texto
					userContent = userContent.replace(fileIdRegex, "").trim();
					console.log(
						`📁 Extraídos ${extractedFileIds.length} file IDs válidos (mantém image_generation):`,
						extractedFileIds,
					);
				}

				// 🚨 CORREÇÃO: Detectar file_id com URL (erro comum) e converter para image_url
				const invalidFileIdRegex = /\[.*?\]\(file_id:(https?:\/\/[^)]+)\)/g;
				const invalidFileIdMatches = [...userContent.matchAll(invalidFileIdRegex)];

				if (invalidFileIdMatches.length > 0) {
					console.log(
						`⚠️ Detectados ${invalidFileIdMatches.length} file_id inválidos com URLs - convertendo para image_url`,
					);
					invalidFileIdMatches.forEach((match) => {
						const invalidUrl = match[1];
						imageUrls.push(invalidUrl);
						hasDirectImageUrls = true; // URLs diretas removem image_generation tool
						console.log(`🔄 Convertendo file_id inválido para image_url: ${invalidUrl.substring(0, 50)}...`);
					});
					// Remover as referências inválidas do texto
					userContent = userContent.replace(invalidFileIdRegex, "").trim();

					// 🚨 CORREÇÃO CRÍTICA: Limpar previous_response_id quando há URLs inválidas convertidas
					if (compatiblePreviousResponseId) {
						console.log(
							`🔧 LIMPANDO previous_response_id (${compatiblePreviousResponseId}) - usando URLs convertidas ao invés de contexto`,
						);
						compatiblePreviousResponseId = undefined;
					}
				}

				console.log(`📝 Texto limpo final: "${userContent}"`);
			} else if (Array.isArray(lastUserMessage.content)) {
				// Handle array content
				for (const contentItem of lastUserMessage.content) {
					if (contentItem.type === "text" && contentItem.text) {
						userContent += contentItem.text + " ";
					} else if (contentItem.type === "image" && contentItem.image_url) {
						// Só adicionar como image_url se não há referência específica
						if (!compatiblePreviousResponseId) {
							// Garantir que o formato esteja correto para Responses API
							let imageUrl: string;
							if (typeof contentItem.image_url === "string") {
								imageUrl = contentItem.image_url;
							} else if (
								typeof contentItem.image_url === "object" &&
								contentItem.image_url &&
								"url" in contentItem.image_url
							) {
								imageUrl = (contentItem.image_url as any).url;
							} else {
								console.warn("⚠️ Formato de image_url não reconhecido:", contentItem.image_url);
								continue;
							}

							imageUrls.push(imageUrl);
						}
					}
				}
				userContent = userContent.trim();
			}
		}

		// Extrair mensagem de sistema (instruções) - SEMPRE, não só no captainPlayground
		const firstSystem = messages.find((m: any) => m.role === "system");
		const systemText = (() => {
			if (!firstSystem) return "";
			if (typeof firstSystem.content === "string") return firstSystem.content.trim();
			if (Array.isArray(firstSystem.content)) {
				const txt = firstSystem.content.find((it: any) => it?.type === "text" && typeof it?.text === "string");
				return txt?.text?.trim() || "";
			}
			return "";
		})();

		// Preparar conteúdo de entrada para a Responses API (apenas conteúdo do usuário)
		const inputContent: any[] = [];
		inputContent.push({ type: "input_text", text: userContent || "Analise o conteúdo fornecido." });

		// Adicionar imagens extraídas como image_url APENAS se não há referência específica
		if (imageUrls.length > 0) {
			imageUrls.forEach((imageUrl, index) => {
				inputContent.push({
					type: "input_image",
					image_url: { url: imageUrl }, // 🔧 CORREÇÃO: Responses API usa objeto com url
				});
				console.log(`🖼️ Adicionada imagem ${index + 1} como image_url: ${imageUrl.substring(0, 50)}...`);
			});
		}

		// Adicionar cada arquivo como file (para PDFs) ou image_url (para imagens)
		for (const fileId of extractedFileIds) {
			// 🔧 NOVA LÓGICA: Determinar tipo do arquivo baseado no banco de dados
			try {
				let fileType = "image"; // default para imagem
				let fileName = `file-${fileId}`;

				// Buscar informações do arquivo no banco de dados
				const chatFile = await getPrismaInstance().chatFile.findFirst({
					where: { openaiFileId: fileId },
				});

				if (chatFile) {
					fileType = chatFile.fileType || "application/octet-stream";
					fileName = chatFile.filename;
					console.log(`📁 Arquivo encontrado no ChatFile: ${fileName}, tipo: ${fileType}`);
				} else {
					// Se não encontrar no ChatFile, buscar no GeneratedImage
					const generatedImage = await getPrismaInstance().generatedImage.findFirst({
						where: { openaiFileId: fileId },
					});

					if (generatedImage) {
						fileType = generatedImage.mimeType || "image/png";
						fileName = `image-${generatedImage.id}.${generatedImage.mimeType?.split("/")[1] || "png"}`;
						console.log(`🖼️ Arquivo encontrado no GeneratedImage: ${fileName}, tipo: ${fileType}`);
					} else {
						console.warn(`⚠️ Arquivo ${fileId} não encontrado no banco, assumindo imagem`);
					}
				}

				// Determinar se é PDF ou imagem
				const isPdf = fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
				const isImage =
					fileType.startsWith("image/") ||
					[".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"].some((ext) => fileName.toLowerCase().includes(ext));

				if (isPdf) {
					inputContent.push({ type: "input_file", file_id: fileId });
					console.log(`📄 Adicionado PDF como file (file_id): ${fileId} - ${fileName}`);
				} else if (isImage) {
					inputContent.push({ type: "input_image", file_id: fileId });
					console.log(`🖼️ Adicionado imagem como image_url (file_id): ${fileId} - ${fileName}`);
				} else {
					// Para outros tipos, usar file como fallback
					inputContent.push({ type: "input_file", file_id: fileId });
					console.log(
						`📁 Adicionado arquivo genérico como file (file_id): ${fileId} - ${fileName} (tipo: ${fileType})`,
					);
				}
			} catch (error) {
				console.error(`❌ Erro ao determinar tipo do arquivo ${fileId}:`, error);
				// Em caso de erro, usar image_url como fallback (comportamento anterior)
				inputContent.push({ type: "input_image", file_id: fileId });
				console.log(`🔄 Fallback: Adicionado como image_url (file_id): ${fileId}`);
			}
		}

		// Adicionar file IDs de parâmetro - determinar se é imagem ou PDF baseado no contexto
		if (fileIds && fileIds.length > 0) {
			for (const fileId of fileIds) {
				// 🔧 NOVA LÓGICA: Determinar tipo do arquivo baseado no banco de dados
				try {
					let fileType = "image"; // default para imagem
					let fileName = `file-${fileId}`;

					// Buscar informações do arquivo no banco de dados
					const chatFile = await getPrismaInstance().chatFile.findFirst({
						where: { openaiFileId: fileId },
					});

					if (chatFile) {
						fileType = chatFile.fileType || "application/octet-stream";
						fileName = chatFile.filename;
						console.log(`📁 Arquivo (parâmetro) encontrado no ChatFile: ${fileName}, tipo: ${fileType}`);
					} else {
						// Se não encontrar no ChatFile, buscar no GeneratedImage
						const generatedImage = await getPrismaInstance().generatedImage.findFirst({
							where: { openaiFileId: fileId },
						});

						if (generatedImage) {
							fileType = generatedImage.mimeType || "image/png";
							fileName = `image-${generatedImage.id}.${generatedImage.mimeType?.split("/")[1] || "png"}`;
							console.log(`🖼️ Arquivo (parâmetro) encontrado no GeneratedImage: ${fileName}, tipo: ${fileType}`);
						} else {
							console.warn(`⚠️ Arquivo (parâmetro) ${fileId} não encontrado no banco, assumindo imagem`);
						}
					}

					// Determinar se é PDF ou imagem
					const isPdf = fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
					const isImage =
						fileType.startsWith("image/") ||
						[".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"].some((ext) => fileName.toLowerCase().includes(ext));

					if (isPdf) {
						inputContent.push({ type: "input_file", file_id: fileId });
						console.log(`📄 Adicionado PDF (parâmetro) como file (file_id): ${fileId} - ${fileName}`);
					} else if (isImage) {
						inputContent.push({ type: "input_image", file_id: fileId });
						console.log(`🖼️ Adicionado imagem (parâmetro) como image_url (file_id): ${fileId} - ${fileName}`);
					} else {
						// Para outros tipos, usar file como fallback
						inputContent.push({ type: "input_file", file_id: fileId });
						console.log(
							`📁 Adicionado arquivo genérico (parâmetro) como file (file_id): ${fileId} - ${fileName} (tipo: ${fileType})`,
						);
					}
				} catch (error) {
					console.error(`❌ Erro ao determinar tipo do arquivo (parâmetro) ${fileId}:`, error);
					// Em caso de erro, usar image_url como fallback (comportamento anterior)
					inputContent.push({ type: "input_image", file_id: fileId });
					console.log(`🔄 Fallback: Adicionado (parâmetro) como image_url (file_id): ${fileId}`);
				}
			}
		}

		// 🔧 CORREÇÃO IMPORTANTE: Se há file_ids sendo fornecidos como image_url,
		// isso significa que o usuário está fornecendo uma nova imagem de referência explícita.
		// Nesse caso, limpar o previous_response_id para evitar conflito entre a imagem
		// de referência e o contexto da conversa anterior
		const hasExplicitImageReference = extractedFileIds.length > 0 || (fileIds && fileIds.length > 0);
		if (hasExplicitImageReference && compatiblePreviousResponseId) {
			console.log(
				`🚨 CONFLITO DETECTADO: File IDs fornecidos como image_url (${[...extractedFileIds, ...(fileIds || [])].join(", ")}) + previous_response_id (${compatiblePreviousResponseId})`,
			);
			console.log(`🔧 Limpando previous_response_id para usar apenas a imagem de referência explícita`);
			compatiblePreviousResponseId = undefined;
		}

		// Preparar ferramentas para Responses API
		const tools: any[] = [];

		// 🔎 Classifica a intenção do turno com gpt-5-nano
		const { intent } = await classifyTurn(messages);
		console.log(`🧭 Intenção classificada: ${intent}`);

		// 🔧 Não adicionar image_generation quando há URLs diretas ou image_url
		const hasInputImages = imageUrls.length > 0 || hasDirectImageUrls;

		// 1) WEB SEARCH: só adicionar se usuário ativou E modelo suporta
		if (webSearchActive) {
			if (hasToolSupport(apiModel, "web_search_preview")) {
				tools.push({
					type: "web_search_preview",
					search_context_size: "medium",
					user_location: { type: "approximate", country: "BR", timezone: "America/Sao_Paulo" },
				});
				console.log("🔍 web_search_preview adicionado");
			} else {
				console.log(`ℹ️ ${apiModel} não suporta web_search_preview — não anexando tool`);
			}
		}

		// 2) IMAGE GENERATION: rotear por turno quando intenção for gerar imagem
		if (intent === "image_generate" && !hasInputImages) {
			if (!hasToolSupport(apiModel, "image_generation")) {
				const routed = pickImageCapableFallback(apiModel);
				if (routed !== apiModel) {
					console.log(`↪️ Roteando ${apiModel} → ${routed} para image_generation`);
					apiModel = routed;
					// evitar conflitos de multi-turn cross-model
					if (compatiblePreviousResponseId) {
						console.log("🔧 Limpando previous_response_id por troca de modelo (image_generation)");
						compatiblePreviousResponseId = undefined;
					}
				}
			}
			if (hasToolSupport(apiModel, "image_generation")) {
				tools.push({
					type: "image_generation",
					quality: "auto",
					size: "auto",
					background: "auto",
					partial_images: 2,
				});
				console.log("🎨 image_generation anexado");
			} else {
				console.log("🚫 Nenhum modelo compatível com image_generation encontrado — seguirá sem imagem");
			}
		} else if (intent === "image_edit" || intent === "image_analyze") {
			// edição/análise usam apenas image_url/file — nada de hosted tool
			console.log(`🖼️ Intenção ${intent}: sem image_generation (apenas image_url/file)`);
		} else {
			// chat / other → sem image_generation
			console.log("💬 Intenção de chat/other: sem image_generation");
		}

		// Log final do modelo escolhido
		console.log(`🧩 Modelo final para API: ${apiModel}`);

		// Configurar opções para a requisição da Responses API
		const requestOptions: any = {
			model: apiModel,
			input: [
				{
					role: "user",
					content: inputContent,
				},
			],
			...(systemText ? { instructions: systemText } : {}), // ✅ System prompt vai no campo correto
			stream: true,
			store: true,
			parallel_tool_calls: true,
			truncation: "disabled",
		};

		// Usar previous_response_id se disponível (para multi-turn conversations)
		if (compatiblePreviousResponseId) {
			console.log(`🔗 Usando previous_response_id: ${compatiblePreviousResponseId} para multi-turn conversation`);
			requestOptions.previous_response_id = compatiblePreviousResponseId;
		}

		// Adicionar ferramentas se disponíveis
		if (tools.length > 0) {
			requestOptions.tools = tools;
		}

		// Adicionar parâmetro reasoning para modelos da série O e GPT-5
		const isReasoningModel = isOSeriesModel || openaiModel.includes("gpt-5");
		if (isReasoningModel) {
			// 🔧 USAR CONFIGURAÇÕES DO ASSISTENTE SE DISPONÍVEIS
			let effort = "medium"; // Default
			if (assistantConfig?.reasoningEffort) {
				effort = assistantConfig.reasoningEffort;
				console.log(`🧠 Usando reasoning effort do assistente: ${effort}`);
			} else if (reasoningEffort) {
				effort = reasoningEffort;
				console.log(`🧠 Usando reasoning effort do mapeamento: ${effort}`);
			}
			requestOptions.reasoning = { effort };
			console.log(`🧠 Adicionando reasoning effort: ${effort} para modelo ${isOSeriesModel ? "O-series" : "GPT-5"}`);
		}

		// Adicionar temperatura baseada no tipo de modelo
		// GPT-5 não suporta temperature, então só adicionar para outros modelos
		const isGpt5 = openaiModel.includes("gpt-5");
		if (!isGpt5) {
			// 🔧 USAR CONFIGURAÇÕES DO ASSISTENTE SE DISPONÍVEIS
			if (assistantConfig?.temperature !== null && assistantConfig?.temperature !== undefined) {
				requestOptions.temperature = assistantConfig.temperature;
				console.log(`🌡️ Usando temperature do assistente: ${assistantConfig.temperature}`);
			} else if (isOSeriesModel) {
				requestOptions.temperature = 1;
				console.log(`🌡️ Usando temperature padrão para O-series: 1`);
			} else {
				requestOptions.temperature = 0.7;
				console.log(`🌡️ Usando temperature padrão: 0.7`);
			}
		} else {
			console.log(`🔧 Modelo GPT-5 detectado (${openaiModel}), removendo parâmetro temperature`);
		}

		// Adicionar top_p (GPT-5 não suporta, então só adicionar para outros modelos)
		if (!isGpt5) {
			// 🔧 USAR CONFIGURAÇÕES DO ASSISTENTE SE DISPONÍVEIS
			if (assistantConfig?.topP !== null && assistantConfig?.topP !== undefined) {
				requestOptions.top_p = assistantConfig.topP;
				console.log(`📊 Usando top_p do assistente: ${assistantConfig.topP}`);
			} else {
				requestOptions.top_p = 1.0;
				console.log(`📊 Usando top_p padrão: 1.0`);
			}
		} else {
			console.log(`🔧 Modelo GPT-5 detectado (${openaiModel}), removendo parâmetro top_p`);
		}

		// Adicionar max_output_tokens (ajustar para GPT-5 se necessário)
		if (isGpt5) {
			requestOptions.max_output_tokens = 409600; // limite infinito pra testes
			console.log(`🔧 Modelo GPT-5 detectado (${openaiModel}), usando max_output_tokens: 409600`);

			// 🔧 ADICIONAR VERBOSITY PARA MODELOS GPT-5 (estrutura correta: text.verbosity)
			if (assistantConfig?.verbosity) {
				requestOptions.text = {
					verbosity: assistantConfig.verbosity,
				};
				console.log(`🗣️ Usando verbosity do assistente: ${assistantConfig.verbosity}`);
			} else {
				requestOptions.text = {
					verbosity: "low", // Default para GPT-5
				};
				console.log(`🗣️ Usando verbosity padrão para GPT-5: low`);
			}
		} else {
			requestOptions.max_output_tokens = 4096000;
		}

		// Usar a Responses API exclusivamente
		const API_URL = "https://api.openai.com/v1/responses";

		// Store the sessionId for database operations
		console.log("Using session ID for database:", sessionId);

		// Log do payload para debug
		console.log("📤 Payload sendo enviado para OpenAI Responses API:");
		console.log("🔧 Model:", apiModel);
		console.log("📝 Input content items:", inputContent.length);
		console.log("🛠️ Tools:", tools.length > 0 ? tools.map((t) => t.type) : "none");

		// Log detalhado de cada item do inputContent
		inputContent.forEach((item, index) => {
			console.log(`📋 Input item ${index}:`, {
				type: item.type,
				hasText: item.text ? `yes (${item.text.length} chars)` : "no",
				hasFileId: item.file_id ? `yes (${item.file_id})` : "no",
				hasImageUrl: item.image_url ? "yes" : "no",
				imageUrl: item.image_url?.url ? `${item.image_url.url.substring(0, 100)}...` : "none",
				detail: item.image_url?.detail || "none",
			});
		});

		console.log("📊 Request options:", JSON.stringify(requestOptions, null, 2));

		// Validação final do payload
		if (!requestOptions.model) {
			throw new Error("Modelo não especificado no payload");
		}

		if (!requestOptions.input || !Array.isArray(requestOptions.input)) {
			throw new Error("Input inválido no payload");
		}

		if (requestOptions.input.length === 0) {
			throw new Error("Input vazio no payload");
		}

		// Verificar se há pelo menos um item de texto no input
		const hasTextInput = inputContent.some((item) => item.type === "input_text" && item.text);
		if (!hasTextInput) {
			console.warn("⚠️ Nenhum input de texto encontrado, adicionando texto padrão");
			inputContent.unshift({ type: "input_text", text: "Analise o conteúdo fornecido." });
		}

		// Validações específicas para Responses API
		if (requestOptions.tools && requestOptions.tools.length > 0) {
			console.log("🔧 Validando ferramentas...");
			requestOptions.tools.forEach((tool: any, index: number) => {
				if (!tool.type) {
					throw new Error(`Tool ${index} não tem tipo especificado`);
				}
				console.log(`✅ Tool ${index}: ${tool.type} validada`);
			});
		}

		// Verificar compatibilidade de tools com previous_response_id
		if (requestOptions.previous_response_id && requestOptions.tools) {
			console.log("🔧 Verificando compatibilidade de tools com previous_response_id...");
			const imageGenTool = requestOptions.tools.find((t: any) => t.type === "image_generation");
			if (imageGenTool) {
				console.log("✅ image_generation tool compatível com multi-turn");
			}
		}

		// Verificar se o modelo suporta as ferramentas especificadas
		if (requestOptions.tools) {
			const unsupportedForModel: string[] = [];
			requestOptions.tools.forEach((tool: any) => {
				if (tool.type === "image_generation" && !supportsImageGeneration) {
					unsupportedForModel.push(tool.type);
				}
			});

			if (unsupportedForModel.length > 0) {
				console.warn(`⚠️ Ferramentas não suportadas pelo modelo ${apiModel}:`, unsupportedForModel);
				// Remover ferramentas não suportadas
				requestOptions.tools = requestOptions.tools.filter((tool: any) => !unsupportedForModel.includes(tool.type));
				console.log("🔧 Ferramentas não suportadas removidas");
			}
		}

		console.log("✅ Payload validado com sucesso");

		// Usar o wrapper responsesCall para tratamento adequado de custo e stream
		let openaiResponse: any;
		const finalPreviousResponseId = compatiblePreviousResponseId;

		try {
			openaiResponse = await responsesCall(openai, requestOptions, {
				sessionId,
				intent,
				traceId: `chatwitia-${Date.now()}`,
			});

			// Se chegou aqui, a resposta foi bem-sucedida
			// Converter para formato de Response para compatibilidade com o código existente
			const responseBody = JSON.stringify(openaiResponse);
			const response = new Response(responseBody, {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error: any) {
			// Tratamento de erro do responsesCall
			console.error("❌ Erro na chamada responsesCall:", error);

			// Se for um erro da OpenAI, extrair detalhes
			if (error.status) {
				console.error(`❌ OpenAI API Error ${error.status}:`, error.message);

				// Log específico para erro 400
				if (error.status === 400) {
					console.error("🔍 Detalhes do erro 400:");
					console.error("📋 Error type:", error.type);
					console.error("📝 Error message:", error.message);
					console.error("🎯 Error code:", error.code);

					// Log do payload que causou o erro
					console.error("📤 Payload que causou o erro:");
					console.error("🔧 Model:", apiModel);
					console.error("📝 Input content items:", inputContent.length);
					inputContent.forEach((item, index) => {
						console.error(`📋 Item ${index}:`, {
							type: item.type,
							hasText: item.text ? "yes" : "no",
							hasFileId: item.file_id ? "yes" : "no",
							hasImageUrl: item.image_url ? "yes" : "no",
							imageUrlLength: item.image_url?.url?.length || 0,
						});
					});
					console.error("🛠️ Tools:", tools.length > 0 ? tools.map((t) => t.type) : "none");
					console.error("🔗 Previous Response ID:", requestOptions.previous_response_id || "none");
				}
			}

			throw error;
		}

		// Define a custom transformer class for Responses API events
		class ChunkTransformer implements Transformer<Uint8Array, Uint8Array> {
			private buffer = "";
			private encoder = new TextEncoder();
			private decoder = new TextDecoder();
			private completeContent = "";
			private responseId = "";
			private imageResults: any[] = [];
			private fullResponseData: any = null;

			constructor(
				private sessionIdForDB?: string,
				private userPrompt?: string,
				private modelName?: string,
				private previousResponseId?: string,
			) {}

			async transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
				// Decode the received chunk
				const text = this.decoder.decode(chunk);

				try {
					// Add to buffer first before processing
					this.buffer += text;

					// Split by lines and process each SSE event
					const lines = this.buffer.split("\n");
					// Keep the last line in the buffer if it's not complete
					this.buffer = lines.pop() || "";

					const validLines = lines.filter((line) => line.trim() !== "");

					for (const line of validLines) {
						// Check if it's SSE event
						if (line.startsWith("event: ")) {
							// Skip event type lines, we'll handle them with data
							continue;
						}

						if (line.startsWith("data: ")) {
							const data = line.slice(5).trim();

							// Check if it's the [DONE] marker
							if (data === "[DONE]") {
								console.log("✅ Responses API stream complete");
								console.log(`📊 Final content length: ${this.completeContent.length}`);
								console.log(`🖼️ Images generated: ${this.imageResults.length}`);
								console.log(`🆔 Response ID: ${this.responseId}`);

								// Send final done message with response ID and full response data
								controller.enqueue(
									this.encoder.encode(
										JSON.stringify({
											type: "done",
											response: {
												role: "assistant",
												content: this.completeContent,
												images: this.imageResults,
												responseId: this.responseId,
												responsesApiResponse: this.fullResponseData,
											},
											response_id: this.responseId, // Important for multi-turn
											done: true,
										}) + "\n",
									),
								);
								continue;
							}

							try {
								// Parse the JSON event from Responses API
								const eventData = JSON.parse(data);

								// Handle different event types from Responses API
								switch (eventData.type) {
									case "response.created":
										console.log("🚀 Response started, ID:", eventData.response?.id);
										this.responseId = eventData.response?.id || "";
										this.fullResponseData = eventData.response;
										break;

									case "response.in_progress":
										console.log("⏳ Response in progress");
										// Opcional: enviar status de progresso para o cliente
										controller.enqueue(
											this.encoder.encode(
												JSON.stringify({
													type: "progress",
													message: "Processando...",
												}) + "\n",
											),
										);
										break;

									case "response.output_item.added":
										console.log("📋 Output item added, type:", eventData.item?.type);
										// Opcional: enviar status de item adicionado para o cliente
										if (eventData.item?.type === "image_generation_call") {
											controller.enqueue(
												this.encoder.encode(
													JSON.stringify({
														type: "output_item_added",
														item_type: "image_generation_call",
														message: "Preparando geração de imagem...",
													}) + "\n",
												),
											);
										}
										break;

									case "response.output_text.delta":
										// Text incremental
										const textDelta = eventData.delta || "";
										this.completeContent += textDelta;

										// Send the chunk to the client
										controller.enqueue(
											this.encoder.encode(
												JSON.stringify({
													type: "chunk",
													content: textDelta,
													done: false,
												}) + "\n",
											),
										);
										break;

									case "response.image_generation_call.started":
										console.log("🎨 Image generation started");

										// Send status to client
										controller.enqueue(
											this.encoder.encode(
												JSON.stringify({
													type: "image_generation_started",
													message: "Gerando imagem...",
												}) + "\n",
											),
										);
										break;

									case "response.image_generation_call.in_progress":
										console.log("🔄 Image generation in progress");

										// Send progress status to client
										controller.enqueue(
											this.encoder.encode(
												JSON.stringify({
													type: "image_generation_progress",
													message: "Imagem sendo gerada...",
												}) + "\n",
											),
										);
										break;

									case "response.image_generation_call.generating":
										console.log("✨ Image generation generating");

										// Send generating status to client
										controller.enqueue(
											this.encoder.encode(
												JSON.stringify({
													type: "image_generation_generating",
													message: "Processando imagem...",
												}) + "\n",
											),
										);
										break;

									case "response.image_generation_call.partial_image":
										console.log(`🖼️ Partial image received, index: ${eventData.partial_image_index}`);

										// Send partial image to client
										controller.enqueue(
											this.encoder.encode(
												JSON.stringify({
													type: "partial_image",
													image_data: eventData.partial_image_b64 || "",
													index: eventData.partial_image_index || 0,
												}) + "\n",
											),
										);
										break;

									case "response.image_generation_call.completed":
										console.log("✅ Image generation completed");
										// Image will be processed in response.completed
										break;

									case "response.web_search_call.started":
										console.log("🔍 Web search started");

										// Send status to client
										controller.enqueue(
											this.encoder.encode(
												JSON.stringify({
													type: "web_search_started",
													message: "Pesquisando na web...",
												}) + "\n",
											),
										);
										break;

									case "response.web_search_call.completed":
										console.log("✅ Web search completed");

										// Send status to client
										controller.enqueue(
											this.encoder.encode(
												JSON.stringify({
													type: "web_search_completed",
													message: "Pesquisa web concluída",
												}) + "\n",
											),
										);
										break;

									case "error":
										console.error("❌ Stream error event:", eventData);
										console.error("❌ Full error data:", JSON.stringify(eventData, null, 2));

										// Determinar a estrutura do erro
										let errorMessage = "Erro no stream";
										let errorCode = "unknown";

										if (eventData.error) {
											errorMessage = eventData.error.message || eventData.error;
											errorCode = eventData.error.code || "unknown";
										} else if (eventData.message) {
											errorMessage = eventData.message;
										} else if (eventData.code && eventData.message) {
											errorCode = eventData.code;
											errorMessage = eventData.message;
										}

										console.error(`❌ Processed error - Code: ${errorCode}, Message: ${errorMessage}`);

										// Send error to client
										controller.enqueue(
											this.encoder.encode(
												JSON.stringify({
													type: "stream_error",
													error: errorMessage,
													error_code: errorCode,
													details: eventData,
												}) + "\n",
											),
										);
										break;

									case "response.failed":
										console.error("❌ Response failed:", eventData.response?.error);
										controller.enqueue(
											this.encoder.encode(
												JSON.stringify({
													type: "error",
													error: eventData.response?.error?.message || "Response failed",
												}) + "\n",
											),
										);
										break;

									case "response.completed":
										console.log("🏁 Response completed, processing final output");

										// Store the complete response data
										this.fullResponseData = eventData.response;

										// Process final output for images
										if (eventData.response?.output && Array.isArray(eventData.response.output)) {
											for (const output of eventData.response.output) {
												if (output.type === "image_generation_call") {
													console.log("🖼️ Processing generated image");

													// Save image to MinIO and database
													try {
														const session = await auth();

														if (session?.user?.id && output.result) {
															// Convert base64 to buffer
															const base64Data = output.result.replace(/^data:image\/\w+;base64,/, "");
															const imageBuffer = Buffer.from(base64Data, "base64");

															// Upload to MinIO
															const uploadResult = await uploadToMinIO(
																imageBuffer,
																`generated-image-${Date.now()}.png`,
																"image/png",
																true, // Generate thumbnail
															);

															const imageUrl = uploadResult.url;
															const thumbnailUrl = uploadResult.thumbnail_url || "";

															console.log(`💾 Image saved to MinIO: ${imageUrl}`);

															// Save to database
															const savedImage = await getPrismaInstance().generatedImage.create({
																data: {
																	userId: session.user.id,
																	sessionId: this.sessionIdForDB || null,
																	prompt: this.userPrompt || "Imagem gerada",
																	revisedPrompt: output.revised_prompt || null,
																	model: this.modelName || "",
																	imageUrl: imageUrl,
																	thumbnailUrl: thumbnailUrl,
																	mimeType: uploadResult.mime_type,
																	createdAt: new Date(),
																},
															});

															console.log(`💾 Image saved to database: ${savedImage.id}`);

															// Store image result for final response
															const imageResult = {
																id: output.id,
																result: output.result,
																revised_prompt: output.revised_prompt,
																url: imageUrl,
																image_url: imageUrl,
																thumbnail_url: thumbnailUrl,
															};

															this.imageResults.push(imageResult);

															// Send image generated event immediately
															controller.enqueue(
																this.encoder.encode(
																	JSON.stringify({
																		type: "image_generated",
																		image_data: output.result,
																		image_url: imageUrl,
																		thumbnail_url: thumbnailUrl,
																		revised_prompt: output.revised_prompt,
																		image_id: output.id,
																	}) + "\n",
																),
															);
														} else {
															console.log("⚠️ Could not save image: user not authenticated or empty result");

															// Still send the event with available data
															const imageResult = {
																id: output.id,
																result: output.result,
																revised_prompt: output.revised_prompt,
																url: "",
																image_url: "",
																thumbnail_url: "",
															};

															this.imageResults.push(imageResult);

															controller.enqueue(
																this.encoder.encode(
																	JSON.stringify({
																		type: "image_generated",
																		image_data: output.result || "",
																		image_url: "",
																		thumbnail_url: "",
																		revised_prompt: output.revised_prompt,
																		image_id: output.id,
																	}) + "\n",
																),
															);
														}
													} catch (saveError) {
														console.error("❌ Error saving image to MinIO:", saveError);

														// Still send the event with available data
														const imageResult = {
															id: output.id,
															result: output.result,
															revised_prompt: output.revised_prompt,
															url: "",
															image_url: "",
															thumbnail_url: "",
														};

														this.imageResults.push(imageResult);

														controller.enqueue(
															this.encoder.encode(
																JSON.stringify({
																	type: "image_generated",
																	image_data: output.result || "",
																	image_url: "",
																	thumbnail_url: "",
																	revised_prompt: output.revised_prompt,
																	image_id: output.id,
																}) + "\n",
															),
														);
													}
												}
											}
										}

										// IMPORTANTE: Salvar mensagem do assistente no banco também aqui (Responses API)
										if (this.sessionIdForDB) {
											try {
												let contentToSave = this.completeContent;

												// Se temos imagens, adicionar elas como markdown ao conteúdo
												if (this.imageResults.length > 0) {
													// Buscar as imagens salvas no banco para obter as URLs corretas
													const session = await auth();

													if (session?.user?.id) {
														const savedImages = await getPrismaInstance().generatedImage.findMany({
															where: {
																userId: session.user.id,
																sessionId: this.sessionIdForDB,
															},
															orderBy: {
																createdAt: "desc",
															},
															take: this.imageResults.length,
														});

														// Usar as URLs das imagens salvas
														savedImages.forEach((img, index) => {
															const imageMarkdown = `![Imagem gerada](${img.imageUrl})`;

															if (contentToSave) {
																contentToSave += `\n\n${imageMarkdown}`;
															} else {
																contentToSave = imageMarkdown;
															}
														});
													} else {
														// Fallback: usar as URLs dos resultados (se disponíveis)
														this.imageResults.forEach((img, index) => {
															const imageUrl = img.url || img.image_url || "";
															if (imageUrl) {
																const imageMarkdown = `![Imagem gerada](${imageUrl})`;

																if (contentToSave) {
																	contentToSave += `\n\n${imageMarkdown}`;
																} else {
																	contentToSave = imageMarkdown;
																}
															}
														});
													}
												}

												// Salvar mensagem com dados completos da Responses API
												await saveMessageToDatabase(this.sessionIdForDB, {
													role: "assistant",
													content: contentToSave,
													contentType: "text",
													responsesApiResponse: this.fullResponseData,
													usage: this.fullResponseData?.usage,
												});

												console.log("✅ Assistant message saved to database [COMPLETED]");
											} catch (dbError) {
												console.error("❌ Error saving message to database [COMPLETED]:", dbError);
											}
										}

										break;

									default:
										console.log(`ℹ️ Unhandled event type: ${eventData.type}`);
								}
							} catch (parseErr: any) {
								// Log the error but don't crash the stream
								console.error("❌ Error parsing Responses API event:", parseErr.message);
								console.log("🔍 Problematic data:", data.substring(0, 100) + (data.length > 100 ? "..." : ""));
								console.log("🔍 Full problematic data:", data);
								console.log("🔍 Event data type:", typeof data);
								console.log("🔍 Event data length:", data.length);

								// If the error is about unterminated JSON, keep in buffer for next chunk
								if (
									parseErr.message.includes("Unterminated string") ||
									parseErr.message.includes("Unexpected end of JSON")
								) {
									// Put the data back in the buffer to combine with the next chunk
									this.buffer = "data: " + data + "\n" + this.buffer;
									console.log("📝 Added incomplete JSON back to buffer for next chunk");
									continue;
								}

								// Se não é um erro de JSON incompleto, tentar tratar como evento especial
								if (data.includes("error") || data.includes("failed")) {
									console.log("🚨 Detected error-like content, sending error event to client");
									controller.enqueue(
										this.encoder.encode(
											JSON.stringify({
												type: "parse_error",
												error: "Erro ao processar evento da API",
												raw_data: data,
												parse_error: parseErr.message,
											}) + "\n",
										),
									);
								}
							}
						}
					}
				} catch (outerError) {
					// Catch any errors in the outer processing to prevent the stream from breaking
					console.error("❌ Error processing chunk:", outerError);
					// Continue processing - don't break the stream
				}
			}
		}

		// Create our transformer instance
		const transformer = new ChunkTransformer(sessionId, userContent, apiModel, finalPreviousResponseId);
		const transformStream = new TransformStream(transformer);

		// O responsesCall retorna um stream que precisa ser processado
		// Converter o openaiResponse para um ReadableStream seguindo a Responses API
		let streamBody: ReadableStream<Uint8Array>;

		if (openaiResponse && typeof openaiResponse[Symbol.asyncIterator] === "function") {
			// Se é um stream iterável da Responses API, converter para ReadableStream
			streamBody = new ReadableStream({
				async start(controller) {
					try {
						for await (const event of openaiResponse) {
							// Processar eventos semânticos da Responses API
							const eventStr = JSON.stringify(event) + "\n";
							controller.enqueue(new TextEncoder().encode(`data: ${eventStr}`));
						}
						controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
						controller.close();
					} catch (error) {
						controller.error(error);
					}
				},
			});
		} else {
			// Se não é um stream, criar um stream simples com a resposta
			const responseStr = JSON.stringify(openaiResponse);
			streamBody = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(`data: ${responseStr}\n`));
					controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
					controller.close();
				},
			});
		}

		// Return the transformed stream
		return new NextResponse(streamBody.pipeThrough(transformStream), {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error("OpenAI error:", error);
		return NextResponse.json({ error: "Erro ao processar requisição com OpenAI" }, { status: 500 });
	}
}

// Removido handler da Anthropic

// Helper function to save a message to the database
async function saveMessageToDatabase(
	sessionId: string,
	message: {
		role: string;
		content: string;
		contentType: string;
		previousResponseId?: string;
		responseId?: string;
		imageUrl?: string;
		audioData?: string;
		responsesApiResponse?: any;
		usage?: {
			input_tokens?: number;
			output_tokens?: number;
			total_tokens?: number;
			reasoning_tokens?: number;
		};
	},
) {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			console.error("Cannot save message: No authenticated user");
			return null;
		}

		// Verify that the chat session belongs to the user
		const chatSession = await getPrismaInstance().chatSession.findUnique({
			where: {
				id: sessionId,
				userId: session.user.id,
			},
		});

		if (!chatSession) {
			console.error("Cannot save message: Chat session not found or does not belong to user");
			return null;
		}

		// Extrair dados da Responses API se disponível
		const responsesData = message.responsesApiResponse;

		// Save the message to the database
		const savedMessage = await getPrismaInstance().chatMessage.create({
			data: {
				sessionId,
				role: message.role,
				content: message.content,
				contentType: message.contentType,
				imageUrl: message.imageUrl,
				audioData: message.audioData,
				// Novos campos da Responses API
				modelUsed: responsesData?.model,
				inputTokens: message.usage?.input_tokens,
				outputTokens: message.usage?.output_tokens,
				totalTokens: message.usage?.total_tokens,
				reasoningTokens: message.usage?.reasoning_tokens,
				temperature: responsesData?.temperature,
				topP: responsesData?.top_p,
				responseStatus: responsesData?.status,
			},
		});

		// Update the session's updatedAt timestamp
		await getPrismaInstance().chatSession.update({
			where: { id: sessionId },
			data: { updatedAt: new Date() },
		});

		console.log(`Message saved to database for session ${sessionId}`);
		if (message.responsesApiResponse) {
			console.log(
				`📊 Responses API data saved: model=${responsesData?.model}, tokens=${message.usage?.total_tokens}, status=${responsesData?.status}`,
			);
		}
		return savedMessage;
	} catch (error) {
		console.error("Error saving message to database:", error);
		return null;
	}
}

// Helper function to save uploaded images to the database for future reference
async function saveUploadedImageToDatabase(
	sessionId: string,
	imageUrl: string,
	prompt = "Imagem enviada pelo usuário",
) {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			console.error("Cannot save uploaded image: No authenticated user");
			return null;
		}

		// Save the uploaded image to the generatedImage table for consistency
		const savedImage = await getPrismaInstance().generatedImage.create({
			data: {
				userId: session.user.id,
				sessionId: sessionId,
				prompt: prompt,
				revisedPrompt: null,
				model: "user-upload", // Identificar como upload do usuário
				imageUrl: imageUrl,
				thumbnailUrl: imageUrl.replace(".jpg", "_thumb.jpg").replace(".png", "_thumb.png"), // Assumir que há thumbnail
				mimeType: imageUrl.includes(".jpg") ? "image/jpeg" : "image/png",
				createdAt: new Date(),
			},
		});

		console.log(`📸 Uploaded image saved to database: ${savedImage.id}`);
		return savedImage;
	} catch (error) {
		console.error("Error saving uploaded image to database:", error);
		return null;
	}
}
