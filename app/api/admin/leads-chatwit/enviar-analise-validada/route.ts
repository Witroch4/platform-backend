import { NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
const prisma = getPrismaInstance();

/**
 * Handler da rota POST para enviar análise validada para geração do PDF.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    console.log("[Enviar Análise Validada] Recebendo requisição POST");
    
    // Obter a URL do webhook do ambiente
    const webhookUrl = process.env.WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error("[Enviar Análise Validada] URL do webhook não configurada no ambiente");
      throw new Error("URL do webhook não configurada");
    }
    
    // Obter o payload completo
    const payload = await request.json();
    
    // Criar versão limitada para log
    const limitedPayload = limitAnalisePayloadForLog(payload);
    console.log("[Enviar Análise Validada] Dados recebidos:", JSON.stringify(limitedPayload, null, 2));
    
    // Verificar se o leadID foi fornecido
    const leadId = payload.leadID;
    
    if (!leadId) {
      console.error("[Enviar Análise Validada] leadID não fornecido");
      throw new Error("leadID não fornecido");
    }
    
    // Buscar o lead no banco de dados
    const lead = await prisma.leadOabData.findUnique({
      where: { id: leadId },
      include: {
        lead: {
          select: { phone: true, name: true }
        }
      }
    });
    
    if (!lead) {
      console.error("[Enviar Análise Validada] Lead não encontrado:", leadId);
      throw new Error("Lead não encontrado");
    }
    
    // Marcar o lead como análise validada
    await prisma.leadOabData.update({
      where: { id: leadId },
      data: {
        analiseValidada: true,
        // Atualizar o payload da análise preliminar, caso tenha sido editado
        analisePreliminar: payload.analiseData
      }
    });
    
    console.log("[Enviar Análise Validada] Lead marcado como análise validada");
    
    // Extrair os dados da análise preliminar
    const analiseData = payload.analiseData || {};
    
    // Detectar se é análise de simulado baseado na flag
    const isAnaliseSimulado = analiseData.analisesimuladovalidado === true;
    
    // Preparar o payload para envio com as flags requeridas e garantir que todos os campos do cabeçalho estejam presentes
    const requestPayload = {
      // Flags necessárias para o sistema externo
      leadID: leadId,
      telefone: lead.lead?.phone,
      
      // Flag correta baseada no tipo de análise
      ...(isAnaliseSimulado 
        ? { analisesimuladovalidado: true }
        : { analisevalidada: true }
      ),
      
      // Garantir que os campos do cabeçalho estejam explicitamente presentes
      exameDescricao: analiseData.exameDescricao || "",
      inscricao: analiseData.inscricao || "",
      nomeExaminando: analiseData.nomeExaminando || lead.nomeReal || lead.lead?.name || "",
      seccional: analiseData.seccional || "",
      areaJuridica: analiseData.areaJuridica || "",
      notaFinal: analiseData.notaFinal || "",
      situacao: analiseData.situacao || "",
      
      // Garantir que os outros dados da análise também estejam presentes
      pontosPeca: analiseData.pontosPeca || [],
      subtotalPeca: analiseData.subtotalPeca || "",
      pontosQuestoes: analiseData.pontosQuestoes || [],
      subtotalQuestoes: analiseData.subtotalQuestoes || "",
      conclusao: analiseData.conclusao || "",
      argumentacao: analiseData.argumentacao || [],
      
      // Incluir o restante dos dados da análise preliminar (exceto flags de controle)
      ...Object.fromEntries(
        Object.entries(analiseData).filter(([key]) => 
          !['analisesimuladovalidado', 'analiseValidada'].includes(key)
        )
      )
    };
    
    // Criar versão limitada do payload final para log
    const limitedRequestPayload = limitAnalisePayloadForLog(requestPayload);
    console.log("[Enviar Análise Validada] Payload final para envio:", JSON.stringify(limitedRequestPayload, null, 2));
    
    // Enviar para o sistema externo
    console.log("[Enviar Análise Validada] Enviando payload para processamento:", webhookUrl);
    
    fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    }).then(response => {
      if (!response.ok) {
        console.error("[Enviar Análise Validada] Erro na resposta do sistema externo:", response.status);
      } else {
        console.log("[Enviar Análise Validada] Enviado com sucesso para o sistema externo");
      }
    }).catch(error => {
      console.error("[Enviar Análise Validada] Erro ao enviar para o sistema externo:", error);
    });
    
    // Responder imediatamente ao cliente, independente do resultado do webhook
    return NextResponse.json({
      success: true,
      message: "Análise validada enviada com sucesso",
    });
    
  } catch (error: any) {
    console.error("[Enviar Análise Validada] Erro ao enviar solicitação:", error);
    return NextResponse.json(
      {
        error: error.message || "Erro interno ao enviar análise validada",
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Função para limitar o payload da análise no log
function limitAnalisePayloadForLog(payload: any) {
  if (typeof payload !== 'object' || payload === null) {
    return payload;
  }
  
  const limited: any = {
    leadID: payload.leadID,
    telefone: payload.telefone,
    nome: payload.nome,
    exameDescricao: payload.exameDescricao,
    inscricao: payload.inscricao,
    nomeExaminando: payload.nomeExaminando,
    seccional: payload.seccional,
    areaJuridica: payload.areaJuridica,
    notaFinal: payload.notaFinal,
    situacao: payload.situacao,
    subtotalPeca: payload.subtotalPeca,
    subtotalQuestoes: payload.subtotalQuestoes,
    conclusao: payload.conclusao ? payload.conclusao.substring(0, 100) + "..." : payload.conclusao,
    analisevalidada: payload.analisevalidada,
    analisesimuladovalidado: payload.analisesimuladovalidado
  };
  
  // Para pontosPeca, mostrar apenas a quantidade
  if (payload.pontosPeca) {
    limited.pontosPeca = `[${payload.pontosPeca.length} pontos]`;
  }
  
  // Para pontosQuestoes, mostrar apenas a quantidade
  if (payload.pontosQuestoes) {
    limited.pontosQuestoes = `[${payload.pontosQuestoes.length} questões]`;
  }
  
  // Para argumentacao, mostrar apenas a quantidade
  if (payload.argumentacao) {
    limited.argumentacao = `[${payload.argumentacao.length} argumentos]`;
  }
  
  // Para analiseData, aplicar limitação recursiva
  if (payload.analiseData) {
    limited.analiseData = limitAnalisePayloadForLog(payload.analiseData);
  }
  
  return limited;
} 