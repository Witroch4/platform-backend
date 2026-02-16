/**
 * app/api/admin/ai-integration/intents/export/route.ts
 *
 * API de Exportação de Intenções para Sistema IA Capitão
 *
 * Funcionalidades:
 * - ✅ Exportação completa de todas as intenções do usuário
 * - ✅ Inclui embeddings, templates linkados e dados de configuração
 * - ✅ Formato JSON estruturado com metadados
 * - ✅ Compressão opcional para grandes volumes
 * - ✅ Auditoria e logging completo
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance, getRedisInstance } from "@/lib/connections";
import { createLogger } from "@/lib/utils/logger";

const prisma = getPrismaInstance();
const logger = createLogger("AI-Intents-Export");

interface ExportFormat {
	version: string;
	exportedAt: string;
	exportedBy: {
		id: string;
		name: string | null;
		email: string;
	};
	metadata: {
		totalIntents: number;
		totalTemplates: number;
		hasEmbeddings: boolean;
		dataIntegrity: {
			intentsWithEmbeddings: number;
			intentsWithTemplates: number;
			intentsWithDescriptions: number;
		};
	};
	intents: ExportedIntent[];
	templates: ExportedTemplate[];
}

interface ExportedIntent {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	actionType: string;
	templateId: string | null;
	similarityThreshold: number;
	isActive: boolean;
	usageCount: number;
	createdAt: string;
	updatedAt: string;
	// Embedding data
	embedding: {
		centroid: number[] | null;
		aliases: number[][];
		aliasesText: string[];
		model: string | null;
		dimensions: number | null;
	};
}

interface ExportedTemplate {
	id: string;
	name: string;
	description: string | null;
	type: string;
	scope: string;
	status: string;
	language: string;
	tags: string[];
	isActive: boolean;
	usageCount: number;
	simpleReplyText: string | null;
	createdAt: string;
	updatedAt: string;
	// Template content
	interactiveContent?: any;
	whatsappOfficialInfo?: any;
}

/**
 * Recupera dados de embedding do Redis para um intent
 */
async function getEmbeddingFromRedis(intentId: string) {
	try {
		const redis = getRedisInstance();
		const data = await redis.hgetall(`ai:intent:${intentId}:emb`);

		if (!data || !data.centroid) {
			return {
				centroid: null,
				aliases: [],
				aliasesText: [],
				model: null,
				dimensions: null,
			};
		}

		const centroid = JSON.parse(data.centroid || "[]");
		const aliases = JSON.parse(data.aliases || "[]");
		const aliasesText = JSON.parse(data.aliases_text || "[]");

		return {
			centroid,
			aliases,
			aliasesText,
			model: data.model || null,
			dimensions: Array.isArray(centroid) ? centroid.length : null,
		};
	} catch (error) {
		logger.error("Erro ao recuperar embedding do Redis", { intentId, error });
		return {
			centroid: null,
			aliases: [],
			aliasesText: [],
			model: null,
			dimensions: null,
		};
	}
}

/**
 * GET /api/admin/ai-integration/intents/export
 *
 * Exporta todas as intenções do usuário autenticado com seus embeddings e templates
 */
export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
	}

	try {
		const { searchParams } = new URL(request.url);
		const includeInactive = searchParams.get("includeInactive") === "true";
		const compress = searchParams.get("compress") === "true";

		logger.info("Iniciando exportação de intenções", {
			userId: session.user.id,
			includeInactive,
			compress,
		});

		// Buscar todas as intenções do usuário
		const intents = await prisma.intent.findMany({
			where: {
				createdById: session.user.id,
				...(includeInactive ? {} : { isActive: true }),
			},
			include: {
				template: {
					include: {
						interactiveContent: {
							include: {
								header: true,
								footer: true,
								body: true,
								actionCtaUrl: true,
								actionReplyButton: true,
								actionList: true,
								actionFlow: true,
								actionLocationRequest: true,
							},
						},
						whatsappOfficialInfo: true,
					},
				},
			},
			orderBy: { createdAt: "desc" },
		});

		// Buscar templates únicos referenciados
		const templateIds = [...new Set(intents.map((i) => i.templateId).filter(Boolean))] as string[];
		const templates = await prisma.template.findMany({
			where: {
				id: { in: templateIds },
			},
			include: {
				interactiveContent: {
					include: {
						header: true,
						footer: true,
						body: true,
						actionCtaUrl: true,
						actionReplyButton: true,
						actionList: true,
						actionFlow: true,
						actionLocationRequest: true,
					},
				},
				whatsappOfficialInfo: true,
			},
		});

		// Processar intenções e recuperar embeddings
		const exportedIntents: ExportedIntent[] = [];
		let intentsWithEmbeddings = 0;
		let intentsWithTemplates = 0;
		let intentsWithDescriptions = 0;

		for (const intent of intents) {
			// Recuperar embedding do Redis
			const embeddingData = await getEmbeddingFromRedis(intent.id);

			if (embeddingData.centroid && embeddingData.centroid.length > 0) {
				intentsWithEmbeddings++;
			}

			if (intent.templateId) {
				intentsWithTemplates++;
			}

			if (intent.description) {
				intentsWithDescriptions++;
			}

			exportedIntents.push({
				id: intent.id,
				name: intent.name,
				slug: intent.slug,
				description: intent.description,
				actionType: intent.actionType,
				templateId: intent.templateId,
				similarityThreshold: intent.similarityThreshold,
				isActive: intent.isActive,
				usageCount: intent.usageCount,
				createdAt: intent.createdAt.toISOString(),
				updatedAt: intent.updatedAt.toISOString(),
				embedding: embeddingData,
			});
		}

		// Processar templates
		const exportedTemplates: ExportedTemplate[] = templates.map((template) => ({
			id: template.id,
			name: template.name,
			description: template.description,
			type: template.type,
			scope: template.scope,
			status: template.status,
			language: template.language,
			tags: template.tags,
			isActive: template.isActive,
			usageCount: template.usageCount,
			simpleReplyText: template.simpleReplyText,
			createdAt: template.createdAt.toISOString(),
			updatedAt: template.updatedAt.toISOString(),
			interactiveContent: (template as any).interactiveContent,
			whatsappOfficialInfo: (template as any).whatsappOfficialInfo,
		}));

		// Montar formato de exportação
		const exportData: ExportFormat = {
			version: "1.0.0",
			exportedAt: new Date().toISOString(),
			exportedBy: {
				id: session.user.id,
				name: session.user.name || null,
				email: session.user.email || "unknown@example.com",
			},
			metadata: {
				totalIntents: exportedIntents.length,
				totalTemplates: exportedTemplates.length,
				hasEmbeddings: intentsWithEmbeddings > 0,
				dataIntegrity: {
					intentsWithEmbeddings,
					intentsWithTemplates,
					intentsWithDescriptions,
				},
			},
			intents: exportedIntents,
			templates: exportedTemplates,
		};

		const exportJson = JSON.stringify(exportData, null, compress ? 0 : 2);

		logger.info("Exportação concluída", {
			userId: session.user.id,
			totalIntents: exportedIntents.length,
			totalTemplates: exportedTemplates.length,
			intentsWithEmbeddings,
			sizeBytes: Buffer.byteLength(exportJson, "utf8"),
		});

		// Configurar headers para download
		const filename = `intents-export-${new Date().toISOString().split("T")[0]}.json`;

		return new NextResponse(exportJson, {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Content-Disposition": `attachment; filename="${filename}"`,
				"X-Export-Version": "1.0.0",
				"X-Total-Intents": exportedIntents.length.toString(),
				"X-Total-Templates": exportedTemplates.length.toString(),
				"X-Has-Embeddings": intentsWithEmbeddings > 0 ? "true" : "false",
			},
		});
	} catch (error) {
		logger.error("Erro durante exportação", {
			userId: session.user.id,
			error: error instanceof Error ? error.message : String(error),
		});
		return NextResponse.json({ error: "Erro interno durante exportação" }, { status: 500 });
	}
}
