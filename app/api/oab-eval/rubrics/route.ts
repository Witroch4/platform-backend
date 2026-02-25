import { NextResponse } from "next/server";
import { listRubrics } from "@/lib/oab-eval/repository";
import { verificarPontuacao, type Subitem } from "@/lib/oab/gabarito-parser-deterministico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	try {
		const rubrics = await listRubrics();

		const serialized = rubrics.map((rubric) => {
			const payload = (rubric.schema ?? {}) as {
				meta?: Record<string, unknown>;
				itens?: Subitem[];
				grupos?: Array<Record<string, unknown>>;
			};
			const itens = Array.isArray(payload.itens) ? payload.itens : [];
			const grupos = Array.isArray(payload.grupos) ? payload.grupos : [];

			let verificacao: ReturnType<typeof verificarPontuacao> | null = null;
			try {
				verificacao = verificarPontuacao(itens as any);
			} catch (err) {
				console.warn("[OAB::RUBRICS::LIST] Falha ao verificar pontuação", rubric.id, err);
			}

			return {
				id: rubric.id,
				exam: rubric.exam ?? payload.meta?.exam ?? null,
				area: rubric.area ?? payload.meta?.area ?? null,
				version: rubric.version ?? payload.meta?.versao_schema ?? null,
				pdfUrl: rubric.pdfUrl ?? null,
				createdAt: rubric.createdAt,
				updatedAt: rubric.updatedAt,
				meta: payload.meta ?? rubric.meta ?? null,
				counts: {
					itens: itens.length,
					grupos: grupos.length,
				},
				pontuacao: verificacao
					? {
							geral: verificacao.geral,
							peca: verificacao.peca,
							questoes: verificacao.questoes,
						}
					: null,
			};
		});

		return NextResponse.json({
			success: true,
			rubrics: serialized,
			total: serialized.length,
		});
	} catch (error) {
		console.error("[OAB::RUBRICS::LIST]", error);
		return NextResponse.json(
			{ success: false, error: (error as Error).message ?? "Falha ao listar gabaritos" },
			{ status: 500 },
		);
	}
}
