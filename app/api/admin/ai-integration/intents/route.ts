/**
 * app/api/admin/ai-integration/intents/route.ts
 *
 * API de Gerenciamento de IntenÃ§Ãµes para IntegraÃ§Ã£o com IA
 *
 * Ciclo completo:
 * - âœ… CriaÃ§Ã£o de intenÃ§Ãµes com geraÃ§Ã£o automÃ¡tica de embeddings
 * - âœ… AtualizaÃ§Ã£o com regeneraÃ§Ã£o de embeddings quando descriÃ§Ã£o mudar
 * - âœ… ExclusÃ£o com limpeza de cache
 * - âœ… Listagem (GET) com filtros bÃ¡sicos
 * - âœ… OpenAI Embeddings (text-embedding-3-small, 1536d)
 * - âœ… Cache: pacote (centroide + aliases) salvo no Redis
 * - âœ… Fallback: funciona sem OPENAI_API_KEY (sem embeddings)
 *
 * ConvenÃ§Ã£o de descriÃ§Ã£o com aliases (opcional):
 *
 *  DescriÃ§Ã£o livre...
 *
 *  ---
 *  ALIASES:
 *  quero fazer recurso da prova oab
 *  recurso oab
 *  impugnar gabarito oab fgv
 *  ...
 *
 * ObservaÃ§Ã£o: a consulta (similaridade) deve ler o pacote do Redis:
 *   HGETALL ai:intent:{id}:emb  => { model, centroid, aliases, updatedAt }
 * e usar score = max(cos(q, centroid), ...cos(q, alias_i)).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance, getRedisInstance } from "@/lib/connections";
import { embeddingGenerator } from "@/lib/ai-integration/services/embedding-generator";
import { createLogger } from "@/lib/utils/logger";
import { Prisma } from "@prisma/client";

const prisma = getPrismaInstance();
const logger = createLogger("AI-Intents");

const OPENAI_EMBED_MODEL = "text-embedding-3-small"; // 1536 dims

// ---------------------------------------------------------------------
// Helpers de texto/vetores
// ---------------------------------------------------------------------
function slugify(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)+/g, "");
}

async function generateUniqueSlug(baseSlug: string, userId: string): Promise<string> {
	let slug = baseSlug;
	let counter = 1;
	while (true) {
		const existing = await prisma.intent.findFirst({ where: { slug, createdById: userId }, select: { id: true } });
		if (!existing) break;
		slug = `${baseSlug}-${counter}`;
		counter++;
	}
	return slug;
}

async function ensureUserExists(userId: string, fallbackEmail?: string, name?: string) {
	const existing = await prisma.user.findUnique({ where: { id: userId } });
	if (existing) return existing;
	return prisma.user.create({
		data: {
			id: userId,
			email: fallbackEmail || `${userId}@local.invalid`,
			name: name || undefined,
		},
	});
}

function normalizeText(t: string) {
	return (t || "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}
function l2norm(v: number[]) {
	return Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
}
function l2normalize(v: number[]) {
	const n = l2norm(v);
	return v.map((x) => x / n);
}
function avg(vs: number[][]) {
	const out = new Array(vs[0].length).fill(0);
	for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i];
	return out.map((x) => x / vs.length);
}

/**
 * Extrai a descriÃ§Ã£o base e a lista de aliases (um por linha) de um texto
 * com a convenÃ§Ã£o:
 *
 *  <descriÃ§Ã£o>
 *  ---
 *  ALIASES:
 *  alias 1
 *  alias 2
 *  ...
 */
function extractDescAndAliases(raw: string) {
	if (!raw) return { base: "", aliases: [] as string[] };
	const parts = raw.split("\n---\n");
	const base = (parts[0] || "").trim();
	const aliases: string[] = [];
	if (parts[1]) {
		const lines = parts[1].split(/\n/);
		let on = false;
		for (const line of lines) {
			if (/^\s*aliases\s*:\s*$/i.test(line)) {
				on = true;
				continue;
			}
			if (on && line.trim()) aliases.push(line.trim());
		}
	}
	return { base, aliases };
}

/**
 * Gera pacote de embeddings (centroide + aliases) a partir do name/description.
 * - Normaliza textos
 * - Gera embeddings em lote (1 chamada OpenAI)
 * - L2-normaliza e calcula centroide
 * - Se nÃ£o houver aliases, inclui alguns curtos automÃ¡ticos
 */
async function buildEmbeddingsPackage(name: string, description: string | null) {
	const { base, aliases } = extractDescAndAliases(description || "");
	const seeds: string[] = [];

	const baseText = base || name || "";
	if (baseText) seeds.push(normalizeText(baseText));

	for (const a of aliases) {
		const n = normalizeText(a);
		if (n && !seeds.includes(n)) seeds.push(n);
	}

	const seedsFinal = Array.from(new Set(seeds)).slice(0, 32); // dedup + limite
	if (!seedsFinal.length || !process.env.OPENAI_API_KEY) {
		return {
			centroid: null as any,
			aliases: [] as number[][],
			model: OPENAI_EMBED_MODEL,
			seedsCount: 0,
			seedsText: [] as string[],
			aliasesText: aliases,
		};
	}

	const r = await fetch("https://api.openai.com/v1/embeddings", {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
		body: JSON.stringify({ model: OPENAI_EMBED_MODEL, input: seedsFinal }),
	});

	if (!r.ok) {
		logger.error("Falha ao obter embeddings (batch)", { status: r.status });
		return {
			centroid: null as any,
			aliases: [] as number[][],
			model: OPENAI_EMBED_MODEL,
			seedsCount: 0,
			seedsText: seedsFinal, // â† mantÃ©m consistÃªncia e permite prewarm opcional
			aliasesText: aliases,
		};
	}

	const j: any = await r.json();
	const vecsRaw: number[][] = (j?.data || []).map((d: any) => d?.embedding).filter(Array.isArray);

	if (!vecsRaw.length) {
		logger.warn("Resposta de embedding vazia/inesperada");
		return {
			centroid: null as any,
			aliases: [] as number[][],
			model: OPENAI_EMBED_MODEL,
			aliasesText: aliases,
			seedsCount: seedsFinal.length, // mantÃ©m o total real de seeds
			seedsText: seedsFinal, // habilita prewarm/observabilidade mesmo sem vetor
		};
	}

	const vecs = vecsRaw.map(l2normalize);
	const centroid = l2normalize(avg(vecs));

	logger.info("Embeddings gerados (batch)", {
		model: OPENAI_EMBED_MODEL,
		seeds: seedsFinal.length,
		dims: centroid.length,
	});

	return {
		centroid,
		aliases: vecs,
		model: OPENAI_EMBED_MODEL,
		seedsCount: seedsFinal.length,
		seedsText: seedsFinal,
		aliasesText: aliases,
	};
}

/** Salva pacote (centroide + aliases) no Redis */
async function saveEmbeddingsToRedis(
	intentId: string,
	pkg: { centroid: number[]; aliases: number[][]; model: string; seedsText?: string[]; aliasesText?: string[] },
) {
	try {
		const redis = getRedisInstance();
		await redis.hset(`ai:intent:${intentId}:emb`, {
			model: pkg.model,
			centroid: JSON.stringify(pkg.centroid),
			aliases: JSON.stringify(pkg.aliases),
			aliases_text: JSON.stringify(pkg.aliasesText || []), // â† novo para observabilidade
			updatedAt: Date.now().toString(),
		});
		logger.info("Pacote de embeddings salvo no Redis", { intentId, aliases: pkg.aliases.length });
	} catch (e: any) {
		logger.error("Falha ao salvar embeddings no Redis", { intentId, err: e?.message || e });
	}
}

/** Remove o pacote do Redis (usado no DELETE) */
async function deleteEmbeddingsFromRedis(intentId: string) {
	try {
		const redis = getRedisInstance();
		await redis.del(`ai:intent:${intentId}:emb`);
	} catch (e: any) {
		logger.error("Falha ao remover embeddings do Redis", { intentId, err: e?.message || e });
	}
}

// ---------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------
export async function GET() {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "NÃ£o autenticado" }, { status: 401 });
	}

	const items = await prisma.intent.findMany({
		where: { createdById: session.user.id, isActive: true },
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			name: true,
			description: true,
			similarityThreshold: true,
			actionType: true,
			templateId: true,
			createdAt: true,
			template: { select: { id: true, name: true, type: true } },
		},
	});
	return NextResponse.json({ intents: items });
}

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "NÃ£o autenticado" }, { status: 401 });
	}

	await ensureUserExists(session.user.id, (session.user as any)?.email as string, session.user.name || undefined);

	const body = await request.json().catch(() => ({}));
	const name = (body?.name || "").trim();
	const description = (body?.description || "").trim();
	const similarityThreshold = Math.min(
		1,
		Math.max(0, typeof body?.similarityThreshold === "number" ? Number(body.similarityThreshold) : 0.8),
	);
	const templateId: string | null = body?.templateId || null;
	if (!name) return NextResponse.json({ error: "Nome Ã© obrigatÃ³rio" }, { status: 400 });

	const baseSlug = slugify(name);
	const slug = await generateUniqueSlug(baseSlug, session.user.id);

	try {
		// Se jÃ¡ existe do mesmo usuÃ¡rio â†’ atualiza (com re-embed se descriÃ§Ã£o mudou)
		const existingForUser = await prisma.intent.findFirst({
			where: { name, createdById: session.user.id },
			select: { id: true, name: true, description: true, createdById: true, templateId: true },
		});
		if (existingForUser) {
			// Buscar embedding usando raw query
			const intentWithEmbedding: Array<{ embedding: number[] | null }> = await prisma.$queryRaw(
				Prisma.sql`SELECT "embedding" FROM "Intent" WHERE "id" = ${existingForUser.id}`,
			);
			let embedding: any = intentWithEmbedding[0]?.embedding || null;
			const shouldReembed = description && description !== (existingForUser.description || "");

			if (shouldReembed) {
				logger.info("Regerando embedding para intent existente", {
					id: existingForUser.id,
					name,
					hasDescription: Boolean(description),
				});
				const pkg = await buildEmbeddingsPackage(name, description);
				if (pkg.centroid) {
					embedding = pkg.centroid; // DB guarda centroide para compat
					await saveEmbeddingsToRedis(existingForUser.id, pkg);
					logger.info("Embedding atualizado (centroide + aliases)", { id: existingForUser.id, dims: embedding.length });
					logger.debug("Embedding preview (primeiros 8 valores)", (embedding as number[]).slice(0, 8));
					// ðŸ”¥ PREWARM tambÃ©m no caminho de update via POST
					if (pkg.seedsText && pkg.seedsText.length) {
						try {
							await embeddingGenerator.generateEmbeddings(pkg.seedsText, {
								normalize: true,
								trim: true,
								lowercase: true,
								removeExtraSpaces: true,
							});
							logger.info("Prewarm de query embeddings (POST-update) concluÃ­do", { count: pkg.seedsText.length });
						} catch (e: any) {
							logger.warn("Falha no prewarm de query embeddings (POST-update)", { err: e?.message || e });
						}
					}
				}
			}

			const updated = await prisma.intent.update({
				where: { id: existingForUser.id },
				data: {
					description: description || existingForUser.description,
					similarityThreshold,
					templateId: templateId ?? existingForUser.templateId,
					actionType: templateId ? "TEMPLATE" : "TEXT",
					isActive: true,
				},
				select: {
					id: true,
					name: true,
					description: true,
					similarityThreshold: true,
					actionType: true,
					templateId: true,
					createdAt: true,
				},
			});

			// Atualizar embedding separadamente usando raw query
			if (embedding && embedding.length > 0) {
				const vectorString = `[${embedding.join(",")}]`;
				await prisma.$executeRawUnsafe(
					`UPDATE "Intent" SET "embedding" = $1::vector WHERE "id" = $2`,
					vectorString,
					existingForUser.id,
				);
			}

			logger.info("Intent atualizada com embedding", { id: updated.id, hasEmbedding: Array.isArray(embedding) });
			return NextResponse.json({ intent: updated, updated: true }, { status: 200 });
		}

		// Nome usado por outro usuÃ¡rio?
		const anyWithSameName = await prisma.intent
			.findUnique({ where: { name }, select: { id: true, createdById: true } })
			.catch(() => null);
		if (anyWithSameName && anyWithSameName.createdById !== session.user.id) {
			return NextResponse.json({ error: "JÃ¡ existe uma intenÃ§Ã£o global com este nome" }, { status: 409 });
		}

		// Gerar embedding inicial (centroide + aliases)
		let embedding: any = null;
		let pkgForCache: {
			centroid: number[];
			aliases: number[][];
			model: string;
			seedsText?: string[];
			aliasesText?: string[];
		} | null = null;

		if (description && process.env.OPENAI_API_KEY) {
			const pkg = await buildEmbeddingsPackage(name, description);
			if (pkg.centroid) {
				embedding = pkg.centroid;
				pkgForCache = {
					centroid: pkg.centroid,
					aliases: pkg.aliases,
					model: pkg.model,
					seedsText: pkg.seedsText,
					aliasesText: pkg.aliasesText,
				};
				logger.info("Embedding criado (centroide + aliases)", { dimensions: embedding.length, model: pkg.model });
				logger.debug("Embedding preview (primeiros 8 valores)", (embedding as number[]).slice(0, 8));
			} else {
				logger.warn("Embedding nÃ£o gerado (sem OPENAI ou sem seeds)");
			}
		}

		const created = await prisma.intent.create({
			data: {
				name,
				slug,
				description: description || null,
				actionType: templateId ? "TEMPLATE" : "TEXT",
				templateId: templateId,
				similarityThreshold,
				isActive: true,
				createdById: session.user.id,
			},
			select: {
				id: true,
				name: true,
				description: true,
				similarityThreshold: true,
				actionType: true,
				templateId: true,
				createdAt: true,
			},
		});

		// Atualizar embedding separadamente usando raw query
		if (embedding && embedding.length > 0) {
			const vectorString = `[${embedding.join(",")}]`;
			await prisma.$executeRawUnsafe(
				`UPDATE "Intent" SET "embedding" = $1::vector WHERE "id" = $2`,
				vectorString,
				created.id,
			);
		}

		if (pkgForCache) {
			await saveEmbeddingsToRedis(created.id, pkgForCache);
			// ðŸ”¥ PREWARM: grava embeddings de consulta (frases/aliases) no cache do Redis
			if (pkgForCache.seedsText && pkgForCache.seedsText.length) {
				try {
					await embeddingGenerator.generateEmbeddings(pkgForCache.seedsText, {
						normalize: true,
						trim: true,
						lowercase: true,
						removeExtraSpaces: true,
					});
					logger.info("Prewarm de query embeddings concluÃ­do", { count: pkgForCache.seedsText.length });
				} catch (e: any) {
					logger.warn("Falha no prewarm de query embeddings", { err: e?.message || e });
				}
			}
		}

		logger.info("Intent criada", { id: created.id, hasEmbedding: Array.isArray(embedding) });
		return NextResponse.json({ intent: created, created: true }, { status: 201 });
	} catch (e: any) {
		if (e?.code === "P2002") {
			if (e?.meta?.target?.includes("slug")) {
				return NextResponse.json(
					{ error: "Erro interno: slug duplicado detectado. Tente novamente." },
					{ status: 409 },
				);
			}
			return NextResponse.json({ error: "JÃ¡ existe uma intenÃ§Ã£o com este nome" }, { status: 409 });
		}
		logger.error("Erro ao criar intent", { error: e?.message || e, code: e?.code });
		return NextResponse.json({ error: "Falha ao criar intenÃ§Ã£o" }, { status: 500 });
	}
}

export async function DELETE(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "NÃ£o autenticado" }, { status: 401 });
	}
	const { searchParams } = new URL(request.url);
	const id = searchParams.get("id");
	if (!id) return NextResponse.json({ error: "id obrigatÃ³rio" }, { status: 400 });

	const intent = await prisma.intent.findUnique({
		where: { id },
		select: { id: true, createdById: true, name: true, slug: true },
	});
	if (!intent || intent.createdById !== session.user.id) {
		return NextResponse.json({ error: "NÃ£o encontrado" }, { status: 404 });
	}

	// Use raw SQL to avoid Prisma trying to deserialize vector column
	await prisma.$executeRaw`DELETE FROM "Intent" WHERE id = ${id}`;
	await deleteEmbeddingsFromRedis(id);

	logger.info("Intent deletada", { id, name: intent.name, slug: intent.slug });
	return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "NÃ£o autenticado" }, { status: 401 });
	}

	const body = await request.json().catch(() => ({}) as any);
	const id = String(body?.id || "").trim();
	if (!id) return NextResponse.json({ error: "id obrigatÃ³rio" }, { status: 400 });

	const intent = await prisma.intent.findUnique({
		where: { id },
		select: { id: true, createdById: true, name: true, description: true },
	});
	if (!intent || intent.createdById !== session.user.id) {
		return NextResponse.json({ error: "NÃ£o encontrado" }, { status: 404 });
	}

	const nextNameRaw: string | undefined = typeof body?.name === "string" ? body.name.trim() : undefined;
	const nextDescription: string | null | undefined =
		typeof body?.description === "string" ? body.description.trim() : undefined;
	const nextThreshold: number | undefined =
		typeof body?.similarityThreshold === "number"
			? Math.min(1, Math.max(0, Number(body.similarityThreshold)))
			: undefined;
	const nextTemplateId: string | null | undefined =
		body?.templateId === null ? null : typeof body?.templateId === "string" ? body.templateId : undefined;

	if (!nextNameRaw && nextDescription === undefined && nextThreshold === undefined && nextTemplateId === undefined) {
		return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
	}

	// Enforce unique name se mudou
	if (nextNameRaw && nextNameRaw !== intent.name) {
		const conflict = await prisma.intent
			.findUnique({ where: { name: nextNameRaw }, select: { id: true } })
			.catch(() => null);
		if (conflict && conflict.id !== id) {
			return NextResponse.json({ error: "JÃ¡ existe uma intenÃ§Ã£o com este nome" }, { status: 409 });
		}
	}

	const data: any = {};
	if (nextNameRaw) {
		data.name = nextNameRaw;
		data.slug = slugify(nextNameRaw);
	}
	if (nextDescription !== undefined) data.description = nextDescription || null;
	if (nextThreshold !== undefined) data.similarityThreshold = nextThreshold;
	if (nextTemplateId !== undefined) {
		data.templateId = nextTemplateId;
		data.actionType = nextTemplateId ? "TEMPLATE" : "TEXT";
	}

	// Se a descriÃ§Ã£o mudou, regera pacote e atualiza DB + Redis
	let embedding: any = null;
	const descriptionChanged =
		nextDescription !== undefined && (nextDescription || null) !== (intent.description || null);
	if (descriptionChanged && process.env.OPENAI_API_KEY) {
		const pkg = await buildEmbeddingsPackage(nextNameRaw || intent.name, nextDescription || "");
		if (pkg.centroid) {
			embedding = pkg.centroid; // Mantém separado do data para update manual
			await saveEmbeddingsToRedis(id, pkg);
			logger.info("Embedding (PATCH) atualizado", { id, dims: (embedding as number[]).length });
			logger.debug("Embedding (PATCH) preview (primeiros 8 valores)", (embedding as number[]).slice(0, 8));
			// ðŸ"¥ PREWARM apÃ³s atualizaÃ§Ã£o
			if (pkg.seedsText && pkg.seedsText.length) {
				try {
					await embeddingGenerator.generateEmbeddings(pkg.seedsText, {
						normalize: true,
						trim: true,
						lowercase: true,
						removeExtraSpaces: true,
					});
					logger.info("Prewarm de query embeddings (PATCH) concluÃ­do", { count: pkg.seedsText.length });
				} catch (e: any) {
					logger.warn("Falha no prewarm de query embeddings (PATCH)", { err: e?.message || e });
				}
			}
		} else {
			logger.warn("Embedding (PATCH) nÃ£o gerado (sem OPENAI ou sem seeds)");
		}
	} else if (descriptionChanged) {
		logger.warn('DescriÃ§Ã£o mudou mas OPENAI_API_KEY nÃ£o estÃ¡ setada â€" sem re-embedding');
	}

	const updated = await prisma.intent.update({
		where: { id },
		data,
		select: {
			id: true,
			name: true,
			description: true,
			similarityThreshold: true,
			actionType: true,
			templateId: true,
			createdAt: true,
		},
	});

	// Atualizar embedding separadamente usando raw query (se necessário)
	if (embedding && embedding.length > 0) {
		const vectorString = `[${embedding.join(",")}]`;
		await prisma.$executeRawUnsafe(`UPDATE "Intent" SET "embedding" = $1::vector WHERE "id" = $2`, vectorString, id);
	}

	logger.info("Intent atualizada (PATCH)", { id: updated.id, regeneratedEmbedding: Boolean(embedding) });
	return NextResponse.json({ intent: updated });
}
