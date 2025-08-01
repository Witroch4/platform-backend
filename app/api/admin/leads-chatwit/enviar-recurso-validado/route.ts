import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Handler da rota POST para enviar recurso validado para geração do PDF.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    console.log("[Enviar Recurso Validado] Recebendo requisição POST");
    
    // Obter a URL do webhook do ambiente
    const webhookUrl = process.env.WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error("[Enviar Recurso Validado] URL do webhook não configurada no ambiente");
      throw new Error("URL do webhook não configurada");
    }
    
    // Obter o payload completo
    const payload = await request.json();
    console.log("[Enviar Recurso Validado] Dados recebidos:", JSON.stringify(payload, null, 2));
    
    // Verificar se o leadID foi fornecido
    const leadId = payload.leadID;
    
    if (!leadId) {
      console.error("[Enviar Recurso Validado] leadID não fornecido");
      throw new Error("leadID não fornecido");
    }
    
    // Buscar o lead no banco de dados
    const lead = await prisma.leadOabData.findUnique({
      where: { id: leadId },
      include: {
        lead: {
          select: {
            name: true,
            email: true,
            phone: true,
            sourceIdentifier: true
          }
        }
      }
    });
    
    if (!lead) {
      console.error("[Enviar Recurso Validado] Lead não encontrado:", leadId);
      throw new Error("Lead não encontrado");
    }
    
    // Marcar o lead como recurso validado
    const updateData: any = {
      recursoValidado: true,
      aguardandoRecurso: true, // Aguardando o processamento do recurso validado
    };

    // Atualizar o texto do recurso com a versão validada apenas se fornecido
    if (payload.textoRecurso) {
      updateData.recursoPreliminar = { textoRecurso: payload.textoRecurso };
    }

    await prisma.leadOabData.update({
      where: { id: leadId },
      data: updateData
    });
    
    console.log("[Enviar Recurso Validado] Lead marcado como recurso validado");
    
    // Preparar o payload para envio com as flags requeridas
    const requestPayload = {
      // Flags necessárias para o sistema externo
      leadID: leadId,
      telefone: lead.lead?.phone,
      RecursoFinalizado: true, // Flag principal do recurso
      recursoValidado: true,    // Flag para indicar que foi validado
      
      // Texto do recurso validado
      textoRecurso: payload.textoRecurso || '',
      
      // Dados do lead
      nome: lead.nomeReal || lead.lead?.name || "",
      email: lead.lead?.email || "",
      
      // Dados da análise preliminar (necessários para o recurso)
      analisePreliminar: lead.analisePreliminar || null,
      
      // Modelo de recurso se fornecido
      modeloRecurso: payload.modeloRecurso || null,
      
      // Metadados
      metadata: {
        leadUrl: lead.leadUrl,
        sourceId: lead.lead?.sourceIdentifier,
        consultoriaFase2: lead.consultoriaFase2,
        especialidade: lead.especialidade
      }
    };
    
    console.log("[Enviar Recurso Validado] Payload final para envio:", JSON.stringify(requestPayload, null, 2));
    
    // Enviar para o sistema externo
    console.log("[Enviar Recurso Validado] Enviando payload para processamento:", webhookUrl);
    
    fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    }).then(response => {
      if (!response.ok) {
        console.error("[Enviar Recurso Validado] Erro na resposta do sistema externo:", response.status);
      } else {
        console.log("[Enviar Recurso Validado] Enviado com sucesso para o sistema externo");
      }
    }).catch(error => {
      console.error("[Enviar Recurso Validado] Erro ao enviar para o sistema externo:", error);
    });
    
    // Responder imediatamente ao cliente, independente do resultado do webhook
    return NextResponse.json({
      success: true,
      message: "Recurso validado enviado com sucesso",
    });
    
  } catch (error: any) {
    console.error("[Enviar Recurso Validado] Erro ao enviar solicitação:", error);
    return NextResponse.json(
      {
        error: error.message || "Erro interno ao enviar recurso validado",
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; 