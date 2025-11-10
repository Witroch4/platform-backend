import { NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
import { optimizeMirrorPayload, estimateTokenSavings } from '@/lib/oab-eval/mirror-formatter';
import type { StudentMirrorPayload } from '@/lib/oab-eval/types';

const prisma = getPrismaInstance();

/**
 * Handler da rota POST para enviar lead para análise de prova.
 */
export async function POST(req: Request) {
  try {
    console.log("[Enviar Análise] Recebendo requisição POST");
    const body = await req.json();
    console.log("[Enviar Análise] Dados recebidos:", body);

    // Aceitar tanto leadId quanto leadID
    const leadId = body.leadId || body.leadID;
    const sourceId = body.sourceId;

    if (!leadId) {
      console.error("[Enviar Análise] leadId não fornecido");
      return NextResponse.json(
        { error: "leadId é obrigatório" },
        { status: 400 }
      );
    }

    console.log("[Enviar Análise] Processando lead:", leadId);

    // Buscar dados do lead no banco
    const lead = await prisma.leadOabData.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        nomeReal: true,
        arquivos: true,
        pdfUnificado: true,
        leadUrl: true,
        concluido: true,
        fezRecurso: true,
        provaManuscrita: true,
        textoDOEspelho: true,
        espelhoCorrecao: true,
        lead: {
          select: {
            name: true,
            phone: true,
            sourceIdentifier: true
          }
        }
      }
    });

    if (!lead) {
      console.error("[Enviar Análise] Lead não encontrado:", leadId);
      return NextResponse.json(
        { error: "Lead não encontrado" },
        { status: 404 }
      );
    }

    console.log("[Enviar Análise] Lead encontrado:", {
      id: lead.id,
      name: lead.lead?.name,
      temManuscrito: !!lead.provaManuscrita,
      temEspelho: !!(lead.textoDOEspelho || lead.espelhoCorrecao)
    });

    // ⭐ OTIMIZAÇÃO: Processar espelho se existir
    let espelhoOtimizado = lead.textoDOEspelho;
    if (lead.textoDOEspelho && typeof lead.textoDOEspelho === 'string') {
      try {
        const espelhoParsed = JSON.parse(lead.textoDOEspelho);

        // DEBUG: Log a estrutura do espelhoParsed para diagnosticar problema
        console.log("[Enviar Análise] 🔍 DEBUG - Estrutura do espelhoParsed:");
        console.log(`[Enviar Análise]    Tem 'meta'?: ${!!espelhoParsed?.meta}`);
        console.log(`[Enviar Análise]    Tem 'aluno'?: ${!!espelhoParsed?.aluno}`);
        console.log(`[Enviar Análise]    Tem 'itens'?: ${!!espelhoParsed?.itens}`);
        console.log(`[Enviar Análise]    Tem 'totais'?: ${!!espelhoParsed?.totais}`);
        console.log("[Enviar Análise]    Chaves principais:", Object.keys(espelhoParsed || {}).join(", "));

        if (espelhoParsed?.meta) {
          console.log("[Enviar Análise]    meta.aluno:", espelhoParsed.meta?.aluno);
          console.log("[Enviar Análise]    meta.notaFinal:", espelhoParsed.meta?.notaFinal);
        }

        if (espelhoParsed?.aluno) {
          console.log("[Enviar Análise]    aluno.nome:", espelhoParsed.aluno?.nome);
          console.log("[Enviar Análise]    aluno.inscricao:", espelhoParsed.aluno?.inscricao);
        }

        if (espelhoParsed?.itens) {
          console.log(`[Enviar Análise]    itens.length: ${espelhoParsed.itens.length}`);
        }

        // Verificar se é um StudentMirrorPayload válido
        if (espelhoParsed && espelhoParsed.meta && espelhoParsed.aluno && espelhoParsed.itens) {
          console.log("[Enviar Análise] ✅ Estrutura válida detectada, iniciando otimização");
          const originalJson = JSON.stringify(espelhoParsed);
          const originalSize = originalJson.length;

          try {
            // Otimizar removendo campos desnecessários
            const espelhoOtimizadoObj = optimizeMirrorPayload(espelhoParsed as StudentMirrorPayload);
            const optimizedJson = JSON.stringify(espelhoOtimizadoObj);
            const optimizedSize = optimizedJson.length;

            // Calcular economia
            const savings = estimateTokenSavings(originalJson, optimizedJson);

            console.log("[Enviar Análise] 💾 Otimização de espelho:");
            console.log(`[Enviar Análise]    Original: ${savings.original} bytes`);
            console.log(`[Enviar Análise]    Otimizado: ${savings.optimized} bytes`);
            console.log(`[Enviar Análise]    Economia: ${savings.savings}`);

            // Usar versão otimizada
            espelhoOtimizado = JSON.stringify(espelhoOtimizadoObj);
            console.log("[Enviar Análise] ✅ Espelho otimizado com sucesso");
          } catch (optimizeError: any) {
            console.warn("[Enviar Análise] ⚠️ Erro ao otimizar espelho, usando original:", optimizeError.message);
            // Continua com original
          }
        } else {
          console.warn("[Enviar Análise] ⚠️ Estrutura inválida - espelhoParsed não contém meta/aluno/itens obrigatórios");
          console.warn("[Enviar Análise] ⚠️ Enviando espelho completo sem otimização como fallback");
        }
      } catch (parseError) {
        // Se não for JSON válido, continua com original
        console.log("[Enviar Análise] ℹ️ textoDOEspelho não é JSON válido, enviando como está");
      }
    }

    // Preparar payload para o sistema externo
    const payload = {
      leadID: lead.id,
      nome: lead.nomeReal || lead.lead?.name || "Lead sem nome",
      telefone: lead.lead?.phone,
      analise: true, // Flag para indicar que é análise
      arquivos: lead.arquivos?.map((a: any) => ({
        id: a.id,
        url: a.dataUrl,
        tipo: a.fileType,
        nome: a.fileType
      })) || [],
      arquivos_pdf: lead.pdfUnificado ? [{
        id: lead.id,
        url: lead.pdfUnificado,
        nome: "PDF Unificado"
      }] : [],
      // Incluir dados do manuscrito se existir
      textoManuscrito: lead.provaManuscrita || "",
      // Incluir dados do espelho otimizado se existir
      textoEspelho: espelhoOtimizado || "",
      ...(lead.espelhoCorrecao && {
        arquivos_imagens_espelho: JSON.parse(lead.espelhoCorrecao).map((url: string, index: number) => ({
          id: `${lead.id}-espelho-${index}`,
          url: url,
          nome: `Espelho ${index + 1}`
        }))
      }),
      metadata: {
        leadUrl: lead.leadUrl,
        sourceId: lead.lead?.sourceIdentifier || sourceId,
        concluido: lead.concluido,
        fezRecurso: lead.fezRecurso
      }
    };

    // Enviar para o sistema externo
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error("URL do webhook não configurada no ambiente");
    }

    console.log("[Enviar Análise] Enviando para webhook:", webhookUrl);
    
    // Log limitado do payload
    const limitedPayloadLog = {
      leadID: payload.leadID,
      nome: payload.nome,
      telefone: payload.telefone,
      analise: payload.analise,
      temArquivos: payload.arquivos?.length || 0,
      temPDF: !!payload.arquivos_pdf?.length,
      temManuscrito: !!payload.textoManuscrito,
      temEspelho: !!payload.textoEspelho,
      temImagensEspelho: !!payload.arquivos_imagens_espelho?.length
    };
    console.log("[Enviar Análise] Payload resumido:", JSON.stringify(limitedPayloadLog, null, 2));

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Erro ao enviar análise");
    }

    console.log("[Enviar Análise] Enviado com sucesso para o sistema externo");

    // Marcar o lead como aguardando análise
    await prisma.leadOabData.update({
      where: { id: leadId },
      data: {
        aguardandoAnalise: true
      }
    });

    console.log("[Enviar Análise] Lead marcado como aguardando análise");

    return NextResponse.json({ 
      success: true,
      message: "Lead enviado para análise com sucesso"
    });
  } catch (error: any) {
    console.error("[Enviar Análise] Erro ao enviar solicitação:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
