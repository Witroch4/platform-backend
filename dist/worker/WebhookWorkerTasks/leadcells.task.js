"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processLeadCellTask = processLeadCellTask;
exports.processManuscritoTask = processManuscritoTask;
const prisma_1 = require("../../lib/prisma");
const sse_manager_1 = require("../../lib/sse-manager");
// Função principal que detecta o tipo de job e processa adequadamente
async function processLeadCellTask(job) {
    console.log(`[BullMQ] Processando job de lead cell: ${job.id}`);
    // Criar versão limitada dos dados para log
    const limitedData = limitJobDataForLog(job.data);
    console.log(`[BullMQ] Dados do job:`, JSON.stringify(limitedData, null, 2));
    const data = job.data;
    // Detectar tipo de processamento baseado nas flags
    if ('manuscrito' in data && data.manuscrito) {
        return await processManuscrito(job);
    }
    else if (('espelho' in data && data.espelho) || ('espelhoparabiblioteca' in data && data.espelhoparabiblioteca)) {
        return await processEspelho(job);
    }
    else if ('analise' in data || 'analiseSimulado' in data || 'analiseValidada' in data || 'analiseSimuladoValidada' in data) {
        return await processAnalise(job);
    }
    else {
        throw new Error('Tipo de job não reconhecido');
    }
}
// Função para processar manuscrito
async function processManuscrito(job) {
    console.log(`[BullMQ] 📝 Processando manuscrito para lead: ${job.data.leadID}`);
    try {
        const { leadID, textoDAprova, nome } = job.data;
        // Juntar os "output" em uma única string com separadores
        const conteudoUnificado = textoDAprova
            .map((item) => item.output)
            .join('\n\n---------------------------------\n\n');
        console.log(`[BullMQ] Atualizando lead ${leadID} com o manuscrito processado`);
        // Verificar se o lead existe
        const leadExistente = await prisma_1.prisma.leadChatwit.findUnique({
            where: { id: leadID },
        });
        if (!leadExistente) {
            throw new Error(`Lead não encontrado com ID: ${leadID}`);
        }
        // Atualizar o lead com o conteúdo do manuscrito
        const leadAtualizado = await prisma_1.prisma.leadChatwit.update({
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
    }
    catch (error) {
        console.error(`[BullMQ] Erro ao processar manuscrito: ${error.message}`);
        throw error;
    }
}
// Função para processar espelho
async function processEspelho(job) {
    console.log(`[BullMQ] 📋 Processando espelho para lead: ${job.data.leadID}`);
    try {
        const { leadID, textoDAprova, nome, espelhoparabiblioteca } = job.data;
        // Juntar os "output" em uma única string com separadores
        const conteudoUnificado = textoDAprova
            .map((item) => item.output)
            .join('\n\n---------------------------------\n\n');
        console.log(`[BullMQ] Atualizando lead ${leadID} com o espelho processado`);
        // Verificar se o lead existe
        const leadExistente = await prisma_1.prisma.leadChatwit.findUnique({
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
        let exames = [];
        if (Array.isArray(leadExistente.examesParticipados)) {
            exames = leadExistente.examesParticipados;
        }
        if (descMatch) {
            const exameDesc = descMatch[1].trim();
            if (!exames.includes(exameDesc)) {
                exames.push(exameDesc);
            }
        }
        const updateData = {
            textoDOEspelho: conteudoUnificado,
            espelhoProcessado: true,
            aguardandoEspelho: false,
            updatedAt: new Date(),
        };
        if (exames.length > 0)
            updateData.examesParticipados = exames;
        if (seccionalMatch)
            updateData.seccional = seccionalMatch[1].trim();
        if (areaMatch)
            updateData.areaJuridica = areaMatch[1].trim();
        if (notaMatch)
            updateData.notaFinal = parseFloat(notaMatch[1].replace(',', '.'));
        if (situacaoMatch)
            updateData.situacao = situacaoMatch[1].trim();
        if (inscricaoMatch)
            updateData.inscricao = inscricaoMatch[1].trim();
        if (nomeMatch && !leadExistente.nomeReal)
            updateData.nomeReal = nomeMatch[1].trim();
        const leadAtualizado = await prisma_1.prisma.leadChatwit.update({
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
    }
    catch (error) {
        console.error(`[BullMQ] Erro ao processar espelho: ${error.message}`);
        throw error;
    }
}
// Função para processar análise
async function processAnalise(job) {
    console.log(`[BullMQ] 📊 Processando análise para lead: ${job.data.leadID}`);
    try {
        const { leadID, analiseUrl, argumentacaoUrl, analisePreliminar, nome, analiseSimulado, analiseValidada, analiseSimuladoValidada } = job.data;
        console.log(`[BullMQ] Atualizando lead ${leadID} com a análise processada`);
        // Verificar se o lead existe
        const leadExistente = await prisma_1.prisma.leadChatwit.findUnique({
            where: { id: leadID },
        });
        if (!leadExistente) {
            throw new Error(`Lead não encontrado com ID: ${leadID}`);
        }
        // Preparar dados de atualização baseado no tipo de análise
        let updateData = {
            aguardandoAnalise: false,
            updatedAt: new Date()
        };
        let message = '';
        if (analiseUrl) {
            // Análise final com URL
            updateData.analiseUrl = analiseUrl;
            if (argumentacaoUrl) {
                updateData.argumentacaoUrl = argumentacaoUrl;
            }
            updateData.analiseProcessada = true;
            updateData.analiseValidada = true;
            message = analiseSimulado
                ? 'Sua análise de simulado foi finalizada!'
                : 'Sua análise foi finalizada!';
        }
        else if (analisePreliminar) {
            // Análise preliminar
            updateData.analisePreliminar = analisePreliminar;
            updateData.analiseProcessada = true; // Marcar como processada para trigger do toast
            message = analiseSimulado
                ? 'Sua pré-análise de simulado está pronta!'
                : 'Sua pré-análise está pronta!';
        }
        else if (analiseValidada || analiseSimuladoValidada) {
            // Análise validada (aguardando URL final)
            updateData.analiseValidada = true;
            message = analiseSimuladoValidada
                ? 'Sua análise de simulado foi validada e está sendo finalizada!'
                : 'Sua análise foi validada e está sendo finalizada!';
        }
        // Atualizar o lead
        const leadAtualizado = await prisma_1.prisma.leadChatwit.update({
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
    }
    catch (error) {
        console.error(`[BullMQ] Erro ao processar análise: ${error.message}`);
        throw error;
    }
}
// Função auxiliar para enviar notificações SSE
async function sendSSENotification(leadID, payload, type) {
    try {
        console.log(`[Worker ${type}] 📤 Preparando para enviar notificação para ${leadID}:`);
        // Criar versão limitada do payload para log
        const limitedPayload = limitNotificationPayloadForLog(payload);
        console.log(`[Worker ${type}] 📋 Payload da notificação:`, JSON.stringify(limitedPayload, null, 2));
        const success = await sse_manager_1.sseManager.sendNotification(leadID, payload);
        if (success) {
            console.log(`[BullMQ] ✅ Notificação SSE de ${type} enviada com sucesso para o lead: ${leadID}`);
        }
        else {
            console.error(`[BullMQ] ❌ Falha ao enviar notificação SSE de ${type} para o lead: ${leadID}`);
        }
    }
    catch (error) {
        console.error(`[BullMQ] ❌ Erro ao enviar notificação SSE de ${type} para o lead ${leadID}:`, error);
        // Enviar notificação de erro
        try {
            await sse_manager_1.sseManager.sendNotification(leadID, {
                type: 'error',
                message: `Ocorreu um erro ao processar seu ${type.toLowerCase()}.`,
                timestamp: new Date().toISOString()
            });
        }
        catch (errorNotification) {
            console.error(`[BullMQ] ❌ Erro ao enviar notificação de erro:`, errorNotification);
        }
    }
}
// Função para limitar os dados do job no log
function limitJobDataForLog(jobData) {
    if (typeof jobData !== 'object' || jobData === null) {
        return jobData;
    }
    const limited = {};
    const allowedFields = ['leadID', 'nome', 'telefone', 'analiseUrl', 'argumentacaoUrl', 'manuscrito', 'espelho', 'analise', 'analiseSimulado', 'analiseValidada', 'analiseSimuladoValidada', 'espelhoparabiblioteca'];
    for (const field of allowedFields) {
        if (jobData[field] !== undefined) {
            limited[field] = jobData[field];
        }
    }
    // Para analisePreliminar, incluir apenas campos básicos
    if (jobData.analisePreliminar) {
        const { exameDescricao, inscricao, nomeExaminando, seccional, areaJuridica, notaFinal, situacao } = jobData.analisePreliminar;
        limited.analisePreliminar = { exameDescricao, inscricao, nomeExaminando, seccional, areaJuridica, notaFinal, situacao };
    }
    return limited;
}
// Função para limitar o payload da notificação no log
function limitNotificationPayloadForLog(payload) {
    if (typeof payload !== 'object' || payload === null) {
        return payload;
    }
    const limited = {
        type: payload.type,
        message: payload.message
    };
    // Para leadData, incluir apenas campos básicos essenciais
    if (payload.leadData) {
        const { id, sourceId, name, nomeReal, phoneNumber } = payload.leadData;
        limited.leadData = {
            id, sourceId, name, nomeReal, phoneNumber,
            // Apenas flags de estado, sem dados extensos
            concluido: payload.leadData.concluido,
            manuscritoProcessado: payload.leadData.manuscritoProcessado,
            espelhoProcessado: payload.leadData.espelhoProcessado,
            analiseProcessada: payload.leadData.analiseProcessada,
            analiseValidada: payload.leadData.analiseValidada,
            situacao: payload.leadData.situacao,
            notaFinal: payload.leadData.notaFinal
        };
        // Campos extensos são omitidos completamente ou resumidos
        if (payload.leadData.provaManuscrita) {
            limited.leadData.provaManuscrita = "[Omitido - manuscrito presente]";
        }
        if (payload.leadData.textoDOEspelho) {
            limited.leadData.textoDOEspelho = "[Omitido - espelho presente]";
        }
        if (payload.leadData.imagensConvertidas) {
            try {
                const images = JSON.parse(payload.leadData.imagensConvertidas);
                limited.leadData.imagensConvertidas = `[${images.length} imagens]`;
            }
            catch {
                limited.leadData.imagensConvertidas = "[Imagens presentes]";
            }
        }
        if (payload.leadData.analisePreliminar) {
            // Apenas campos básicos da análise preliminar
            const { situacao, notaFinal, subtotalPeca, subtotalQuestoes } = payload.leadData.analisePreliminar;
            limited.leadData.analisePreliminar = {
                situacao, notaFinal, subtotalPeca, subtotalQuestoes,
                conclusao: "[Omitida - presente]",
                pontosPeca: payload.leadData.analisePreliminar.pontosPeca ? `[${payload.leadData.analisePreliminar.pontosPeca.length} pontos]` : undefined,
                argumentacao: payload.leadData.analisePreliminar.argumentacao ? `[${payload.leadData.analisePreliminar.argumentacao.length} argumentos]` : undefined
            };
        }
    }
    if (payload.timestamp)
        limited.timestamp = payload.timestamp;
    return limited;
}
// Manter compatibilidade com a função antiga
async function processManuscritoTask(job) {
    return await processLeadCellTask(job);
}
