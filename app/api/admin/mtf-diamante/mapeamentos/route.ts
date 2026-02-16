import { type NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";
import { auth } from "@/auth";
import { invalidateTemplateMappingCache } from "@/lib/cache/instagram-template-cache";
import { logApiCacheInvalidation, createCacheLogContext } from "@/lib/logging/cache-logging";

// POST: Cria ou atualiza um mapeamento
export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const body = await request.json();
		const { id: mappingId, intentName, templateId, caixaId, customVariables } = body;

		if (!intentName || !templateId || !caixaId) {
			return NextResponse.json({ error: "Intenção, template e caixa são obrigatórios." }, { status: 400 });
		}

		// Normalizar variáveis customizadas: preservar nomeadas e sequenciais
		const normalizedCustom: any = {};
		if (customVariables && typeof customVariables === "object") {
			try {
				const entries = Object.entries(customVariables as Record<string, any>);
				for (const [key, rawVal] of entries) {
					if (rawVal === undefined || rawVal === null) continue;
					const val = String(rawVal);
					normalizedCustom[key] = val;
					// Se for uma chave sequencial variavel_X e existir um placeholder com nome no mesmo índice,
					// manteremos o que veio do frontend (já enviamos ambos). Não inferir nomes aqui.
				}
				console.log("[Mapeamentos][Debug] Normalized customVariables:", normalizedCustom);
			} catch (e) {
				console.warn("[Mapeamentos][Warn] Failed to normalize customVariables:", e);
			}
		}

		const data = {
			intentName,
			inboxId: caixaId,
			templateId,
			customVariables: Object.keys(normalizedCustom).length > 0 ? normalizedCustom : null,
		};

		console.log("[Mapeamentos][Debug] Upsert payload", data);

		const savedMapping = await getPrismaInstance().mapeamentoIntencao.upsert({
			where: { id: mappingId || "" },
			update: data,
			create: data,
		});

		console.log("[Mapeamentos][Debug] Upsert result", savedMapping);

		// Invalidate Instagram template cache for this mapping
		try {
			// Find the ChatwitInbox to get the correct inboxId for cache invalidation
			const chatwitInbox = await getPrismaInstance().chatwitInbox.findUnique({
				where: { id: caixaId },
				select: { inboxId: true, usuarioChatwitId: true },
			});

			if (chatwitInbox) {
				// Use the correct usuarioChatwitId and Chatwit inboxId for cache invalidation
				const logContext = createCacheLogContext(
					chatwitInbox.usuarioChatwitId,
					chatwitInbox.inboxId,
					intentName,
					"invalidateTemplateMapping",
				);

				await invalidateTemplateMappingCache(intentName, chatwitInbox.usuarioChatwitId, chatwitInbox.inboxId);

				logApiCacheInvalidation("POST /mapeamentos", logContext, true, "New mapping created or updated", {
					templateId,
					internalCaixaId: caixaId,
					externalInboxId: chatwitInbox.inboxId,
					mappingId: savedMapping.id,
				});
			} else {
				const logContext = createCacheLogContext("unknown", "unknown", intentName, "invalidateTemplateMapping");
				logApiCacheInvalidation("POST /mapeamentos", logContext, false, "ChatwitInbox not found", {
					templateId,
					internalCaixaId: caixaId,
					error: "ChatwitInbox not found",
					impact: "Cache not invalidated - may serve stale data",
				});
			}
		} catch (cacheError) {
			const logContext = createCacheLogContext("unknown", "unknown", intentName, "invalidateTemplateMapping");
			logApiCacheInvalidation("POST /mapeamentos", logContext, false, "Cache invalidation error", {
				templateId,
				internalCaixaId: caixaId,
				error:
					cacheError instanceof Error
						? {
								message: cacheError.message,
								name: cacheError.name,
								stack: cacheError.stack,
							}
						: cacheError,
				impact: "Cache not invalidated - may serve stale data",
			});
			// Don't fail the request if cache invalidation fails
		}

		return NextResponse.json(savedMapping, { status: 201 });
	} catch (error) {
		console.error("Erro ao salvar mapeamento:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

// DELETE: Remove um mapeamento
export async function DELETE(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const mappingId = searchParams.get("id");

		if (!mappingId) {
			return NextResponse.json({ error: "ID do mapeamento é obrigatório" }, { status: 400 });
		}

		// Get mapping details before deletion for cache invalidation
		const existingMapping = await getPrismaInstance().mapeamentoIntencao.findUnique({
			where: { id: mappingId },
			select: { intentName: true, inboxId: true },
		});

		await getPrismaInstance().mapeamentoIntencao.delete({
			where: { id: mappingId },
		});

		// Invalidate Instagram template cache for the deleted mapping
		if (existingMapping) {
			try {
				// Find the ChatwitInbox to get the correct inboxId for cache invalidation
				const chatwitInbox = await getPrismaInstance().chatwitInbox.findUnique({
					where: { id: existingMapping.inboxId },
					select: { inboxId: true, usuarioChatwitId: true },
				});

				if (chatwitInbox) {
					// Use the correct usuarioChatwitId and Chatwit inboxId for cache invalidation
					console.log(`[API Cache Invalidation] [DEBUG] Preparing cache invalidation for mapping deletion:`, {
						operation: "DELETE /mapeamentos",
						userContext: {
							usuarioChatwitId: chatwitInbox.usuarioChatwitId,
							inboxId: chatwitInbox.inboxId,
						},
						intentName: existingMapping.intentName,
						mappingId,
						internalInboxId: existingMapping.inboxId,
						externalInboxId: chatwitInbox.inboxId,
						cacheKeyFormat: `${existingMapping.intentName}:${chatwitInbox.usuarioChatwitId}:${chatwitInbox.inboxId}`,
					});

					await invalidateTemplateMappingCache(
						existingMapping.intentName,
						chatwitInbox.usuarioChatwitId,
						chatwitInbox.inboxId,
					);

					console.log(`[API Cache Invalidation] [SUCCESS] Instagram cache cleared for mapping deletion:`, {
						operation: "DELETE /mapeamentos",
						userContext: {
							usuarioChatwitId: chatwitInbox.usuarioChatwitId,
							inboxId: chatwitInbox.inboxId,
						},
						intentName: existingMapping.intentName,
						mappingId,
						internalInboxId: existingMapping.inboxId,
						externalInboxId: chatwitInbox.inboxId,
						reason: "Mapping deleted",
					});
				} else {
					console.warn(`[API Cache Invalidation] [ERROR] ChatwitInbox not found for cache invalidation:`, {
						operation: "DELETE /mapeamentos",
						intentName: existingMapping.intentName,
						mappingId,
						internalInboxId: existingMapping.inboxId,
						error: "ChatwitInbox not found",
						impact: "Cache not invalidated - may serve stale data",
					});
				}
			} catch (cacheError) {
				console.error("[API Cache Invalidation] [ERROR] Error clearing Instagram cache:", {
					operation: "DELETE /mapeamentos",
					intentName: existingMapping?.intentName,
					mappingId,
					internalInboxId: existingMapping?.inboxId,
					error:
						cacheError instanceof Error
							? {
									message: cacheError.message,
									name: cacheError.name,
									stack: cacheError.stack,
								}
							: cacheError,
					impact: "Cache not invalidated - may serve stale data",
				});
				// Don't fail the request if cache invalidation fails
			}
		}

		return NextResponse.json({
			success: true,
			message: "Mapeamento excluído com sucesso",
		});
	} catch (error) {
		console.error("Erro ao excluir mapeamento:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
