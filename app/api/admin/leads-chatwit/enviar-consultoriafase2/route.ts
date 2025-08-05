import { NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
const prisma = getPrismaInstance();

/**
 * Handler da rota POST para enviar lead para consultoria fase 2.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    console.log("[Enviar Consultoria Fase 2] Recebendo requisição POST");
    
    // Obter a URL do webhook do ambiente
    const webhookUrl = process.env.WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error("[Enviar Consultoria Fase 2] URL do webhook não configurada no ambiente");
      throw new Error("URL do webhook não configurada");
    }
    
    // Obter o payload completo
    const payload = await request.json();
    console.log("[Enviar Consultoria Fase 2] Dados recebidos:", JSON.stringify(payload, null, 2));
    
    // Verificar se o leadID foi fornecido
    const leadId = payload.leadID;
    
    if (!leadId) {
      console.error("[Enviar Consultoria Fase 2] leadID não fornecido");
      throw new Error("leadID não fornecido");
    }
    
    // Buscar o lead no banco de dados
    const lead = await prisma.leadOabData.findUnique({
      where: { id: leadId },
      include: {
        usuarioChatwit: true,
        arquivos: true,
        lead: {
          select: {
            name: true,
            phone: true,
            sourceIdentifier: true,
            email: true
          }
        }
      }
    });
    
    if (!lead) {
      console.error("[Enviar Consultoria Fase 2] Lead não encontrado:", leadId);
      throw new Error("Lead não encontrado");
    }
    
    // Marcar o lead como aguardando análise
    await prisma.leadOabData.update({
      where: { id: leadId },
      data: { 
        aguardandoAnalise: true
      }
    });
    
    console.log("[Enviar Consultoria Fase 2] Lead marcado como aguardando análise");
    
    // Buscar espelho da biblioteca se foi selecionado
    let espelhoBiblioteca = null;
    if (lead.espelhoBibliotecaId) {
      console.log("[Enviar Consultoria Fase 2] Buscando espelho da biblioteca:", lead.espelhoBibliotecaId);
      espelhoBiblioteca = await prisma.espelhoBiblioteca.findUnique({
        where: { id: lead.espelhoBibliotecaId }
      });
      
      if (espelhoBiblioteca) {
        console.log("[Enviar Consultoria Fase 2] Espelho da biblioteca encontrado:", espelhoBiblioteca.nome);
      } else {
        console.log("[Enviar Consultoria Fase 2] Espelho da biblioteca não encontrado");
      }
    }
    
    // Formatar o texto do manuscrito e do espelho se existirem
    let textoManuscrito = "";
    if (lead.provaManuscrita) {
      if (typeof lead.provaManuscrita === 'string') {
        textoManuscrito = `Texto da Prova:\n${lead.provaManuscrita}`;
      } else if (Array.isArray(lead.provaManuscrita)) {
        // Caso seja um array de objetos com campo 'output'
        textoManuscrito = "Texto da Prova:\n" + lead.provaManuscrita
          .map((item: any) => typeof item === 'object' && item.output ? item.output : JSON.stringify(item))
          .join('\n\n---------------------------------\n\n');
      } else if (typeof lead.provaManuscrita === 'object') {
        textoManuscrito = `Texto da Prova:\n${JSON.stringify(lead.provaManuscrita, null, 2)}`;
      }
    }
    
    let textoEspelho = "";
    let imagensEspelho: string[] = [];
    
    // Priorizar espelho da biblioteca se existir
    if (espelhoBiblioteca) {
      // Usar texto do espelho da biblioteca
      if (espelhoBiblioteca.textoDOEspelho) {
        if (typeof espelhoBiblioteca.textoDOEspelho === 'string') {
          textoEspelho = `Espelho da Prova (Biblioteca):\n${espelhoBiblioteca.textoDOEspelho}`;
        } else if (Array.isArray(espelhoBiblioteca.textoDOEspelho)) {
          textoEspelho = "Espelho da Prova (Biblioteca):\n" + espelhoBiblioteca.textoDOEspelho
            .map((item: any) => typeof item === 'object' && item.output ? item.output : JSON.stringify(item))
            .join('\n\n---------------------------------\n\n');
        } else if (typeof espelhoBiblioteca.textoDOEspelho === 'object') {
          textoEspelho = `Espelho da Prova (Biblioteca):\n${JSON.stringify(espelhoBiblioteca.textoDOEspelho, null, 2)}`;
        }
      }
      
      // Usar imagens do espelho da biblioteca
      if (espelhoBiblioteca.espelhoCorrecao) {
        try {
          imagensEspelho = JSON.parse(espelhoBiblioteca.espelhoCorrecao);
        } catch (e) {
          console.error("[Enviar Consultoria Fase 2] Erro ao fazer parse das imagens do espelho da biblioteca:", e);
          imagensEspelho = [];
        }
      }
    } else if (lead.textoDOEspelho) {
      // Usar espelho individual do lead se não houver da biblioteca
      if (typeof lead.textoDOEspelho === 'string') {
        textoEspelho = `Espelho da Prova:\n${lead.textoDOEspelho}`;
      } else if (Array.isArray(lead.textoDOEspelho)) {
        // Caso seja um array de objetos com campo 'output'
        textoEspelho = "Espelho da Prova:\n" + lead.textoDOEspelho
          .map((item: any) => typeof item === 'object' && item.output ? item.output : JSON.stringify(item))
          .join('\n\n---------------------------------\n\n');
      } else if (typeof lead.textoDOEspelho === 'object') {
        textoEspelho = `Espelho da Prova:\n${JSON.stringify(lead.textoDOEspelho, null, 2)}`;
      }
      
      // Usar imagens do espelho individual
      if (lead.espelhoCorrecao) {
        try {
          imagensEspelho = JSON.parse(lead.espelhoCorrecao);
        } catch (e) {
          console.error("[Enviar Consultoria Fase 2] Erro ao fazer parse das imagens do espelho individual:", e);
          imagensEspelho = [];
        }
      }
    }
    
    // Preparar o payload para envio com a flag de análise de simulado
    const requestPayload = {
      ...payload,
      analisesimulado: true, // Flag específica para análise de simulado
      leadID: leadId,
      nome: lead.nomeReal || lead.lead?.name || "Lead sem nome",
      telefone: lead.lead?.phone,
      textoManuscrito: textoManuscrito, // Adiciona o texto do manuscrito formatado
      textoEspelho: textoEspelho, // Adiciona o texto do espelho formatado
      arquivos: lead.arquivos.map((a: { id: string; dataUrl: string; fileType: string }) => ({
        id: a.id,
        url: a.dataUrl,
        tipo: a.fileType,
        nome: a.fileType
      })),
      arquivos_pdf: lead.pdfUnificado ? [{
        id: lead.id,
        url: lead.pdfUnificado,
        nome: "PDF Unificado"
      }] : [],
      // Adicionar imagens do espelho (da biblioteca ou individual)
      arquivos_imagens_espelho: imagensEspelho.map((url: string, index: number) => ({
        id: `${lead.id}-espelho-${index}`,
        url: url,
        nome: `Espelho ${index + 1}`
      })),
      metadata: {
        leadUrl: lead.leadUrl,
        sourceId: lead.lead?.sourceIdentifier,
        concluido: lead.concluido,
        fezRecurso: lead.fezRecurso,
        manuscritoProcessado: lead.manuscritoProcessado,
        temEspelho: !!lead.espelhoCorrecao || !!espelhoBiblioteca,
        espelhoBibliotecaId: lead.espelhoBibliotecaId,
        espelhoBibliotecaNome: espelhoBiblioteca?.nome
      }
    };
    
    // Enviar para o sistema externo de forma assíncrona
    // (Não esperamos a resposta para não bloquear o fluxo)
    console.log("[Enviar Consultoria Fase 2] Enviando payload para processamento:", webhookUrl);
    console.log("[Enviar Consultoria Fase 2] Payload resumo:", {
      leadID: requestPayload.leadID,
      temTextoManuscrito: !!requestPayload.textoManuscrito,
      temTextoEspelho: !!requestPayload.textoEspelho,
      tipoEspelho: espelhoBiblioteca ? 'biblioteca' : 'individual',
      quantidadeImagensEspelho: requestPayload.arquivos_imagens_espelho?.length || 0,
      espelhoBibliotecaId: requestPayload.metadata.espelhoBibliotecaId,
      espelhoBibliotecaNome: requestPayload.metadata.espelhoBibliotecaNome,
      analisesimulado: requestPayload.analisesimulado
    });
    
    fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    }).then(response => {
      if (!response.ok) {
        console.error("[Enviar Consultoria Fase 2] Erro na resposta do sistema externo:", response.status);
      } else {
        console.log("[Enviar Consultoria Fase 2] Enviado com sucesso para o sistema externo");
      }
    }).catch(error => {
      console.error("[Enviar Consultoria Fase 2] Erro ao enviar para o sistema externo:", error);
    });
    
    // Responder imediatamente ao cliente, independente do resultado do webhook
    return NextResponse.json({
      success: true,
      message: "Solicitação de consultoria fase 2 enviada com sucesso",
    });
    
  } catch (error: any) {
    console.error("[Enviar Consultoria Fase 2] Erro ao enviar solicitação:", error);
    return NextResponse.json(
      {
        error: error.message || "Erro interno ao enviar solicitação de consultoria fase 2",
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; 