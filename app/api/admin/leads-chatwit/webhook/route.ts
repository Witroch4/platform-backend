import { NextResponse } from 'next/server';
import { getPrismaInstance } from "@/lib/connections";
import { addManuscritoJob, addEspelhoJob, addAnaliseJob } from '@/lib/queue/leadcells.queue';
// Lazy import to avoid Edge Runtime issues
const getSseManager = () => import('@/lib/sse-manager').then(m => m.sseManager);

// Helper function to send SSE notifications
async function sendSseNotification(leadId: string, data: any) {
  try {
    const sseManager = await getSseManager();
    return sseManager.sendNotification(leadId, data);
  } catch (error) {
    console.error('[SSE] Erro ao enviar notificação:', error);
    return false;
  }
}

// Criando uma instância do Prisma fora do escopo da rota
const prisma = getPrismaInstance();

/**
 * Handler da rota POST.
 */
export async function POST(request: Request): Promise<Response> {
  try {
          console.log("[Webhook] Recebendo payload...");
      
      // Obter o payload completo
      let webhookData = await request.json();
    
    // Verificar se o payload está dentro de um array ou outro contêiner
    if (Array.isArray(webhookData) && webhookData.length > 0) {
      console.log("[Webhook] Payload recebido como array, extraindo primeiro elemento");
      webhookData = webhookData[0];
    }
    
    // Verificar se o payload está dentro de um "body"
    if (webhookData.body && typeof webhookData.body === 'object') {
      console.log("[Webhook] Payload com wrapper 'body', extraindo conteúdo");
      webhookData = webhookData.body;
    }

    // Se o payload possui um debug que contém analisepreliminar, extrair o debug como payload
    if (webhookData.debug && webhookData.debug.analisepreliminar === true) {
      console.log("[Webhook] Identificado payload de pré-análise dentro do debug, extraindo");
      webhookData = webhookData.debug;
    }
    

      

    
    // Verificar o formato do payload para identificar o tipo
    const isEspelho = webhookData.espelho === true;
    const isEspelhoConsultoriaFase2 = webhookData.espelhoconsultoriafase2 === true;
    const isEspelhoParaBiblioteca = webhookData.espelhoparabiblioteca === true;
    const isEspelhoPadrao = webhookData.espelhoPadrao === true;
    const isManuscrito = webhookData.manuscrito === true && webhookData.textoDAprova;
    const isAnalise = webhookData.analise === true;
    const isAnaliseSimulado = webhookData.analisesimulado === true;
    const isAnalisePreliminar = webhookData.analisepreliminar === true;
    const isAnaliseSimuladoPreliminar = webhookData.analisesimuladopreliminar === true;
    const isAnaliseValidada = webhookData.analiseValidada === true;
    const isAnaliseSimuladoValidada = webhookData.analisesimuladovalidado === true;
    const isAnaliseSimuladoValidadaCamelCase = webhookData.analiseSimuladoValidada === true;
    const isRecursoPreliminar = webhookData.RecursoFinalizado === true && webhookData.recursoPreliminar === true;
    const isRecursoValidado = webhookData.RecursoFinalizado === true && webhookData.recursoValidado === true;
    
    console.log("[Webhook] Tipo do payload - espelho:", isEspelho, "espelhoConsultoriaFase2:", isEspelhoConsultoriaFase2, "espelhoParaBiblioteca:", isEspelhoParaBiblioteca, "espelhoPadrao:", isEspelhoPadrao, "manuscrito:", isManuscrito, "analise:", isAnalise, "analiseSimulado:", isAnaliseSimulado, "analisePreliminar:", isAnalisePreliminar, "analiseSimuladoPreliminar:", isAnaliseSimuladoPreliminar, "analiseValidada:", isAnaliseValidada, "analiseSimuladoValidada:", isAnaliseSimuladoValidada, "analiseSimuladoValidadaCamelCase:", isAnaliseSimuladoValidadaCamelCase, "recursoPreliminar:", isRecursoPreliminar, "recursoValidado:", isRecursoValidado);

    // Processar webhook de pré-análise
    if (isAnalisePreliminar) {
      console.log("[Webhook] Identificado payload de pré-análise de prova");
      
      // Verificar se temos o leadID
      let leadID = webhookData.leadID;
      
      // Buscar pelo telefone se não tiver o leadID
      if (!leadID && webhookData.telefone) {
        console.log("[Webhook] Buscando lead por telefone");
        const lead = await prisma.leadOabData.findFirst({
          where: {
            lead: { phone: webhookData.telefone }
          }
        });
        
        if (lead) {
          leadID = lead.id;
          console.log("[Webhook] Lead encontrado pelo telefone:", leadID);
        } else {
          console.error("[Webhook] Lead não encontrado com o telefone fornecido");
          return NextResponse.json({
            success: false,
            message: "Lead não encontrado com o telefone fornecido",
          });
        }
      }
      
      if (!leadID) {
        console.error("[Webhook] Não foi possível identificar o lead");
        return NextResponse.json({
          success: false,
          message: "Não foi possível identificar o lead",
        });
      }
      
      try {
        console.log("[Webhook] Adicionando job de análise preliminar à fila");
        
        // Adicionar job à fila do worker
        await addAnaliseJob({
          leadID,
          analisePreliminar: webhookData,
          nome: webhookData.nome,
          telefone: webhookData.telefone,
          analise: true
        });
        
        console.log("[Webhook] Job de análise preliminar adicionado à fila para o lead:", leadID);
        
        return NextResponse.json({
          success: true,
          message: "Pré-análise de prova adicionada à fila de processamento",
        });
      } catch (error: any) {
        console.error("[Webhook] Erro ao adicionar job de análise preliminar:", error);
        return NextResponse.json({
          success: false,
          message: `Erro ao processar pré-análise: ${error.message || 'Erro desconhecido'}`,
        }, { status: 500 });
      }
    }

    // Processar webhook de pré-recurso
    if (isRecursoPreliminar) {
      console.log("[Webhook] Identificado payload de pré-recurso");
      
      // Verificar se temos o leadID
      let leadID = webhookData.leadID;
      
      // Buscar pelo telefone se não tiver o leadID
      if (!leadID && webhookData.telefone) {
        console.log("[Webhook] Buscando lead por telefone");
        const lead = await prisma.leadOabData.findFirst({
          where: {
            lead: { phone: webhookData.telefone }
          }
        });
        
        if (lead) {
          leadID = lead.id;
          console.log("[Webhook] Lead encontrado pelo telefone:", leadID);
        } else {
          console.error("[Webhook] Lead não encontrado com o telefone fornecido");
          return NextResponse.json({
            success: false,
            message: "Lead não encontrado com o telefone fornecido",
          });
        }
      }
      
      if (!leadID) {
        console.error("[Webhook] Não foi possível identificar o lead");
        return NextResponse.json({
          success: false,
          message: "Não foi possível identificar o lead",
        });
      }
      
      try {
        // Armazenar o pré-recurso no banco
        const leadUpdate = await prisma.leadOabData.update({
          where: {
            id: leadID
          },
          data: {
            recursoPreliminar: webhookData.textoRecurso || JSON.stringify(webhookData),
            recursoValidado: false,
            aguardandoRecurso: false
          }
        });
        
        console.log("[Webhook] Pré-recurso armazenado para o lead:", leadID);
        
        // Enviar notificação SSE
        await sendSseNotification(leadID, {
          type: 'recurso_preliminar',
          message: 'Pré-recurso foi gerado e está aguardando validação!',
          leadId: leadID,
          status: 'recurso_preliminar_recebido',
          timestamp: new Date().toISOString()
        });
        
        return NextResponse.json({
          success: true,
          message: "Pré-recurso processado com sucesso",
        });
      } catch (error: any) {
        console.error("[Webhook] Erro ao atualizar lead com pré-recurso:", error);
        return NextResponse.json({
          success: false,
          message: `Erro ao processar pré-recurso: ${error.message || 'Erro desconhecido'}`,
        }, { status: 500 });
      }
    }

    // Processar webhook de recurso validado
    if (isRecursoValidado) {
      console.log("[Webhook] Identificado payload de recurso validado");
      
      // Verificar se temos o leadID
      let leadID = webhookData.leadID;
      
      // Buscar pelo telefone se não tiver o leadID
      if (!leadID && webhookData.telefone) {
        console.log("[Webhook] Buscando lead por telefone");
        const lead = await prisma.leadOabData.findFirst({
          where: {
            lead: { phone: webhookData.telefone }
          }
        });
        
        if (lead) {
          leadID = lead.id;
          console.log("[Webhook] Lead encontrado pelo telefone:", leadID);
        } else {
          console.error("[Webhook] Lead não encontrado com o telefone fornecido");
          return NextResponse.json({
            success: false,
            message: "Lead não encontrado com o telefone fornecido",
          });
        }
      }
      
      if (!leadID) {
        console.error("[Webhook] Não foi possível identificar o lead");
        return NextResponse.json({
          success: false,
          message: "Não foi possível identificar o lead",
        });
      }
      
      // Verificar se as URLs foram fornecidas
      const recursoUrl = webhookData.recursoUrl;
      const recursoArgumentacaoUrl = webhookData.recursoArgumentacaoUrl;
      
      if (!recursoUrl) {
        console.error("[Webhook] URL do recurso validado não fornecida");
        return NextResponse.json({
          success: false,
          message: "URL do recurso validado não fornecida (campo 'recursoUrl')",
        });
      }
      
      console.log("[Webhook] URL do recurso validado:", recursoUrl);
      console.log("[Webhook] URL da argumentação do recurso:", recursoArgumentacaoUrl);
      
      try {
        // Atualizar o lead com as URLs do recurso validado
        const leadUpdate = await prisma.leadOabData.update({
          where: {
            id: leadID
          },
          data: {
            recursoUrl: recursoUrl,
            recursoArgumentacaoUrl: recursoArgumentacaoUrl,
            recursoValidado: true,
            aguardandoRecurso: false
          }
        });
        
        console.log("[Webhook] Recurso validado processado para o lead:", leadID);
        
        // Enviar notificação SSE
        await sendSseNotification(leadID, {
          type: 'recurso_validado',
          message: 'Seu recurso foi validado e está pronto!',
          leadId: leadID,
          status: 'recurso_validado',
          recursoUrl: recursoUrl,
          timestamp: new Date().toISOString()
        });
        
        return NextResponse.json({
          success: true,
          message: "Recurso validado processado com sucesso",
        });
      } catch (error: any) {
        console.error("[Webhook] Erro ao atualizar lead com recurso validado:", error);
        return NextResponse.json({
          success: false,
          message: `Erro ao processar recurso validado: ${error.message || 'Erro desconhecido'}`,
        }, { status: 500 });
      }
    }

    // Processar webhook de espelho padrão
    if (isEspelhoPadrao) {
      console.log("[Webhook] Identificado payload de espelho padrão");
      
      const especialidade = webhookData.especialidade;
      const espelhoId = webhookData.espelhoId;
      
      if (!especialidade || !espelhoId) {
        console.error("[Webhook] Especialidade ou espelhoId não fornecido para espelho padrão");
        return NextResponse.json({
          success: false,
          message: "Especialidade e espelhoId são obrigatórios para espelhos padrão",
        });
      }
      
      // Processar a resposta do espelho padrão
      let textoMarkdown = null;
      
      if (webhookData.espelhoPadraotexto && Array.isArray(webhookData.espelhoPadraotexto) && webhookData.espelhoPadraotexto.length > 0) {
        const primeiroItem = webhookData.espelhoPadraotexto[0];
        textoMarkdown = primeiroItem?.output || null;
      }
      
      if (!textoMarkdown) {
        console.error("[Webhook] Espelho padrão sem texto markdown");
        return NextResponse.json({
          success: false,
          message: "Texto do espelho padrão não fornecido",
        });
      }
      
      // Limpar wrapper markdown se existir
      if (textoMarkdown.startsWith('```markdown\n')) {
        textoMarkdown = textoMarkdown.replace(/^```markdown\n/, '');
      }
      
      // Remover ``` final se existir
      if (textoMarkdown.endsWith('```')) {
        textoMarkdown = textoMarkdown.replace(/```$/, '');
      }
      
      // Remover espaços extras
      textoMarkdown = textoMarkdown.trim();
      
      try {
        // Atualizar o espelho padrão no banco
        const espelhoAtualizado = await prisma.espelhoPadrao.update({
          where: { id: espelhoId },
          data: {
            textoMarkdown: textoMarkdown,
            processado: true,
            aguardandoProcessamento: false,
            totalUsos: {
              increment: 1
            }
          }
        });
        
        console.log("[Webhook] ✅ Espelho padrão atualizado:", espelhoAtualizado.id);
        
        // Não enviar notificação SSE para espelhos padrão pois são globais
        // A interface será atualizada via polling no drawer
        
        return NextResponse.json({
          success: true,
          message: "Espelho padrão processado com sucesso",
          espelhoId: espelhoAtualizado.id,
          especialidade: especialidade
        });
      } catch (error: any) {
        console.error("[Webhook] Erro ao atualizar espelho padrão:", error);
        return NextResponse.json({
          success: false,
          message: `Erro ao processar espelho padrão: ${error.message || 'Erro desconhecido'}`,
        }, { status: 500 });
      }
    }

    // Processar webhook de espelho para biblioteca
    if (isEspelhoParaBiblioteca) {
      console.log("[Webhook] Identificado payload de espelho para biblioteca");
      
      // Para espelhos da biblioteca, precisamos do ID do espelho
      const espelhoBibliotecaId = webhookData.espelhoBibliotecaId;
      
      if (!espelhoBibliotecaId) {
        console.error("[Webhook] ID do espelho da biblioteca não fornecido");
        return NextResponse.json({
          success: false,
          message: "ID do espelho da biblioteca não fornecido (espelhoBibliotecaId)",
        });
      }
      
      // Processar o texto do espelho
      const textoDOEspelho = webhookData.textoDOEspelho || null;
      
      if (!textoDOEspelho) {
        console.error("[Webhook] Espelho da biblioteca sem texto (textoDOEspelho)");
        return NextResponse.json({
          success: false,
          message: "Texto do espelho não fornecido para a biblioteca (textoDOEspelho)",
        });
      }
      
      try {
        // Verificar se o espelho existe na biblioteca
        const espelhoExistente = await prisma.espelhoBiblioteca.findUnique({
          where: { id: espelhoBibliotecaId }
        });
        
        if (!espelhoExistente) {
          console.error("[Webhook] Espelho da biblioteca não encontrado:", espelhoBibliotecaId);
          return NextResponse.json({
            success: false,
            message: "Espelho da biblioteca não encontrado",
          });
        }
        
        // Verificar imagens do espelho (opcional)
        let urlsEspelho: string[] = [];
        
        if (webhookData.arquivos_imagens_espelho && 
            Array.isArray(webhookData.arquivos_imagens_espelho) && 
            webhookData.arquivos_imagens_espelho.length > 0) {
          
          console.log("[Webhook] Processando imagens do espelho para biblioteca");
          const imagensEspelho = webhookData.arquivos_imagens_espelho;
          urlsEspelho = imagensEspelho.map((item: { url: string }) => item.url);
          console.log("[Webhook] URLs do espelho para biblioteca:", urlsEspelho);
        }
        
        // Atualizar o espelho na biblioteca com o texto gerado
        const espelhoAtualizado = await prisma.espelhoBiblioteca.update({
          where: { id: espelhoBibliotecaId },
          data: {
            textoDOEspelho: textoDOEspelho,
            // Manter as imagens existentes se não foram fornecidas novas
            ...(urlsEspelho.length > 0 && { espelhoCorrecao: JSON.stringify(urlsEspelho) }),
            // Marcar como processado e remover estado de aguardando
            espelhoBibliotecaProcessado: true,
            aguardandoEspelho: false
          }
        });
        
        console.log("[Webhook] Espelho da biblioteca atualizado com texto:", espelhoAtualizado.id);
        
        // Enviar notificação SSE (para biblioteca geral)
        await sendSseNotification('biblioteca_geral', {
          type: 'espelho_biblioteca_processado',
          message: 'Novo espelho foi adicionado à biblioteca!',
          espelhoId: espelhoAtualizado.id,
          status: 'espelho_biblioteca_processado',
          timestamp: new Date().toISOString()
        });
        
        return NextResponse.json({
          success: true,
          message: "Texto do espelho adicionado à biblioteca com sucesso",
          espelhoId: espelhoAtualizado.id
        });
      } catch (error: any) {
        console.error("[Webhook] Erro ao atualizar espelho da biblioteca:", error);
        return NextResponse.json({
          success: false,
          message: `Erro ao processar espelho para biblioteca: ${error.message || 'Erro desconhecido'}`,
        }, { status: 500 });
      }
    }

    // Processar webhook de pré-análise de simulado
    if (isAnaliseSimuladoPreliminar) {
      console.log("[Webhook] Identificado payload de pré-análise de simulado");
      
      // Verificar se temos o leadID
      let leadID = webhookData.leadID;
      
      // Buscar pelo telefone se não tiver o leadID
      if (!leadID && webhookData.telefone) {
        console.log("[Webhook] Buscando lead por telefone");
        const lead = await prisma.leadOabData.findFirst({
          where: {
            lead: { phone: webhookData.telefone }
          }
        });
        
        if (lead) {
          leadID = lead.id;
          console.log("[Webhook] Lead encontrado pelo telefone:", leadID);
        } else {
          console.error("[Webhook] Lead não encontrado com o telefone fornecido");
          return NextResponse.json({
            success: false,
            message: "Lead não encontrado com o telefone fornecido",
          });
        }
      }
      
      if (!leadID) {
        console.error("[Webhook] Não foi possível identificar o lead");
        return NextResponse.json({
          success: false,
          message: "Não foi possível identificar o lead",
        });
      }
      
      try {
        // Armazenar o payload completo da pré-análise de simulado
        const leadUpdate = await prisma.leadOabData.update({
          where: {
            id: leadID
          },
          data: {
            analisePreliminar: webhookData,
            analiseValidada: false,
            aguardandoAnalise: true // Mantém aguardando análise até que seja validada
          }
        });
        
        console.log("[Webhook] Pré-análise de simulado armazenada para o lead:", leadID);
        
        // Enviar notificação SSE
        await sendSseNotification(leadID, {
          type: 'analise_simulado_preliminar',
          message: 'Pré-análise do seu simulado foi processada com sucesso!',
          leadId: leadID,
          status: 'analise_simulado_preliminar_recebida',
          timestamp: new Date().toISOString()
        });
        
        return NextResponse.json({
          success: true,
          message: "Pré-análise de simulado processada com sucesso",
        });
      } catch (error: any) {
        console.error("[Webhook] Erro ao atualizar lead com pré-análise de simulado:", error);
        return NextResponse.json({
          success: false,
          message: `Erro ao processar pré-análise de simulado: ${error.message || 'Erro desconhecido'}`,
        }, { status: 500 });
      }
    }

    // Processar webhook de análise validada (nova implementação)
    if (webhookData.analiseValidada === true) {
      console.log("[Webhook] Identificado payload de análise validada com URL");
      
      // Verificar se temos o leadID
      let leadID = webhookData.leadID;
      
      // Buscar pelo telefone se não tiver o leadID
      if (!leadID && webhookData.telefone) {
        console.log("[Webhook] Buscando lead por telefone");
        const lead = await prisma.leadOabData.findFirst({
          where: {
            lead: { phone: webhookData.telefone }
          }
        });
        
        if (lead) {
          leadID = lead.id;
          console.log("[Webhook] Lead encontrado pelo telefone:", leadID);
        } else {
          console.error("[Webhook] Lead não encontrado com o telefone fornecido");
          return NextResponse.json({
            success: false,
            message: "Lead não encontrado com o telefone fornecido",
          });
        }
      }
      
      if (!leadID) {
        console.error("[Webhook] Não foi possível identificar o lead");
        return NextResponse.json({
          success: false,
          message: "Não foi possível identificar o lead",
        });
      }
      
      // Verificar se a URL foi fornecida
      const analiseUrl = webhookData.analiseUrl;
      
      const argumentacaoUrl = webhookData.argumentacaoUrl;
      
      if (!analiseUrl) {
        console.error("[Webhook] URL da análise validada não fornecida");
        return NextResponse.json({
          success: false,
          message: "URL da análise validada não fornecida (campo 'analiseUrl')",
        });
      }
      
      console.log("[Webhook] URL da análise validada:", analiseUrl);
      console.log("[Webhook] URL da argumentação:", argumentacaoUrl);
      
      try {
        // Adicionar à fila de processamento do worker
        await addAnaliseJob({
          leadID: leadID,
          analiseUrl: analiseUrl,
          argumentacaoUrl: argumentacaoUrl,
          nome: webhookData.nome,
          telefone: webhookData.telefone,
          analiseValidada: true
        });
        
        console.log("[Webhook] Análise validada processada para o lead:", leadID);
        
        // Enviar notificação SSE
        await sendSseNotification(leadID, {
          type: 'analise_validada',
          message: 'Sua análise foi validada e está pronta!',
          leadId: leadID,
          status: 'analise_validada',
          analiseUrl: analiseUrl,
          timestamp: new Date().toISOString()
        });
        
        return NextResponse.json({
          success: true,
          message: "Análise validada processada com sucesso",
        });
      } catch (error: any) {
        console.error("[Webhook] Erro ao atualizar lead com análise validada:", error);
        return NextResponse.json({
          success: false,
          message: `Erro ao processar análise validada: ${error.message || 'Erro desconhecido'}`,
        }, { status: 500 });
      }
    }

    // Processar webhook de consultoria fase 2 (nova implementação)
    if (webhookData.consultoriafase2 === true) {
      console.log("[Webhook] Identificado payload de consultoria fase 2 com URL");
      
      // Verificar se temos o leadID
      let leadID = webhookData.leadID;
      
      // Buscar pelo telefone se não tiver o leadID
      if (!leadID && webhookData.telefone) {
        console.log("[Webhook] Buscando lead por telefone");
        const lead = await prisma.leadOabData.findFirst({
          where: {
            lead: { phone: webhookData.telefone }
          }
        });
        
        if (lead) {
          leadID = lead.id;
          console.log("[Webhook] Lead encontrado pelo telefone:", leadID);
        } else {
          console.error("[Webhook] Lead não encontrado com o telefone fornecido");
          return NextResponse.json({
            success: false,
            message: "Lead não encontrado com o telefone fornecido",
          });
        }
      }
      
      if (!leadID) {
        console.error("[Webhook] Não foi possível identificar o lead");
        return NextResponse.json({
          success: false,
          message: "Não foi possível identificar o lead",
        });
      }
      
      // Verificar se a URL foi fornecida
      const analiseUrl = webhookData.analiseUrl;
      
      if (!analiseUrl) {
        console.error("[Webhook] URL da consultoria fase 2 não fornecida");
        return NextResponse.json({
          success: false,
          message: "URL da consultoria fase 2 não fornecida (campo 'analiseUrl')",
        });
      }
      
      console.log("[Webhook] URL da consultoria fase 2:", analiseUrl);
      
      try {
        // Atualizar o lead com a URL da consultoria fase 2
        const leadUpdate = await prisma.leadOabData.update({
          where: {
            id: leadID
          },
          data: {
            analiseUrl: analiseUrl,
            analiseProcessada: true,
            analiseValidada: true, // Marcar como validada para consultoria fase 2
            aguardandoAnalise: false
          }
        });
        
        console.log("[Webhook] Consultoria fase 2 processada para o lead:", leadID);
        
        // Enviar notificação SSE
        await sendSseNotification(leadID, {
          type: 'consultoria_fase2',
          message: 'Sua consultoria fase 2 foi processada e está pronta!',
          leadId: leadID,
          status: 'consultoria_fase2_pronta',
          analiseUrl: analiseUrl,
          timestamp: new Date().toISOString()
        });
        
        return NextResponse.json({
          success: true,
          message: "Consultoria fase 2 processada com sucesso",
        });
      } catch (error: any) {
        console.error("[Webhook] Erro ao atualizar lead com consultoria fase 2:", error);
        return NextResponse.json({
          success: false,
          message: `Erro ao processar consultoria fase 2: ${error.message || 'Erro desconhecido'}`,
        }, { status: 500 });
      }
    }

    // Processar webhook de análise
    if (isAnalise) {
      console.log("[Webhook] Identificado payload de análise de prova");
      
      // Verificar se temos o leadID
      let leadID = webhookData.leadID;
      
      // Buscar pelo telefone se não tiver o leadID
      if (!leadID && webhookData.telefone) {
        console.log("[Webhook] Buscando lead por telefone");
        const lead = await prisma.leadOabData.findFirst({
          where: {
            lead: { phone: webhookData.telefone }
          }
        });
        
        if (lead) {
          leadID = lead.id;
          console.log("[Webhook] Lead encontrado pelo telefone:", leadID);
        } else {
          console.error("[Webhook] Lead não encontrado com o telefone fornecido");
          return NextResponse.json({
            success: false,
            message: "Lead não encontrado com o telefone fornecido",
          });
        }
      }
      
      if (!leadID) {
        console.error("[Webhook] Não foi possível identificar o lead");
        return NextResponse.json({
          success: false,
          message: "Não foi possível identificar o lead",
        });
      }
      
      // Adicionar à fila de processamento
      await addAnaliseJob({
        leadID: leadID,
        analiseUrl: webhookData.analiseUrl,
        nome: webhookData.nome,
        telefone: webhookData.telefone,
        analise: true
      });
      
      console.log("[Webhook] Análise adicionada à fila de processamento para o lead:", leadID);
      
      // ✅ REMOVIDO: Atualização do banco de dados (responsabilidade do worker)
      // ✅ REMOVIDO: Notificação SSE (responsabilidade do worker)
      // O worker irá processar, atualizar o banco e notificar o frontend
      
      return NextResponse.json({
        success: true,
        message: "Análise adicionada à fila de processamento",
      });
    }

    // Processar webhook de análise de simulado
    if (isAnaliseSimulado) {
      console.log("[Webhook] Identificado payload de análise de simulado");
      
      // Verificar se temos o leadID
      let leadID = webhookData.leadID;
      
      // Buscar pelo telefone se não tiver o leadID
      if (!leadID && webhookData.telefone) {
        console.log("[Webhook] Buscando lead por telefone");
        const lead = await prisma.leadOabData.findFirst({
          where: {
            lead: { phone: webhookData.telefone }
          }
        });
        
        if (lead) {
          leadID = lead.id;
          console.log("[Webhook] Lead encontrado pelo telefone:", leadID);
        } else {
          console.error("[Webhook] Lead não encontrado com o telefone fornecido");
          return NextResponse.json({
            success: false,
            message: "Lead não encontrado com o telefone fornecido",
          });
        }
      }
      
      if (!leadID) {
        console.error("[Webhook] Não foi possível identificar o lead");
        return NextResponse.json({
          success: false,
          message: "Não foi possível identificar o lead",
        });
      }
      
      // Adicionar à fila de processamento
      await addAnaliseJob({
        leadID: leadID,
        analiseUrl: webhookData.analiseUrl,
        nome: webhookData.nome,
        telefone: webhookData.telefone,
        analiseSimulado: true
      });
      
      console.log("[Webhook] Análise de simulado adicionada à fila de processamento para o lead:", leadID);
      
      // ✅ REMOVIDO: Atualização do banco de dados (responsabilidade do worker)
      // ✅ REMOVIDO: Notificação SSE (responsabilidade do worker)
      // O worker irá processar, atualizar o banco e notificar o frontend
      
      return NextResponse.json({
        success: true,
        message: "Análise de simulado adicionada à fila de processamento",
      });
    }

    // Processar webhook de validação de análise de simulado
    if (isAnaliseSimuladoValidada) {
      console.log("[Webhook] Identificado payload de validação de análise de simulado");
      
      // Verificar se temos o leadID
      let leadID = webhookData.leadID;
      
      // Buscar pelo telefone se não tiver o leadID
      if (!leadID && webhookData.telefone) {
        console.log("[Webhook] Buscando lead por telefone");
        const lead = await prisma.leadOabData.findFirst({
          where: {
            lead: { phone: webhookData.telefone }
          }
        });
        
        if (lead) {
          leadID = lead.id;
          console.log("[Webhook] Lead encontrado pelo telefone:", leadID);
        } else {
          console.error("[Webhook] Lead não encontrado com o telefone fornecido");
          return NextResponse.json({
            success: false,
            message: "Lead não encontrado com o telefone fornecido",
          });
        }
      }
      
      if (!leadID) {
        console.error("[Webhook] Não foi possível identificar o lead");
        return NextResponse.json({
          success: false,
          message: "Não foi possível identificar o lead",
        });
      }
      
      // Verificar se a URL foi fornecida
      const analiseUrl = webhookData.analiseUrl;
      const argumentacaoUrl = webhookData.argumentacaoUrl;
      
      if (!analiseUrl) {
        console.error("[Webhook] URL da análise de simulado validada não fornecida");
        return NextResponse.json({
          success: false,
          message: "URL da análise de simulado validada não fornecida (campo 'analiseUrl')",
        });
      }
      
      console.log("[Webhook] URL da análise de simulado validada:", analiseUrl);
      console.log("[Webhook] URL da argumentação de simulado:", argumentacaoUrl);
      
      try {
        // Adicionar à fila de processamento do worker
        await addAnaliseJob({
          leadID: leadID,
          analiseUrl: analiseUrl,
          argumentacaoUrl: argumentacaoUrl,
          nome: webhookData.nome,
          telefone: webhookData.telefone,
          analiseSimuladoValidada: true
        });
        
        console.log("[Webhook] Análise de simulado validada adicionada à fila para o lead:", leadID);
        
        return NextResponse.json({
          success: true,
          message: "Análise de simulado validada adicionada à fila de processamento",
        });
      } catch (error: any) {
        console.error("[Webhook] Erro ao atualizar lead com análise de simulado validada:", error);
        return NextResponse.json({
          success: false,
          message: `Erro ao processar análise de simulado validada: ${error.message || 'Erro desconhecido'}`,
        }, { status: 500 });
      }
    }

    // Processar webhook de validação de análise de simulado (camelCase)
    if (isAnaliseSimuladoValidadaCamelCase) {
      console.log("[Webhook] Identificado payload de validação de análise de simulado (camelCase)");
      
      // Verificar se temos o leadID
      let leadID = webhookData.leadID;
      
      // Buscar pelo telefone se não tiver o leadID
      if (!leadID && webhookData.telefone) {
        console.log("[Webhook] Buscando lead por telefone");
        const lead = await prisma.leadOabData.findFirst({
          where: {
            lead: { phone: webhookData.telefone }
          }
        });
        
        if (lead) {
          leadID = lead.id;
          console.log("[Webhook] Lead encontrado pelo telefone:", leadID);
        } else {
          console.error("[Webhook] Lead não encontrado com o telefone fornecido");
          return NextResponse.json({
            success: false,
            message: "Lead não encontrado com o telefone fornecido",
          });
        }
      }
      
      if (!leadID) {
        console.error("[Webhook] Não foi possível identificar o lead");
        return NextResponse.json({
          success: false,
          message: "Não foi possível identificar o lead",
        });
      }
      
      // Verificar se a URL foi fornecida
      const analiseUrl = webhookData.analiseUrl;
      const argumentacaoUrl = webhookData.argumentacaoUrl;
      
      if (!analiseUrl) {
        console.error("[Webhook] URL da análise de simulado validada não fornecida");
        return NextResponse.json({
          success: false,
          message: "URL da análise de simulado validada não fornecida (campo 'analiseUrl')",
        });
      }
      
      console.log("[Webhook] URL da análise de simulado validada:", analiseUrl);
      console.log("[Webhook] URL da argumentação de simulado (camelCase):", argumentacaoUrl);
      
      try {
        // Adicionar à fila de processamento do worker
        await addAnaliseJob({
          leadID: leadID,
          analiseUrl: analiseUrl,
          argumentacaoUrl: argumentacaoUrl,
          nome: webhookData.nome,
          telefone: webhookData.telefone,
          analiseSimuladoValidada: true
        });
        
        console.log("[Webhook] Análise de simulado validada (camelCase) adicionada à fila para o lead:", leadID);
        
        return NextResponse.json({
          success: true,
          message: "Análise de simulado validada adicionada à fila de processamento",
        });
      } catch (error: any) {
        console.error("[Webhook] Erro ao atualizar lead com análise de simulado validada:", error);
        return NextResponse.json({
          success: false,
          message: `Erro ao processar análise de simulado validada: ${error.message || 'Erro desconhecido'}`,
        }, { status: 500 });
      }
    }

    // Verificar se é um espelho de correção
    if (isEspelho && webhookData.textoDOEspelho) {
      console.log("[Webhook] Identificado payload de espelho de correção");
      
      // Verificar se temos o leadID
      let leadID = webhookData.leadID;
      
      // Buscar pelo telefone se não tiver o leadID
      if (!leadID && webhookData.telefone) {
        console.log("[Webhook] Buscando lead por telefone");
        const lead = await prisma.leadOabData.findFirst({
          where: {
            lead: { phone: webhookData.telefone }
          }
        });
        
        if (lead) {
          leadID = lead.id;
          console.log("[Webhook] Lead encontrado pelo telefone:", leadID);
        } else {
          console.error("[Webhook] Lead não encontrado com o telefone fornecido");
          return NextResponse.json({
            success: false,
            message: "Lead não encontrado com o telefone fornecido",
          });
        }
      }
      
      if (!leadID) {
        console.error("[Webhook] Não foi possível identificar o lead");
        return NextResponse.json({
          success: false,
          message: "Não foi possível identificar o lead",
        });
      }
      
      // Converter textoDOEspelho para o formato esperado pelo worker
      const textoDAprova = Array.isArray(webhookData.textoDOEspelho) 
        ? webhookData.textoDOEspelho 
        : [{ output: webhookData.textoDOEspelho }];
      
      // Adicionar à fila de processamento
      await addEspelhoJob({
        leadID: leadID,
        textoDAprova: textoDAprova,
        nome: webhookData.nome,
        telefone: webhookData.telefone,
        espelho: true
      });
      
      console.log("[Webhook] Espelho adicionado à fila de processamento para o lead:", leadID);
      
      // ✅ REMOVIDO: Atualização do banco de dados (responsabilidade do worker)
      // ✅ REMOVIDO: Notificação SSE (responsabilidade do worker)
      // O worker irá processar, atualizar o banco e notificar o frontend
      
      return NextResponse.json({
        success: true,
        message: "Espelho adicionado à fila de processamento",
      });
    }

    // Verificar se é um espelho de consultoria fase 2
    if (isEspelhoConsultoriaFase2) {
      console.log("[Webhook] Identificado payload de espelho de consultoria fase 2");
      
      // Verificar se temos o leadID
      let leadID = webhookData.leadID;
      
      // Buscar pelo telefone se não tiver o leadID
      if (!leadID && webhookData.telefone) {
        console.log("[Webhook] Buscando lead por telefone");
        const lead = await prisma.leadOabData.findFirst({
          where: {
            lead: { phone: webhookData.telefone }
          }
        });
        
        if (lead) {
          leadID = lead.id;
          console.log("[Webhook] Lead encontrado pelo telefone:", leadID);
        } else {
          console.error("[Webhook] Lead não encontrado com o telefone fornecido");
          return NextResponse.json({
            success: false,
            message: "Lead não encontrado com o telefone fornecido",
          });
        }
      }
      
      if (!leadID) {
        console.error("[Webhook] Não foi possível identificar o lead");
        return NextResponse.json({
          success: false,
          message: "Não foi possível identificar o lead",
        });
      }
      
      // Processar o texto do espelho de consultoria
      const textoDOEspelho = webhookData.textoDOEspelho || null;
      
      console.log("[Webhook] Texto do espelho de consultoria:", textoDOEspelho ? "Presente" : "Ausente");
      
      try {
        // Verificar imagens do espelho (opcional)
        let urlsEspelho: string[] = [];
        
        if (webhookData.arquivos_imagens_espelho && 
            Array.isArray(webhookData.arquivos_imagens_espelho) && 
            webhookData.arquivos_imagens_espelho.length > 0) {
          
          console.log("[Webhook] Processando imagens do espelho de consultoria");
          const imagensEspelho = webhookData.arquivos_imagens_espelho;
          urlsEspelho = imagensEspelho.map((item: { url: string }) => item.url);
          console.log("[Webhook] URLs do espelho de consultoria:", urlsEspelho);
        }
        
        // Atualizar o lead com as informações do espelho de consultoria
        const leadUpdateData: any = {
          espelhoProcessado: true,      // Marcar como processado
          aguardandoEspelho: false      // Não está mais aguardando
        };
        
        // Adicionar texto do espelho se fornecido
        if (textoDOEspelho) {
          leadUpdateData.textoDOEspelho = textoDOEspelho;
        }
        
        // Adicionar espelhoCorrecao apenas se houver imagens
        if (urlsEspelho.length > 0) {
          leadUpdateData.espelhoCorrecao = JSON.stringify(urlsEspelho);
        }
        
        console.log("[Webhook] Atualizando lead com dados de consultoria:", leadUpdateData);
        
        const leadUpdate = await prisma.leadOabData.update({
          where: {
            id: leadID
          },
          data: leadUpdateData
        });
        
        console.log("[Webhook] Espelho de consultoria fase 2 processado para o lead:", leadID);
        
        // Enviar notificação SSE
        await sendSseNotification(leadID, {
          type: 'espelho_consultoria_fase2',
          message: 'Espelho de consultoria fase 2 foi processado!',
          leadId: leadID,
          status: 'espelho_consultoria_fase2_processado',
          textoDOEspelho: textoDOEspelho,
          temImagens: urlsEspelho.length > 0,
          timestamp: new Date().toISOString()
        });
        
        return NextResponse.json({
          success: true,
          message: "Espelho de consultoria fase 2 processado com sucesso",
        });
      } catch (error: any) {
        console.error("[Webhook] Erro ao atualizar lead com espelho de consultoria:", error);
        return NextResponse.json({
          success: false,
          message: `Erro ao processar espelho de consultoria: ${error.message || 'Erro desconhecido'}`,
        }, { status: 500 });
      }
    }
    
    // Verificar se é um manuscrito processado
    if (isManuscrito && webhookData.textoDAprova) {
      console.log("[Webhook] Identificado payload de manuscrito processado");
      
      // Primeira tentativa: usar o leadID do payload
      let leadID = webhookData.leadID;
      
      // Segunda tentativa: buscar pelo telefone
      if (!leadID && webhookData.telefone) {
        console.log("[Webhook] Buscando lead por telefone");
        const lead = await prisma.leadOabData.findFirst({
          where: {
            lead: { phone: webhookData.telefone }
          }
        });
        
        if (lead) {
          leadID = lead.id;
          console.log("[Webhook] Lead encontrado pelo telefone:", leadID);
        } else {
          console.error("[Webhook] Lead não encontrado com o telefone fornecido");
          return NextResponse.json({
            success: false,
            message: "Lead não encontrado com o telefone fornecido",
          });
        }
      }
      
      if (!leadID) {
        console.error("[Webhook] Não foi possível identificar o lead");
        return NextResponse.json({
          success: false,
          message: "Não foi possível identificar o lead",
        });
      }
      
      // Adicionar à fila de processamento
      await addManuscritoJob({
        leadID: leadID,
        textoDAprova: webhookData.textoDAprova,
        nome: webhookData.nome,
        telefone: webhookData.telefone,
        manuscrito: true
      });
      
      console.log("[Webhook] Manuscrito adicionado à fila de processamento para o lead:", leadID);
      
      // ✅ REMOVIDO: Atualização do banco de dados (responsabilidade do worker)
      // ✅ REMOVIDO: Notificação SSE (responsabilidade do worker)
      // O worker irá processar, atualizar o banco e notificar o frontend
      
      return NextResponse.json({
        success: true,
        message: "Manuscrito adicionado à fila de processamento",
      });
    }
    
    // Se não for identificado como espelho, manuscrito, pré-análise, pré-análise de simulado, análise ou análise de simulado
    console.error("[Webhook] Payload não identificado como espelho, manuscrito, espelho padrão, pré-análise, pré-análise de simulado, análise, análise de simulado, validação ou validação de simulado");
    console.error("[Webhook] Valores das flags - espelho:", webhookData.espelho, 
      "espelhoConsultoriaFase2:", webhookData.espelhoconsultoriafase2, 
      "espelhoParaBiblioteca:", webhookData.espelhoparabiblioteca,
      "espelhoPadrao:", webhookData.espelhoPadrao,
      "manuscrito:", webhookData.manuscrito, "análise:", webhookData.analise,
      "análiseSimulado:", webhookData.analisesimulado, "pré-análise:", webhookData.analisepreliminar, "préAnaliseSimulado:", webhookData.analisesimuladopreliminar,
      "analiseValidada:", webhookData.analiseValidada, "analiseSimuladoValidada:", webhookData.analisesimuladovalidado);
    console.error("[Webhook] Campos disponíveis:", Object.keys(webhookData));
    
    return NextResponse.json({
      success: false,
      message: "Payload não identificado como manuscrito, espelho, espelho padrão, espelho para biblioteca, pré-análise, pré-análise de simulado, análise, análise de simulado, validação ou validação de simulado",
      debug: webhookData // Incluir o payload para debug
    });
    
  } catch (error: any) {
    console.error("[Webhook] Erro ao processar webhook:", error);
    return NextResponse.json(
      {
        error: error.message || "Erro interno ao processar webhook",
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Verifica se o webhook está funcionando
 */
export async function GET(request: Request): Promise<Response> {
  return NextResponse.json(
    { status: "Webhook do Chatwit funcionando corretamente" },
    { status: 200 }
  );
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


