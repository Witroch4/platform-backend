import { NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
import { getOabEvalConfig } from '@/lib/config';
import { enqueueTranscription } from '@/lib/oab-eval/transcription-queue';
import { enqueueMirrorGeneration } from '@/lib/oab-eval/mirror-queue';

const prisma = getPrismaInstance();
const { agentelocal: USE_LOCAL_TRANSCRIBER, agentelocal_espelho: USE_LOCAL_MIRROR_AGENT } = getOabEvalConfig();

interface IncomingManuscriptImage {
  id?: string;
  url?: string;
  dataUrl?: string;
  data_url?: string;
  nome?: string;
  page?: number;
}

interface PreparedManuscriptImage {
  id: string;
  url: string;
  nome?: string;
  page?: number;
}

/**
 * Handler da rota POST para enviar manuscrito, espelho ou prova para processamento.
 * Versão simplificada que marca o manuscrito como processado imediatamente.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    console.log("[Enviar Documento] Recebendo requisição POST");
    
    // Obter o payload completo
    const payload = await request.json();
    
    // Log limitado dos dados recebidos
    const limitedLog = {
      leadID: payload.leadID,
      espelhoBibliotecaId: payload.espelhoBibliotecaId,
      telefone: payload.telefone,
      manuscrito: payload.manuscrito,
      espelho: payload.espelho,
      prova: payload.prova,
      espelhoparabiblioteca: payload.espelhoparabiblioteca,
      temArquivos: payload.arquivos?.length || 0,
      temTextoDAprova: payload.textoDAprova?.length || 0
    };
    console.log("[Enviar Documento] Dados recebidos (resumo):", JSON.stringify(limitedLog, null, 2));
    
    console.log("[Enviar Documento] leadID fornecido:", payload.leadID);
    console.log("[Enviar Documento] espelhoBibliotecaId fornecido:", payload.espelhoBibliotecaId);
    console.log("[Enviar Documento] telefone fornecido:", payload.telefone);
    
    // Determinar o tipo de documento
    const isManuscrito = payload.manuscrito === true;
    const isEspelho = payload.espelho === true || payload.espelhoconsultoriafase2 === true || payload.espelhoparabiblioteca === true;
    const isProva = payload.prova === true;
    const isEspelhoBiblioteca = payload.espelhoparabiblioteca === true;
    const isRecurso = payload.recurso === true;
    
    // Obter o tipo do documento para logs
    const docType = isManuscrito ? 'Manuscrito' : isEspelhoBiblioteca ? 'Espelho para Biblioteca' : isEspelho ? 'Espelho' : isProva ? 'Prova' : isRecurso ? 'Recurso' : 'Documento';
    
    // Atualizar o lead para o estado apropriado (apenas se não for espelho para biblioteca)
    const leadId = payload.leadID;
    let resolvedLeadId: string | null = leadId ?? null;
    
    // Declarar variável do espelho padrão fora do bloco
    let espelhoPadraoTexto = null;
    let espelhoPadraoId: string | undefined = undefined;
    
    // Se for espelho para biblioteca ou recurso, não atualizar lead específico
    if (isEspelhoBiblioteca) {
      console.log("[Enviar Espelho para Biblioteca] Espelho destinado à biblioteca geral, não atualizando lead específico");
      console.log("[Enviar Espelho para Biblioteca] ID da biblioteca:", payload.espelhoBibliotecaId);
    } else if (isRecurso) {
      console.log("[Enviar Recurso] Recurso sendo processado, não atualizando estado do lead");
      console.log("[Enviar Recurso] Lead ID:", leadId);
      console.log("[Enviar Recurso] Recurso finalizado:", payload.RecursoFinalizado);
    } else if (leadId) {
      // Primeiro, verificar se o lead existe
      let lead = await prisma.leadOabData.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          especialidade: true,
          espelhoPadraoId: true,
          lead: {
            select: {
              sourceIdentifier: true,
              phone: true,
            }
          },
          espelhoBibliotecaId: true
        }
      });
      
      // Se não encontrar o lead pelo ID, tentar encontrar de outras formas
      if (!lead) {
        console.log("[Enviar Documento] Lead não encontrado pelo ID fornecido, tentando outras formas de busca");
        
        // Tentar buscar pelo sourceId (telefone)
        if (payload.telefone) {
          lead = await prisma.leadOabData.findFirst({
            where: { lead: { phone: payload.telefone } },
            select: {
              id: true,
              especialidade: true,
          espelhoPadraoId: true,
              lead: {
                select: {
                  sourceIdentifier: true,
                  phone: true,
                }
              },
              espelhoBibliotecaId: true
            }
          });
          if (lead) {
            console.log("[Enviar Documento] Lead encontrado pelo telefone:", lead.id);
          }
        }
        
        // Se ainda não encontrou, tentar buscar pelo espelhoBibliotecaId
        if (!lead && payload.espelhoBibliotecaId) {
          lead = await prisma.leadOabData.findFirst({
            where: { espelhoBibliotecaId: payload.espelhoBibliotecaId },
            select: {
              id: true,
              especialidade: true,
          espelhoPadraoId: true,
              lead: {
                select: {
                  sourceIdentifier: true,
                  phone: true,
                }
              },
              espelhoBibliotecaId: true
            }
          });
          if (lead) {
            console.log("[Enviar Documento] Lead encontrado pelo espelhoBibliotecaId:", lead.id);
          }
        }
        
        // Se ainda não encontrou, verificar se o leadID fornecido é na verdade um espelhoBibliotecaId
        if (!lead) {
          lead = await prisma.leadOabData.findFirst({
            where: { espelhoBibliotecaId: leadId },
            select: {
              id: true,
              especialidade: true,
          espelhoPadraoId: true,
              lead: {
                select: {
                  sourceIdentifier: true,
                  phone: true,
                }
              },
              espelhoBibliotecaId: true
            }
          });
          if (lead) {
            console.log("[Enviar Documento] Lead encontrado usando leadID fornecido como espelhoBibliotecaId:", lead.id);
          }
        }
        
        if (!lead) {
          console.error("[Enviar Documento] Lead não encontrado após todas as tentativas de busca");
          throw new Error("Lead não encontrado");
        }
      }
      
      resolvedLeadId = lead.id;

      // IMPORTANTE: Para agente local, espelhoPadraoId vem do frontend OU do banco (se já foi selecionado)
      // Para fluxo legado N8N, busca automaticamente por especialidade
      espelhoPadraoId = payload.espelhoPadraoId;

      // Se não veio no payload, buscar do banco (pode ter sido selecionado antes)
      if (!espelhoPadraoId && lead.espelhoPadraoId) {
        espelhoPadraoId = lead.espelhoPadraoId;
        console.log(`[Enviar Documento] 🔍 espelhoPadraoId encontrado no banco: ${espelhoPadraoId}`);
      }

      if (espelhoPadraoId) {
        // Frontend enviou ID do espelho selecionado pelo usuário
        console.log(`[Enviar Documento] Usando espelho padrão selecionado: ${espelhoPadraoId}`);

        // Tentar buscar em OabRubric (agente local) primeiro
        const oabRubric = await prisma.oabRubric.findUnique({
          where: { id: espelhoPadraoId },
          select: {
            id: true,
            schema: true,
            meta: true,
            exam: true,
            area: true
          }
        });

        if (oabRubric) {
          console.log(`[Enviar Documento] ✅ OabRubric encontrado (agente local): ${oabRubric.exam} - ${(oabRubric.meta as any)?.area || oabRubric.area}`);
          // Para OabRubric, não há textoMarkdown - será gerado pelo agente
          espelhoPadraoTexto = null; // Agente local gerará dinamicamente
        } else {
          // Fallback: tentar buscar em EspelhoPadrao (legado)
          const espelhoPadrao = await prisma.espelhoPadrao.findUnique({
            where: { id: espelhoPadraoId },
            select: {
              id: true,
              textoMarkdown: true,
              nome: true,
              especialidade: true
            }
          });

          if (espelhoPadrao?.textoMarkdown) {
            espelhoPadraoTexto = espelhoPadrao.textoMarkdown;
            console.log(`[Enviar Documento] ✅ Espelho padrão encontrado (legado): ${espelhoPadrao.nome} (${espelhoPadrao.especialidade})`);
          } else {
            console.warn(`[Enviar Documento] ⚠️ Espelho padrão ${espelhoPadraoId} não encontrado em OabRubric nem EspelhoPadrao`);
          }
        }
      } else if (lead.especialidade && (isEspelho || isManuscrito)) {
        // Fallback: buscar automaticamente por especialidade (comportamento antigo)
        console.log(`[Enviar Documento] Buscando espelho padrão automaticamente para: ${lead.especialidade}`);

        const espelhoPadrao = await prisma.espelhoPadrao.findFirst({
          where: {
            especialidade: lead.especialidade as any, // Cast porque especialidade agora é String, mas EspelhoPadrao ainda usa enum
            isAtivo: true,
            processado: true
          },
          select: {
            id: true,
            textoMarkdown: true,
            nome: true
          },
          orderBy: { updatedAt: 'desc' }  // Pega o mais recente
        });

        if (espelhoPadrao?.textoMarkdown) {
          espelhoPadraoTexto = espelhoPadrao.textoMarkdown;
          console.log(`[Enviar Documento] ✅ Espelho padrão encontrado (auto): ${espelhoPadrao.nome}`);
        } else {
          console.log(`[Enviar Documento] ⚠️ Nenhum espelho padrão ativo para: ${lead.especialidade}`);
        }
      }
      
      if (isManuscrito && !isEspelho && !isProva) {
        if (!resolvedLeadId) {
          throw new Error("Lead não identificado para atualização de manuscrito");
        }
        // Marcar manuscrito como AGUARDANDO processamento
        await prisma.leadOabData.update({
          where: { id: resolvedLeadId },
          data: {
            manuscritoProcessado: false,  // NÃO processado ainda
            aguardandoManuscrito: true    // Aguardando processamento
          }
        });
        console.log("[Enviar Manuscrito] Lead marcado como aguardando processamento");
      } else if (isEspelho && !isManuscrito && !isProva) {
        if (!resolvedLeadId) {
          throw new Error("Lead não identificado para atualização de espelho");
        }
        // Marcar espelho como AGUARDANDO processamento
        await prisma.leadOabData.update({
          where: { id: resolvedLeadId },
          data: {
            espelhoProcessado: false,     // NÃO processado ainda
            aguardandoEspelho: true       // Aguardando processamento
          }
        });
        console.log("[Enviar Espelho] Lead marcado como aguardando processamento");
      }
    }
    
    // Modificar o payload para incluir o texto do espelho padrão se disponível
    const payloadFinal = { ...payload };
    
    // Adicionar texto do espelho padrão se disponível
    if (espelhoPadraoTexto && (isEspelho || isManuscrito)) {
      payloadFinal.espelhoPadraoTexto = espelhoPadraoTexto.trim();
      console.log(`[Enviar ${docType}] ✅ Texto do espelho padrão incluído no payload`);
    }
    
    const shouldUseLocalManuscritoAgent =
      USE_LOCAL_TRANSCRIBER && isManuscrito && !isEspelho && !isProva;

    const shouldUseLocalMirrorAgent =
      USE_LOCAL_MIRROR_AGENT && isEspelho && !isManuscrito && !isProva;

    if (shouldUseLocalManuscritoAgent) {
      if (!resolvedLeadId) {
        throw new Error("Lead não identificado para processamento local do manuscrito");
      }

      const imagensManuscrito: IncomingManuscriptImage[] = Array.isArray(
        payloadFinal.arquivos_imagens_manuscrito,
      )
        ? (payloadFinal.arquivos_imagens_manuscrito as IncomingManuscriptImage[])
        : [];

      if (!imagensManuscrito.length) {
        console.error("[Enviar Manuscrito][Local] Nenhuma imagem fornecida para digitação");
        throw new Error("Nenhuma imagem do manuscrito foi fornecida");
      }

      const imagensPreparadas: PreparedManuscriptImage[] = imagensManuscrito
        .map((imagem, index): PreparedManuscriptImage => ({
          id: String(imagem.id ?? `${resolvedLeadId}-manuscrito-${index}`),
          url: imagem.url ?? imagem.dataUrl ?? imagem.data_url ?? "",
          nome: imagem.nome ?? `Manuscrito ${index + 1}`,
          page: imagem.page ?? index + 1,
        }))
        .filter((imagem): imagem is PreparedManuscriptImage => Boolean(imagem.url));

      if (!imagensPreparadas.length) {
        console.error("[Enviar Manuscrito][Local] Todas as imagens recebidas estão sem URL válida");
        throw new Error("Imagens do manuscrito sem URL válida");
      }

      console.log(
        `[Enviar Manuscrito][Queue] Enfileirando digitação de ${imagensPreparadas.length} imagens (lead ${resolvedLeadId})`,
      );

      // Extrair apenas URLs para enfileirar
      const imageUrls = imagensPreparadas.map(img => img.url);

      // Enfileirar na transcription queue (retorna 202 imediatamente)
      const job = await enqueueTranscription({
        leadID: resolvedLeadId,
        images: imageUrls,
        telefone: payload.telefone,
        nome: payload.nome,
        userId: payload.userId || 'system',
        priority: payload.priority || 5,
      });

      console.log(
        `[Enviar Manuscrito][Queue] Job ${job.id} enfileirado com sucesso`,
      );

      return NextResponse.json({
        success: true,
        message: `Manuscrito adicionado à fila de digitação`,
        mode: "queued",
        jobId: job.id,
        leadId: resolvedLeadId,
        totalPages: imagensPreparadas.length,
      }, { status: 202 }); // 202 Accepted (processamento assíncrono)
    }

    // Processamento local de espelho
    if (shouldUseLocalMirrorAgent) {
      if (!resolvedLeadId) {
        throw new Error("Lead não identificado para processamento local do espelho");
      }

      // Buscar especialidade do lead
      const leadData = await prisma.leadOabData.findUnique({
        where: { id: resolvedLeadId },
        select: { especialidade: true }
      });

      if (!leadData?.especialidade) {
        throw new Error("Lead sem especialidade definida. Defina a especialidade antes de processar o espelho.");
      }

      const imagensEspelho: IncomingManuscriptImage[] = Array.isArray(
        payloadFinal.arquivos_imagens_espelho,
      )
        ? (payloadFinal.arquivos_imagens_espelho as IncomingManuscriptImage[])
        : Array.isArray(payloadFinal.arquivos)
          ? (payloadFinal.arquivos as IncomingManuscriptImage[])
          : [];

      if (!imagensEspelho.length) {
        console.error("[Enviar Espelho][Local] Nenhuma imagem fornecida para processamento");
        throw new Error("Nenhuma imagem do espelho foi fornecida");
      }

      const imagensPreparadas = imagensEspelho
        .map((imagem, index) => ({
          id: String(imagem.id ?? `${resolvedLeadId}-espelho-${index}`),
          url: imagem.url ?? imagem.dataUrl ?? imagem.data_url ?? "",
          nome: imagem.nome ?? `Espelho ${index + 1}`,
          page: index + 1,
        }))
        .filter((imagem) => Boolean(imagem.url));

      if (!imagensPreparadas.length) {
        console.error("[Enviar Espelho][Local] Todas as imagens recebidas estão sem URL válida");
        throw new Error("Imagens do espelho sem URL válida");
      }

      console.log(
        `[Enviar Espelho][Queue] Enfileirando geração de espelho de ${imagensPreparadas.length} imagens (lead ${resolvedLeadId}, especialidade: ${leadData.especialidade})`,
      );

      // Enfileirar na mirror queue (retorna 202 imediatamente)
      const job = await enqueueMirrorGeneration({
        leadId: resolvedLeadId,
        especialidade: leadData.especialidade,
        espelhoPadraoId: espelhoPadraoId || undefined, // ⭐ NOVO: ID do OabRubric selecionado
        images: imagensPreparadas,
        telefone: payload.telefone,
        nome: payload.nome,
        userId: payload.userId || 'system',
        priority: payload.priority || 2,
      });

      console.log(
        `[Enviar Espelho][Queue] Job ${job.id} enfileirado com sucesso`,
      );

      return NextResponse.json({
        success: true,
        message: `Espelho adicionado à fila de processamento`,
        mode: "queued",
        jobId: job.id,
        leadId: resolvedLeadId,
        totalImages: imagensPreparadas.length,
        especialidade: leadData.especialidade,
      }, { status: 202 }); // 202 Accepted (processamento assíncrono)
    }

    // Fallback para o fluxo legado (N8N)
    const webhookUrl = process.env.WEBHOOK_URL;

    if (!webhookUrl) {
      console.error("[Enviar Documento] URL do webhook não configurada no ambiente");
      throw new Error("URL do webhook não configurada");
    }

    // Enviar o payload para o sistema externo de forma assíncrona
    // (Não esperamos a resposta para não bloquear o fluxo)
    console.log(`[Enviar ${docType}] 📤 Enviando payload para processamento externo:`, webhookUrl);
    fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payloadFinal),
    })
      .then((response) => {
        if (!response.ok) {
          console.error(`[Enviar ${docType}] Erro na resposta do sistema externo:`, response.status);
        } else {
          console.log(`[Enviar ${docType}] Enviado com sucesso para o sistema externo`);
        }
      })
      .catch((error) => {
        console.error(`[Enviar ${docType}] Erro ao enviar para o sistema externo:`, error);
      });

    // Responder imediatamente ao cliente, independente do resultado do webhook
    return NextResponse.json({
      success: true,
      message: `${docType} processado com sucesso`,
      mode: "legacy-webhook",
    });

  } catch (error: any) {
    console.error("[Enviar Documento] Erro ao enviar:", error);
    return NextResponse.json(
      {
        error: error.message || "Erro interno ao enviar documento",
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; 
