import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Handler da rota POST para enviar manuscrito ou espelho para processamento.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    console.log("[Enviar Manuscrito/Espelho] Recebendo requisição POST");
    
    // Obter a URL do webhook do ambiente
    const webhookUrl = process.env.WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error("[Enviar Manuscrito/Espelho] URL do webhook não configurada no ambiente");
      throw new Error("URL do webhook não configurada");
    }
    
    // Obter o payload completo
    const payload = await request.json();
    console.log("[Enviar Manuscrito/Espelho] Dados recebidos:", JSON.stringify(payload, null, 2));
    
    // Determinar se é manuscrito ou espelho
    const isManuscrito = payload.manuscrito === true;
    const isEspelho = payload.espelho === true;
    
    // Atualizar o lead para o estado apropriado
    const leadId = payload.leadID;
    
    if (leadId) {
      if (isManuscrito && !isEspelho) { // Garantir que é apenas manuscrito, não espelho
        await prisma.leadOabData.update({
          where: { id: leadId },
          data: { aguardandoManuscrito: true }
        });
        console.log("[Enviar Manuscrito] Lead marcado como aguardando processamento");
      }
      // Não precisamos fazer nada especial para o espelho, já que o próprio cliente
      // atualiza o estado do espelhoCorrecao no banco de dados
    }
    
    // Enviar o payload para o sistema externo
    console.log(`[Enviar ${isEspelho ? 'Espelho' : 'Manuscrito'}] Enviando payload para processamento:`, webhookUrl);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: "Erro ao processar resposta" }));
      console.error(`[Enviar ${isEspelho ? 'Espelho' : 'Manuscrito'}] Erro na resposta do sistema externo:`, errorData);
      
      // Resetar aguardandoManuscrito para false em caso de erro (apenas para manuscrito)
      if (isManuscrito && !isEspelho && leadId) {
        await prisma.leadOabData.update({
          where: { id: leadId },
          data: { aguardandoManuscrito: false }
        }).catch(e => {
          console.error("[Enviar Manuscrito] Erro ao resetar estado do lead:", e);
        });
      }
      
      throw new Error(errorData.message || `Erro ao enviar ${isEspelho ? 'espelho' : 'manuscrito'} para processamento`);
    }

    console.log(`[Enviar ${isEspelho ? 'Espelho' : 'Manuscrito'}] Enviado com sucesso`);
    return NextResponse.json({
      success: true,
      message: `${isEspelho ? 'Espelho' : 'Manuscrito'} enviado para processamento`,
    });

  } catch (error: any) {
    console.error("[Enviar Manuscrito/Espelho] Erro ao enviar:", error);
    return NextResponse.json(
      {
        error: error.message || "Erro interno ao enviar manuscrito ou espelho",
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; 