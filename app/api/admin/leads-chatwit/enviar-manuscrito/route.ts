import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Handler da rota POST para enviar manuscrito, espelho ou prova para processamento.
 * Versão simplificada que marca o manuscrito como processado imediatamente.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    console.log("[Enviar Documento] Recebendo requisição POST");
    
    // Obter a URL do webhook do ambiente
    const webhookUrl = process.env.WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error("[Enviar Documento] URL do webhook não configurada no ambiente");
      throw new Error("URL do webhook não configurada");
    }
    
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
    
    // Declarar variável do espelho padrão fora do bloco
    let espelhoPadraoTexto = null;
    
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
      
      const actualLeadId = lead.id;
      
      // Buscar espelho padrão se lead tiver especialidade definida
      if (lead.especialidade && (isEspelho || isManuscrito)) {
        console.log(`[Enviar Documento] Buscando espelho padrão para especialidade: ${lead.especialidade}`);
        
        const espelhoPadrao = await prisma.espelhoPadrao.findUnique({
          where: { 
            especialidade: lead.especialidade,
            isAtivo: true,
            processado: true
          },
          select: {
            id: true,
            textoMarkdown: true,
            nome: true
          }
        });
        
        if (espelhoPadrao?.textoMarkdown) {
          espelhoPadraoTexto = espelhoPadrao.textoMarkdown;
          console.log(`[Enviar Documento] ✅ Espelho padrão encontrado: ${espelhoPadrao.nome}`);
        } else {
          console.log(`[Enviar Documento] ⚠️ Espelho padrão não encontrado ou sem texto processado para especialidade: ${lead.especialidade}`);
        }
      }
      
      if (isManuscrito && !isEspelho && !isProva) {
        // Marcar manuscrito como AGUARDANDO processamento
        await prisma.leadOabData.update({
          where: { id: actualLeadId },
          data: {
            manuscritoProcessado: false,  // NÃO processado ainda
            aguardandoManuscrito: true    // Aguardando processamento
          }
        });
        console.log("[Enviar Manuscrito] Lead marcado como aguardando processamento");
      } else if (isEspelho && !isManuscrito && !isProva) {
        // Marcar espelho como AGUARDANDO processamento
        await prisma.leadOabData.update({
          where: { id: actualLeadId },
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
    
    // Enviar o payload para o sistema externo de forma assíncrona
    // (Não esperamos a resposta para não bloquear o fluxo)
    console.log(`[Enviar ${docType}] 📤 Enviando payload para processamento:`, webhookUrl);
    fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payloadFinal),
    }).then(response => {
      if (!response.ok) {
        console.error(`[Enviar ${docType}] Erro na resposta do sistema externo:`, response.status);
      } else {
        console.log(`[Enviar ${docType}] Enviado com sucesso para o sistema externo`);
      }
    }).catch(error => {
      console.error(`[Enviar ${docType}] Erro ao enviar para o sistema externo:`, error);
    });

    // Responder imediatamente ao cliente, independente do resultado do webhook
    return NextResponse.json({
      success: true,
      message: `${docType} processado com sucesso`,
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