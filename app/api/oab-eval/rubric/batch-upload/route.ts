//app/api/oab-eval/rubric/batch-upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildRubricFromPdf } from "@/lib/oab-eval/rubric-from-pdf";
import { createRubric } from "@/lib/oab-eval/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface BatchUploadResult {
  success: boolean;
  results: Array<{
    fileName: string;
    rubricId?: string;
    structured?: unknown;
    stats?: {
      itens: number;
      withEmbeddings?: boolean;
      embeddingModel?: string | null;
      metaResumo?: any;
        pontuacao?: {
          peca?: { total: number; ok: boolean; esperado: number };
          questoes?: { total: number; ok: boolean; esperado: number };
          geral?: { total: number; ok: boolean; esperado: number };
          porQuestao?: Record<string, { total: number; esperado: number; desvio: number; ok: boolean }>;
        };
        grupos?: {
          total: number;
          peca: { total: number; ids: string[] };
          questoes: { total: number; ids: string[] };
          porVariant?: Record<string, string[]>;
        };
    };
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const files = form.getAll("files") as File[];
    const withEmbeddings = String(form.get("withEmbeddings") || "false").toLowerCase() === "true";
    const model = form.get("model")?.toString();

    if (!files.length) {
      return NextResponse.json({ 
        success: false,
        results: [{ fileName: "unknown", error: "Nenhum arquivo PDF enviado" }],
        summary: { total: 0, successful: 0, failed: 1 }
      }, { status: 400 });
    }

    console.log(`[OAB-EVAL::BATCH] Processando ${files.length} arquivos PDF`);

    const results: BatchUploadResult["results"] = [];
    let successful = 0;
    let failed = 0;

    // Processar cada arquivo individualmente
    for (const file of files) {
      try {
        console.log(`[OAB-EVAL::BATCH] Processando arquivo: ${file.name}`);

        if (!(file instanceof File)) {
          results.push({
            fileName: "unknown",
            error: "Arquivo inválido"
          });
          failed++;
          continue;
        }

        if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
          results.push({
            fileName: file.name,
            error: "Apenas arquivos PDF são aceitos no modo batch"
          });
          failed++;
          continue;
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        let payload = await buildRubricFromPdf(buffer, { fileName: file.name, model });

        if (withEmbeddings) {
          const { createEmbeddingLarge } = await import("@/lib/oab-eval/openai-client");
          // Gera embeddings LARGE para cada item (não persiste)
          const itens = [] as any[];
          for (const it of payload.itens) {
            const emb = await createEmbeddingLarge(it.embedding_text || "");
            itens.push({ ...it, _embL: emb });
          }
          payload = { ...payload, itens } as typeof payload;
        }

        const record = await createRubric({ payload });

        // Recalcular verificação de pontuação
        const { verificarPontuacao } = await import("@/lib/oab/gabarito-parser-deterministico");
        const verificacao = verificarPontuacao(payload.itens as any);
        const grupos = (payload as any).grupos ?? [];
        const gruposPeca = grupos.filter((g: any) => g.questao === 'PEÇA');
        const gruposQuestoes = grupos.filter((g: any) => g.questao !== 'PEÇA');
        const gruposPorVariant = grupos.reduce((acc: Record<string, string[]>, grupo: any) => {
          const key = `${grupo.questao}::${grupo.variant_family || 'default'}::${grupo.variant_key || 'default'}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(grupo.id);
          return acc;
        }, {} as Record<string, string[]>);

        // Calcular resumo de pontuação por questão utilizando a verificação final (limita aos máximos esperados)
        const pontuacaoPorQuestao: Record<string, { total: number; esperado: number; desvio: number; ok: boolean }> = {
          PEÇA: {
            total: verificacao.peca.total,
            esperado: verificacao.peca.esperado,
            desvio: verificacao.peca.desvio,
            ok: verificacao.peca.ok,
          },
          ...verificacao.questoes.porQuestao,
        };

        const stats = {
          itens: payload.itens?.length ?? 0,
          withEmbeddings,
          embeddingModel: withEmbeddings ? "text-embedding-3-large" : null,
          metaResumo: {
            exam: payload.meta?.exam,
            area: payload.meta?.area,
            data_aplicacao: payload.meta?.data_aplicacao,
            fonte: payload.meta?.fonte,
            versao_schema: payload.meta?.versao_schema,
          },
          pontuacao: {
            peca: { total: verificacao.peca.total, ok: verificacao.peca.ok, esperado: verificacao.peca.esperado },
            questoes: { total: verificacao.questoes.total, ok: verificacao.questoes.ok, esperado: verificacao.questoes.esperado },
            geral: { total: verificacao.geral.total, ok: verificacao.geral.ok, esperado: verificacao.geral.esperado },
            porQuestao: pontuacaoPorQuestao,
          },
          grupos: {
            total: grupos.length,
            peca: {
              total: gruposPeca.length,
              ids: gruposPeca.map((g: any) => g.id),
            },
            questoes: {
              total: gruposQuestoes.length,
              ids: gruposQuestoes.map((g: any) => g.id),
            },
            porVariant: gruposPorVariant,
          },
        };

        results.push({
          fileName: file.name,
          rubricId: record.id,
          structured: payload,
          stats,
        });

        successful++;

        // Log detalhado com tabela de pontuação
        console.log(`[OAB-EVAL::BATCH] ✅ Sucesso para ${file.name}`);
        console.log(`[OAB-EVAL::BATCH]   📋 Rubric ID: ${record.id}`);
        console.log(`[OAB-EVAL::BATCH]   📊 Itens: ${stats.itens}`);
        console.log(`[OAB-EVAL::BATCH]   📚 Área: ${stats.metaResumo.area}`);
        console.log(`[OAB-EVAL::BATCH]   📅 Aplicação: ${stats.metaResumo.data_aplicacao}`);
        const resumoPeca = stats.grupos.peca.ids.join(', ');
        const resumoQuestoes = stats.grupos.questoes.ids.join(', ');
        console.log(`[OAB-EVAL::BATCH]   🧩 Grupos (PEÇA): ${stats.grupos.peca.total} -> ${resumoPeca}`);
        console.log(`[OAB-EVAL::BATCH]   🧩 Grupos (QUESTÕES): ${stats.grupos.questoes.total} -> ${resumoQuestoes}`);
        if (stats.grupos.porVariant) {
          Object.entries(stats.grupos.porVariant).forEach(([variantKey, ids]) => {
            const idsArray = Array.isArray(ids) ? ids : [];
            console.log(`[OAB-EVAL::BATCH]     • Variante ${variantKey}: ${idsArray.length} -> ${idsArray.join(', ')}`);
          });
        }
        console.log(`[OAB-EVAL::BATCH]   🎯 Pontuação:`);
        console.log(`[OAB-EVAL::BATCH]      PEÇA: ${stats.pontuacao.peca?.total || 0}/${stats.pontuacao.peca?.esperado || 5} ${stats.pontuacao.peca?.ok ? '✅' : '❌'}`);
        console.log(`[OAB-EVAL::BATCH]      QUESTÕES: ${stats.pontuacao.questoes?.total || 0}/${stats.pontuacao.questoes?.esperado || 5} ${stats.pontuacao.questoes?.ok ? '✅' : '❌'}`);
        console.log(`[OAB-EVAL::BATCH]      GERAL: ${stats.pontuacao.geral?.total || 0}/${stats.pontuacao.geral?.esperado || 10} ${stats.pontuacao.geral?.ok ? '✅' : '❌'}`);
        console.log(`[OAB-EVAL::BATCH]   📈 Por Questão:`);
        Object.entries(pontuacaoPorQuestao).forEach(([label, dados]) => {
          const total = dados.total.toFixed(2);
          const esperado = dados.esperado.toFixed(2);
          const delta = dados.desvio >= 0 ? `+${dados.desvio.toFixed(2)}` : dados.desvio.toFixed(2);
          console.log(`[OAB-EVAL::BATCH]      ${label}: ${total}/${esperado} ${dados.ok ? '✅' : '❌'} (Δ${delta})`);
        });
        
      } catch (error) {
        console.error(`[OAB-EVAL::BATCH] Erro para ${file.name}:`, error);
        results.push({
          fileName: file.name,
          error: (error as Error).message || "Erro ao processar arquivo"
        });
        failed++;
      }
    }

    const responsePayload: BatchUploadResult = {
      success: successful > 0,
      results,
      summary: {
        total: files.length,
        successful,
        failed
      }
    };

    // Log tabela resumo final
    console.log(`\n${'='.repeat(110)}`);
    console.log(`[OAB-EVAL::BATCH] 📊 TABELA RESUMO FINAL - ${files.length} PDFs processados`);
    console.log(`${'='.repeat(110)}`);
    console.log(`┌${'─'.repeat(35)}┬${'─'.repeat(12)}┬${'─'.repeat(10)}┬${'─'.repeat(12)}┬${'─'.repeat(10)}┬${'─'.repeat(10)}┬${'─'.repeat(10)}┐`);
    console.log(`│ ${'PDF'.padEnd(33)} │ ${'RUBRIC_ID'.padEnd(10)} │ ${'ITENS'.padEnd(8)} │ ${'PEÇA'.padEnd(10)} │ ${'QUESTÕES'.padEnd(8)} │ ${'GERAL'.padEnd(8)} │ ${'STATUS'.padEnd(8)} │`);
    console.log(`├${'─'.repeat(35)}┼${'─'.repeat(12)}┼${'─'.repeat(10)}┼${'─'.repeat(12)}┼${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(10)}┤`);

    results.forEach(r => {
      const fileName = r.fileName.replace('.pdf', '').substring(0, 33).padEnd(33);
      const rubricId = r.rubricId ? r.rubricId.substring(0, 10).padEnd(10) : 'N/A'.padEnd(10);
      const itens = r.stats?.itens?.toString().padEnd(8) || 'N/A'.padEnd(8);
      const peca = r.stats?.pontuacao?.peca ? `${r.stats.pontuacao.peca.total || 0}/5`.padEnd(10) : 'N/A'.padEnd(10);
      const questoes = r.stats?.pontuacao?.questoes ? `${r.stats.pontuacao.questoes.total || 0}/5`.padEnd(8) : 'N/A'.padEnd(8);
      const geral = r.stats?.pontuacao?.geral ? `${r.stats.pontuacao.geral.total || 0}/10`.padEnd(8) : 'N/A'.padEnd(8);
      const status = r.error ? '❌ ERRO'.padEnd(8) : (r.stats?.pontuacao?.geral?.ok ? '✅ OK'.padEnd(8) : '⚠️ WARN'.padEnd(8));
      console.log(`│ ${fileName} │ ${rubricId} │ ${itens} │ ${peca} │ ${questoes} │ ${geral} │ ${status} │`);
    });

    console.log(`└${'─'.repeat(35)}┴${'─'.repeat(12)}┴${'─'.repeat(10)}┴${'─'.repeat(12)}┴${'─'.repeat(10)}┴${'─'.repeat(10)}┴${'─'.repeat(10)}┘`);
    console.log(`\n[OAB-EVAL::BATCH] 📈 Resumo: ${successful}/${files.length} sucessos (${(successful/files.length*100).toFixed(1)}%), ${failed}/${files.length} falhas (${(failed/files.length*100).toFixed(1)}%)`);
    console.log(`${'='.repeat(110)}\n`);

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("[OAB-EVAL::BATCH] Erro geral:", error);
    return NextResponse.json({ 
      success: false,
      results: [{ fileName: "unknown", error: (error as Error).message || "Falha ao processar PDFs em batch" }],
      summary: { total: 0, successful: 0, failed: 1 }
    }, { status: 400 });
  }
}
