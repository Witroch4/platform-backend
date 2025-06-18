import { Job } from 'bullmq';
import { prisma } from '../../lib/prisma';
import { sseManager } from '../../lib/sse-manager';

// Interfaces para diferentes tipos de jobs
interface IManuscritoJobData {
  leadID: string;
  textoDAprova: Array<{ output: string }>;
  nome?: string;
  telefone?: string;
  manuscrito: true;
}

interface IEspelhoJobData {
  leadID: string;
  textoDAprova: Array<{ output: string }>;
  nome?: string;
  telefone?: string;
  espelho?: true;
  espelhoparabiblioteca?: true;
}

interface IAnaliseJobData {
  leadID: string;
  analiseUrl?: string;
  analisePreliminar?: any;
  nome?: string;
  telefone?: string;
  analise?: true;
  analiseSimulado?: true;
  analiseValidada?: true;
  analiseSimuladoValidada?: true;
}

type ILeadCellJobData = IManuscritoJobData | IEspelhoJobData | IAnaliseJobData;

// Função principal que detecta o tipo de job e processa adequadamente
export async function processLeadCellTask(job: Job<ILeadCellJobData>) {
  console.log(`[BullMQ] Processando job de lead cell: ${job.id}`);
  console.log(`[BullMQ] Dados do job:`, JSON.stringify(job.data, null, 2));

  const data = job.data;

  // Detectar tipo de processamento baseado nas flags
  if ('manuscrito' in data && data.manuscrito) {
    return await processManuscrito(job as Job<IManuscritoJobData>);
  } else if (('espelho' in data && data.espelho) || ('espelhoparabiblioteca' in data && data.espelhoparabiblioteca)) {
    return await processEspelho(job as Job<IEspelhoJobData>);
  } else if ('analise' in data || 'analiseSimulado' in data || 'analiseValidada' in data || 'analiseSimuladoValidada' in data) {
    return await processAnalise(job as Job<IAnaliseJobData>);
  } else {
    throw new Error('Tipo de job não reconhecido');
  }
}

// Função para processar manuscrito
async function processManuscrito(job: Job<IManuscritoJobData>) {
  console.log(`[BullMQ] 📝 Processando manuscrito para lead: ${job.data.leadID}`);

  try {
    const { leadID, textoDAprova, nome } = job.data;

    // Juntar os "output" em uma única string com separadores
    const conteudoUnificado = textoDAprova
      .map((item) => item.output)
      .join('\n\n---------------------------------\n\n');

    console.log(`[BullMQ] Atualizando lead ${leadID} com o manuscrito processado`);

    // Verificar se o lead existe
    const leadExistente = await prisma.leadChatwit.findUnique({
      where: { id: leadID },
    });

    if (!leadExistente) {
      throw new Error(`Lead não encontrado com ID: ${leadID}`);
    }

    // Atualizar o lead com o conteúdo do manuscrito
    const leadAtualizado = await prisma.leadChatwit.update({
      where: { id: leadID },
      data: {
        provaManuscrita: conteudoUnificado,
        manuscritoProcessado: true,
        aguardandoManuscrito: false,
        updatedAt: new Date()
      },
    });

    console.log(`[BullMQ] Lead atualizado com sucesso: ${leadAtualizado.id}`);

    // Enviar notificação SSE
    await sendSSENotification(leadID, {
      type: 'leadUpdate',
      message: 'Seu manuscrito foi processado com sucesso!',
      leadData: leadAtualizado,
      timestamp: new Date().toISOString()
    }, 'Manuscrito');

    return { success: true, message: 'Manuscrito processado com sucesso' };
  } catch (error: any) {
    console.error(`[BullMQ] Erro ao processar manuscrito: ${error.message}`);
    throw error;
  }
}

// Função para processar espelho
async function processEspelho(job: Job<IEspelhoJobData>) {
  console.log(`[BullMQ] 📋 Processando espelho para lead: ${job.data.leadID}`);

  try {
    const { leadID, textoDAprova, nome, espelhoparabiblioteca } = job.data;

    // Juntar os "output" em uma única string com separadores
    const conteudoUnificado = textoDAprova
      .map((item) => item.output)
      .join('\n\n---------------------------------\n\n');

    console.log(`[BullMQ] Atualizando lead ${leadID} com o espelho processado`);

    // Verificar se o lead existe
    const leadExistente = await prisma.leadChatwit.findUnique({
      where: { id: leadID },
    });

    if (!leadExistente) {
      throw new Error(`Lead não encontrado com ID: ${leadID}`);
    }

    // Atualizar o lead com o conteúdo do espelho
    // Extrair informações do cabeçalho do espelho
    const descMatch = conteudoUnificado.match(/Descri\u00e7\u00e3o do Exame:\s*(.+)/i);
    const inscricaoMatch = conteudoUnificado.match(/Inscri\u00e7\u00e3o:\s*([^\n]+)/i);
    const nomeMatch = conteudoUnificado.match(/Nome do Examinando:\s*(.+)/i);
    const seccionalMatch = conteudoUnificado.match(/Seccional:\s*(.+)/i);
    const areaMatch = conteudoUnificado.match(/\u00c1rea Jur\u00eddica:\s*(.+)/i);
    const notaMatch = conteudoUnificado.match(/Nota Final:\s*([0-9.,]+)/i);
    const situacaoMatch = conteudoUnificado.match(/Situa\u00e7\u00e3o:\s*(.+)/i);

    let exames: string[] = [];
    if (Array.isArray(leadExistente.examesParticipados)) {
      exames = leadExistente.examesParticipados as unknown as string[];
    }
    if (descMatch) {
      const exameDesc = descMatch[1].trim();
      if (!exames.includes(exameDesc)) {
        exames.push(exameDesc);
      }
    }

    const updateData: any = {
      textoDOEspelho: conteudoUnificado,
      espelhoProcessado: true,
      aguardandoEspelho: false,
      updatedAt: new Date(),
    };
    if (exames.length > 0) updateData.examesParticipados = exames;
    if (seccionalMatch) updateData.seccional = seccionalMatch[1].trim();
    if (areaMatch) updateData.areaJuridica = areaMatch[1].trim();
    if (notaMatch) updateData.notaFinal = parseFloat(notaMatch[1].replace(',', '.'));
    if (situacaoMatch) updateData.situacao = situacaoMatch[1].trim();
    if (inscricaoMatch) updateData.inscricao = inscricaoMatch[1].trim();
    if (nomeMatch && !leadExistente.nomeReal) updateData.nomeReal = nomeMatch[1].trim();

    const leadAtualizado = await prisma.leadChatwit.update({
      where: { id: leadID },
      data: updateData,
    });

    console.log(`[BullMQ] Lead atualizado com sucesso: ${leadAtualizado.id}`);

    // Enviar notificação SSE
    const message = espelhoparabiblioteca 
      ? 'Seu espelho para biblioteca foi processado com sucesso!'
      : 'Seu espelho de correção foi processado com sucesso!';

    await sendSSENotification(leadID, {
      type: 'leadUpdate',
      message,
      leadData: leadAtualizado,
      timestamp: new Date().toISOString()
    }, 'Espelho');

    return { success: true, message: 'Espelho processado com sucesso' };
  } catch (error: any) {
    console.error(`[BullMQ] Erro ao processar espelho: ${error.message}`);
    throw error;
  }
}

// Função para processar análise
async function processAnalise(job: Job<IAnaliseJobData>) {
  console.log(`[BullMQ] 📊 Processando análise para lead: ${job.data.leadID}`);

  try {
    const { leadID, analiseUrl, analisePreliminar, nome, analiseSimulado, analiseValidada, analiseSimuladoValidada } = job.data;

    console.log(`[BullMQ] Atualizando lead ${leadID} com a análise processada`);

    // Verificar se o lead existe
    const leadExistente = await prisma.leadChatwit.findUnique({
      where: { id: leadID },
    });

    if (!leadExistente) {
      throw new Error(`Lead não encontrado com ID: ${leadID}`);
    }

    // Preparar dados de atualização baseado no tipo de análise
    let updateData: any = {
      aguardandoAnalise: false,
      updatedAt: new Date()
    };

    let message = '';

    if (analiseUrl) {
      // Análise final com URL
      updateData.analiseUrl = analiseUrl;
      updateData.analiseProcessada = true;
      updateData.analiseValidada = true;
      message = analiseSimulado 
        ? 'Sua análise de simulado foi finalizada!'
        : 'Sua análise foi finalizada!';
    } else if (analisePreliminar) {
      // Análise preliminar
      updateData.analisePreliminar = analisePreliminar;
      updateData.analiseProcessada = true; // Marcar como processada para trigger do toast
      message = analiseSimulado
        ? 'Sua pré-análise de simulado está pronta!'
        : 'Sua pré-análise está pronta!';
    } else if (analiseValidada || analiseSimuladoValidada) {
      // Análise validada (aguardando URL final)
      updateData.analiseValidada = true;
      message = analiseSimuladoValidada
        ? 'Sua análise de simulado foi validada e está sendo finalizada!'
        : 'Sua análise foi validada e está sendo finalizada!';
    }

    // Atualizar o lead
    const leadAtualizado = await prisma.leadChatwit.update({
      where: { id: leadID },
      data: updateData,
    });

    console.log(`[BullMQ] Lead atualizado com sucesso: ${leadAtualizado.id}`);

    // Enviar notificação SSE
    await sendSSENotification(leadID, {
      type: 'leadUpdate',
      message,
      leadData: leadAtualizado,
      timestamp: new Date().toISOString()
    }, 'Análise');

    return { success: true, message: 'Análise processada com sucesso' };
  } catch (error: any) {
    console.error(`[BullMQ] Erro ao processar análise: ${error.message}`);
    throw error;
  }
}

// Função auxiliar para enviar notificações SSE
async function sendSSENotification(leadID: string, payload: any, type: string) {
  try {
    console.log(`[Worker ${type}] 📤 Preparando para enviar notificação para ${leadID}:`);
    console.log(`[Worker ${type}] 📋 Payload da notificação:`, JSON.stringify(payload, null, 2));
    
    const success = await sseManager.sendNotification(leadID, payload);
    
    if (success) {
      console.log(`[BullMQ] ✅ Notificação SSE de ${type} enviada com sucesso para o lead: ${leadID}`);
    } else {
      console.error(`[BullMQ] ❌ Falha ao enviar notificação SSE de ${type} para o lead: ${leadID}`);
    }
  } catch (error) {
    console.error(`[BullMQ] ❌ Erro ao enviar notificação SSE de ${type} para o lead ${leadID}:`, error);
    
    // Enviar notificação de erro
    try {
      await sseManager.sendNotification(leadID, {
        type: 'error',
        message: `Ocorreu um erro ao processar seu ${type.toLowerCase()}.`,
        timestamp: new Date().toISOString()
      });
    } catch (errorNotification) {
      console.error(`[BullMQ] ❌ Erro ao enviar notificação de erro:`, errorNotification);
    }
  }
}

// Manter compatibilidade com a função antiga
export async function processManuscritoTask(job: Job<IManuscritoJobData>) {
  return await processLeadCellTask(job);
}
