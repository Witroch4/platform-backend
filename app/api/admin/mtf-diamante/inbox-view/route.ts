//app\api\admin\mtf-diamante\inbox-view\route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance, getRedisInstance } from "@/lib/connections";
import { performance } from "node:perf_hooks";
import crypto from "node:crypto";
import { z } from "zod";

const Q = z.object({ inboxId: z.string().optional() });

function jsonETag(obj: unknown) {
	const s = typeof obj === "string" ? obj : JSON.stringify(obj);
	return `"${crypto.createHash("sha256").update(s).digest("base64").slice(0, 27)}"`;
}

/**
 * Rota BFF (Backend for Frontend) agregadora
 * Combina múltiplas chamadas em uma única para melhor performance
 */
export async function GET(request: NextRequest) {
	const t0 = performance.now();
	let serverTiming: string[] = [];
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const { inboxId } = Q.parse(Object.fromEntries(searchParams.entries()));

		// ✅ BYPASS AUTOMÁTICO para dataType=caixas (dados críticos que precisam ser sempre atualizados)
		const dataType = searchParams.get("dataType");
		const isRequestingCaixas = dataType === "caixas";

		// Debug: bypass de cache
		const noCache =
			searchParams.get("nocache") === "1" || request.headers.get("x-skip-cache") === "1" || isRequestingCaixas; // 🔥 SEMPRE bypass cache para caixas

		// (Opcional) Verificação de acesso à inbox
		// TODO: troque pela sua regra real (tenant/ownership).
		// if (inboxId && !(await userCanAccessInbox(session.user.id, inboxId))) {
		//   return NextResponse.json({ error: "Acesso negado à caixa." }, { status: 403 });
		// }

		const cacheKey = `inbox:view:v1:${session.user.id}:${inboxId || "all"}`;
		const redis = getRedisInstance();

		// 🚨 Log especial para requisições de caixas (debug)
		if (isRequestingCaixas && process.env.NODE_ENV === "development") {
			console.log(`🔥 [CAIXAS] Cache BYPASSED automaticamente - dados sempre frescos`);
		}

		// 1) Tenta cache (só se não for bypass)
		let cacheHit = false;
		let cachedString: string | null = null;
		if (!noCache) {
			try {
				cachedString = await redis.get(cacheKey);
				if (cachedString) {
					cacheHit = true;
					const etag = jsonETag(cachedString);
					if (request.headers.get("if-none-match") === etag) {
						return new NextResponse(null, {
							status: 304,
							headers: {
								ETag: etag,
								"Cache-Control": "private, max-age=30, stale-while-revalidate=60",
								"X-Cache": "HIT",
							},
						});
					}
					const data = JSON.parse(cachedString);
					const t1 = performance.now();
					serverTiming.push(`cache;desc="redis-hit";dur=${(t1 - t0).toFixed(0)}`);
					return NextResponse.json(data, {
						headers: {
							ETag: etag,
							"Cache-Control": "private, max-age=30, stale-while-revalidate=60",
							"X-Cache": "HIT",
							"Server-Timing": serverTiming.join(", "),
						},
					});
				}
			} catch (e) {
				// segue sem cache
			}
		}

		const prisma = getPrismaInstance();

		// 2) DB em paralelo (SELECT minimal + paginação)
		const dbStart = performance.now();
		const [variaveisData, caixasData, interactiveMessages, apiKeys, buttonReactions, allAssistants] = await Promise.all(
			[
				// Variáveis
				prisma.mtfDiamanteVariavel.findMany({
					select: { id: true, chave: true, valor: true },
					orderBy: { chave: "asc" },
				}),

				// Caixas/Inboxes - buscar apenas do usuário logado
				(async () => {
					const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
						where: { appUserId: session.user.id },
					});

					if (!usuarioChatwit) {
						return [];
					}

					return prisma.chatwitInbox.findMany({
						where: { usuarioChatwitId: usuarioChatwit.id },
						select: {
							id: true,
							nome: true,
							inboxId: true,
							channelType: true, // 🔥 Adicionando o channelType aqui
							agentes: {
								select: {
									id: true,
									nome: true,
									ativo: true,
									projectId: true,
									region: true,
									hookId: true,
								},
							},
							aiAssistantLinks: {
								select: {
									id: true,
									assistantId: true,
									isActive: true,
									assistant: {
										select: {
											id: true,
											name: true,
											isActive: true,
											model: true,
											description: true,
										},
									},
								},
							},
						},
						orderBy: { nome: "asc" },
					});
				})(),

				// Mensagens interativas (sempre buscar se temos inboxId)
				inboxId
					? prisma.template.findMany({
							where: {
								inboxId: inboxId,
								type: "INTERACTIVE_MESSAGE",
								interactiveContent: {
									isNot: null,
								},
							},
							orderBy: { createdAt: "desc" },
							take: 100, // paginação para não estourar payload
							select: {
								id: true,
								name: true, // v2
								type: true,
								// Campos de compatibilidade v1 (se existirem)
								simpleReplyText: true, // pode ser usado como 'texto'
								// Relations para conteúdo interativo
								interactiveContent: {
									select: {
										id: true,
										header: {
											select: {
												type: true,
												content: true,
											},
										},
										body: {
											select: {
												text: true,
											},
										},
										footer: {
											select: {
												text: true,
											},
										},
										actionReplyButton: {
											select: {
												buttons: true,
											},
										},
										actionCtaUrl: {
											select: {
												displayText: true,
												url: true,
											},
										},
										actionList: {
											select: {
												buttonText: true,
												sections: true,
											},
										},
										actionFlow: {
											select: {
												flowId: true,
												flowCta: true,
												flowMode: true,
											},
										},
										actionLocationRequest: {
											select: {
												requestText: true,
											},
										},
									},
								},
								createdAt: true,
							},
						})
					: [],

				// API Keys (se for admin)
				session.user.role === "ADMIN" || session.user.role === "SUPERADMIN"
					? prisma.apiKey.findMany({
							where: { ownerId: session.user.id },
							select: {
								id: true,
								label: true,
								tokenPrefix: true,
								tokenSuffix: true,
								active: true,
								createdAt: true,
							},
							orderBy: { createdAt: "desc" },
							take: 50,
						})
					: [],

				// Reações de botões (se temos inboxId)
				inboxId
					? prisma.mapeamentoBotao.findMany({
							where: {
								inboxId: inboxId,
								inbox: {
									usuarioChatwit: {
										appUserId: session.user.id,
									},
								},
							},
							select: {
								id: true,
								buttonId: true,
								inboxId: true,
								actionType: true,
								actionPayload: true,
								description: true,
								createdAt: true,
								updatedAt: true,
							},
							orderBy: { createdAt: "asc" },
						})
					: [],

				// Buscar todos os assistentes de IA disponíveis do usuário
				prisma.aiAssistant.findMany({
					where: { userId: session.user.id },
					select: {
						id: true,
						name: true,
						isActive: true,
						model: true,
						description: true,
					},
					orderBy: { name: "asc" },
				}),
			],
		);
		const dbEnd = performance.now();
		serverTiming.push(`db;dur=${(dbEnd - dbStart).toFixed(0)}`);

		// Transformar dados se necessário
		const caixasProcessadas = caixasData.map((caixa: any) => {
			// Criar mapa dos assistentes conectados a esta caixa
			const assistentesConectados = new Map();
			caixa.aiAssistantLinks.forEach((link: any) => {
				assistentesConectados.set(link.assistantId, {
					linkId: link.id,
					isActive: link.isActive,
				});
			});

			// Combinar todos os assistentes com status de conexão
			const assistentesCompletos = allAssistants.map((assistant: any) => {
				const conexao = assistentesConectados.get(assistant.id);
				const isConnected = !!conexao;
				const isActive = conexao ? conexao.isActive : false;

				// Debug log para identificar problemas
				if (process.env.NODE_ENV === "development") {
					console.log(
						`[Debug Assistente] ${assistant.name}: conectado=${isConnected}, ativo=${isActive}, linkId=${conexao?.linkId}, raw_conexao=`,
						conexao,
					);
				}

				return {
					id: assistant.id,
					linkId: conexao?.linkId || null,
					nome: assistant.name,
					ativo: isActive,
					conectado: isConnected,
					model: assistant.model,
					description: assistant.description,
					tipo: "capitao",
				};
			});

			return {
				...caixa,
				agentes: Array.isArray(caixa.agentes) ? caixa.agentes : [],
				assistentes: assistentesCompletos,
			};
		});

		// Processar lotes da variável especial
		const lotesVariavel = variaveisData.find((v: any) => v.chave === "lotes_oab");
		const lotes = lotesVariavel ? (lotesVariavel.valor as any) || [] : [];

		// Filtrar variáveis que não são lotes
		const variaveisSemLotes = variaveisData.filter((v: any) => v.chave !== "lotes_oab");

		// Formatar reações no mesmo padrão do endpoint messages-with-reactions
		const formattedReactions = buttonReactions.map((reaction: any) => {
			const actionPayload = reaction.actionPayload as any;
			const emoji = actionPayload?.emoji;
			const textReaction = actionPayload?.textReaction;
			const action = actionPayload?.action;

			// Determinar tipo baseado na prioridade: action > text > emoji
			let type: "emoji" | "text" | "action" = "emoji";
			if (action) {
				type = "action";
			} else if (textReaction) {
				type = "text";
			}

			return {
				id: reaction.id,
				buttonId: reaction.buttonId,
				messageId: reaction.inboxId,
				type,
				emoji: emoji || null,
				textReaction: textReaction || null,
				textResponse: textReaction || null, // Alias para compatibilidade
				action: action || null,
				isActive: true,
				createdAt: reaction.createdAt,
				updatedAt: reaction.updatedAt,
			};
		});

		const responseData = {
			variaveis: variaveisSemLotes,
			lotes: lotes,
			caixas: caixasProcessadas,
			interactiveMessages,
			buttonReactions: formattedReactions,
			apiKeys,
			timestamp: new Date().toISOString(),
			inboxId,
		};

		const bodyString = JSON.stringify(responseData);
		const etag = jsonETag(bodyString);

		// 3) Salva cache (TTL com jitter) - só se não for bypass
		if (!noCache) {
			try {
				const ttl = 60 + Math.floor(Math.random() * 20);
				await redis.setex(cacheKey, ttl, bodyString);
			} catch {}
		}

		const tEnd = performance.now();
		serverTiming.push(`total;dur=${(tEnd - t0).toFixed(0)}`);

		return new NextResponse(bodyString, {
			headers: {
				"Content-Type": "application/json",
				...(noCache
					? { "Cache-Control": "no-store" }
					: { ETag: etag, "Cache-Control": "private, max-age=30, stale-while-revalidate=60" }),
				"X-Cache": noCache ? "BYPASS" : cacheHit ? "HIT" : "MISS",
				"Server-Timing": serverTiming.join(", "),
			},
		});
	} catch (error) {
		console.error("❌ [BFF] Erro ao buscar dados agregados:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
