"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgendamento = createAgendamento;
exports.getAgendamentoById = getAgendamentoById;
exports.getAgendamentosByUser = getAgendamentosByUser;
exports.getAgendamentosByAccount = getAgendamentosByAccount;
exports.updateAgendamento = updateAgendamento;
exports.deleteAgendamento = deleteAgendamento;
exports.selectMidiaForSending = selectMidiaForSending;
exports.prepareWebhookData = prepareWebhookData;
const prisma_1 = require("@/lib/prisma");
const minio_1 = require("./minio");
const agendamento_queue_1 = require("@/lib/queue/agendamento.queue");
/**
 * Cria um novo agendamento
 */
async function createAgendamento(data) {
    try {
        // Cria o agendamento no banco de dados
        const agendamento = await prisma_1.prisma.agendamento.create({
            data: {
                userId: data.userId,
                accountId: data.accountId,
                data: data.Data,
                descricao: data.Descricao,
                facebook: data.Facebook || false,
                instagram: data.Instagram || false,
                linkedin: data.Linkedin || false,
                x: data.X || false,
                stories: data.Stories || false,
                reels: data.Reels || false,
                postNormal: data.PostNormal || false,
                diario: data.Diario || false,
                semanal: data.Semanal || false,
                randomizar: data.Randomizar || false,
                tratarComoUnicoPost: data.TratarComoUnicoPost || false,
                tratarComoPostagensIndividuais: data.TratarComoPostagensIndividuais || false,
            },
        });
        console.log(`[AgendamentoService] Agendamento criado: ${agendamento.id}`);
        // Processa e salva as mídias
        const midiasPromises = data.midias.map(async (midia) => {
            let url = midia.url;
            const thumbnail_url = midia.thumbnail_url;
            // Se não tiver URL, faz upload para o MinIO
            if (!url) {
                const uploadResult = await (0, minio_1.uploadToMinIO)(midia.buffer, midia.fileName, midia.mimeType);
                url = uploadResult.url;
                // Não temos thumbnail automática no upload atual
            }
            // Cria o registro da mídia no banco
            return prisma_1.prisma.midia.create({
                data: {
                    agendamentoId: agendamento.id,
                    url,
                    mime_type: midia.mimeType,
                    thumbnail_url: thumbnail_url || null,
                    contador: 0,
                },
            });
        });
        // Aguarda todas as mídias serem processadas
        const midias = await Promise.all(midiasPromises);
        console.log(`[AgendamentoService] ${midias.length} mídias salvas para o agendamento ${agendamento.id}`);
        // Agenda o job na fila BullMQ
        await (0, agendamento_queue_1.scheduleAgendamentoJob)({
            id: agendamento.id,
            Data: agendamento.data,
            userId: agendamento.userId,
            accountId: agendamento.accountId,
            Diario: agendamento.diario,
            Semanal: agendamento.semanal,
        });
        return agendamento;
    }
    catch (error) {
        console.error('[AgendamentoService] Erro ao criar agendamento:', error);
        throw error;
    }
}
/**
 * Infere o tipo MIME a partir da URL ou extensão do arquivo
 */
function inferMimeTypeFromUrl(url) {
    // Extrai a extensão do arquivo da URL
    const extension = url.split('.').pop()?.toLowerCase();
    // Mapeamento de extensões comuns para tipos MIME
    const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'pdf': 'application/pdf',
    };
    // Retorna o tipo MIME correspondente ou um tipo genérico
    return extension && mimeTypes[extension] ? mimeTypes[extension] : 'application/octet-stream';
}
/**
 * Busca um agendamento pelo ID
 */
async function getAgendamentoById(id) {
    try {
        return await prisma_1.prisma.agendamento.findUnique({
            where: { id },
            include: {
                midias: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                account: {
                    select: {
                        id: true,
                        providerAccountId: true,
                        access_token: true,
                        igUserId: true,
                        igUsername: true,
                    },
                },
            },
        });
    }
    catch (error) {
        console.error("[AgendamentoService] Erro ao buscar agendamento:", error);
        throw error;
    }
}
/**
 * Busca agendamentos por usuário
 */
async function getAgendamentosByUser(userId) {
    try {
        return await prisma_1.prisma.agendamento.findMany({
            where: { userId },
            include: {
                midias: true,
                account: {
                    select: {
                        id: true,
                        providerAccountId: true,
                        igUserId: true,
                        igUsername: true,
                    },
                },
            },
            orderBy: {
                data: 'asc',
            },
        });
    }
    catch (error) {
        console.error("[AgendamentoService] Erro ao buscar agendamentos do usuário:", error);
        throw error;
    }
}
/**
 * Busca agendamentos por conta
 */
async function getAgendamentosByAccount(accountId) {
    try {
        return await prisma_1.prisma.agendamento.findMany({
            where: { accountId },
            include: {
                midias: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                data: 'asc',
            },
        });
    }
    catch (error) {
        console.error("[AgendamentoService] Erro ao buscar agendamentos da conta:", error);
        throw error;
    }
}
/**
 * Atualiza um agendamento
 */
async function updateAgendamento(id, data) {
    try {
        // Busca o agendamento atual
        const existingAgendamento = await prisma_1.prisma.agendamento.findUnique({
            where: { id },
            include: { midias: true },
        });
        if (!existingAgendamento) {
            throw new Error(`Agendamento não encontrado: ${id}`);
        }
        // Prepara os dados para atualização
        const updateData = {};
        // Atualiza apenas os campos fornecidos
        if (data.Data !== undefined)
            updateData.data = data.Data;
        if (data.Descricao !== undefined)
            updateData.descricao = data.Descricao;
        if (data.Facebook !== undefined)
            updateData.facebook = data.Facebook;
        if (data.Instagram !== undefined)
            updateData.instagram = data.Instagram;
        if (data.Linkedin !== undefined)
            updateData.linkedin = data.Linkedin;
        if (data.X !== undefined)
            updateData.x = data.X;
        if (data.Stories !== undefined)
            updateData.stories = data.Stories;
        if (data.Reels !== undefined)
            updateData.reels = data.Reels;
        if (data.PostNormal !== undefined)
            updateData.postNormal = data.PostNormal;
        if (data.Diario !== undefined)
            updateData.diario = data.Diario;
        if (data.Semanal !== undefined)
            updateData.semanal = data.Semanal;
        if (data.Randomizar !== undefined)
            updateData.randomizar = data.Randomizar;
        if (data.TratarComoUnicoPost !== undefined)
            updateData.tratarComoUnicoPost = data.TratarComoUnicoPost;
        if (data.TratarComoPostagensIndividuais !== undefined)
            updateData.tratarComoPostagensIndividuais = data.TratarComoPostagensIndividuais;
        // Atualiza o agendamento
        const updatedAgendamento = await prisma_1.prisma.agendamento.update({
            where: { id },
            data: updateData,
        });
        // Se houver mídias para atualizar
        if (data.midias && data.midias.length > 0) {
            // Obtém IDs das mídias existentes
            const existingMidiaIds = existingAgendamento.midias.map((m) => m.id);
            // Identifica mídias a serem mantidas
            const midiasToKeep = data.midias.filter((m) => m.id && existingMidiaIds.includes(m.id));
            // Identifica IDs das mídias a serem mantidas
            const midiasToKeepIds = midiasToKeep.map((m) => m.id);
            // Remove mídias que não estão na lista de mídias a manter
            await prisma_1.prisma.midia.deleteMany({
                where: {
                    agendamentoId: id,
                    id: { notIn: midiasToKeepIds },
                },
            });
            // Adiciona novas mídias
            const newMidias = data.midias.filter((m) => !m.id);
            for (const midia of newMidias) {
                await prisma_1.prisma.midia.create({
                    data: {
                        agendamentoId: id,
                        url: midia.url,
                        mime_type: midia.mime_type,
                        thumbnail_url: midia.thumbnail_url,
                        contador: 0,
                    },
                });
            }
        }
        // Se a data foi alterada, reagenda o job
        if (data.Data !== undefined) {
            // Cancela o job existente
            await (0, agendamento_queue_1.cancelAgendamentoJob)(id);
            // Agenda um novo job com a nova data
            await (0, agendamento_queue_1.scheduleAgendamentoJob)({
                id: updatedAgendamento.id,
                Data: updatedAgendamento.data,
                userId: updatedAgendamento.userId,
                accountId: updatedAgendamento.accountId,
                Diario: updatedAgendamento.diario,
                Semanal: updatedAgendamento.semanal,
            });
        }
        return updatedAgendamento;
    }
    catch (error) {
        console.error('[AgendamentoService] Erro ao atualizar agendamento:', error);
        throw error;
    }
}
/**
 * Exclui um agendamento
 */
async function deleteAgendamento(id) {
    try {
        // Cancela o job na fila
        await (0, agendamento_queue_1.cancelAgendamentoJob)(id);
        // Exclui o agendamento (as mídias serão excluídas em cascata)
        await prisma_1.prisma.agendamento.delete({
            where: { id },
        });
        console.log(`[AgendamentoService] Agendamento ${id} excluído com sucesso`);
    }
    catch (error) {
        console.error(`[AgendamentoService] Erro ao excluir agendamento ${id}:`, error);
        throw error;
    }
}
/**
 * Seleciona uma mídia para envio com base na lógica de contadores
 */
async function selectMidiaForSending(agendamentoId) {
    try {
        // Busca o agendamento com suas mídias
        const agendamento = await prisma_1.prisma.agendamento.findUnique({
            where: { id: agendamentoId },
            include: { midias: true },
        });
        if (!agendamento || agendamento.midias.length === 0) {
            console.log("[AgendamentoService] Agendamento não encontrado ou sem mídias:", agendamentoId);
            return null;
        }
        console.log(`[AgendamentoService] Agendamento ${agendamentoId} tem ${agendamento.midias.length} mídias. TratarComoPostagensIndividuais: ${agendamento.tratarComoPostagensIndividuais}, Randomizar: ${agendamento.randomizar}`);
        let selectedMidia = null;
        // Se for para tratar como postagens individuais, seleciona com base no contador
        if (agendamento.tratarComoPostagensIndividuais) {
            // Determina o menor contador
            const minContador = Math.min(...agendamento.midias.map(m => m.contador));
            console.log(`[AgendamentoService] Menor contador encontrado: ${minContador}`);
            // Filtra as mídias com o menor contador
            const candidatas = agendamento.midias.filter(m => m.contador === minContador);
            console.log(`[AgendamentoService] ${candidatas.length} mídias candidatas com contador ${minContador}`);
            // Escolhe aleatoriamente uma das candidatas
            selectedMidia = candidatas[Math.floor(Math.random() * candidatas.length)];
            // Incrementa o contador da mídia selecionada
            if (selectedMidia) {
                await prisma_1.prisma.midia.update({
                    where: { id: selectedMidia.id },
                    data: { contador: { increment: 1 } },
                });
                console.log(`[AgendamentoService] Incrementado contador da mídia ${selectedMidia.id} para ${selectedMidia.contador + 1}`);
                // Atualiza o objeto com o novo valor do contador
                selectedMidia.contador += 1;
            }
        }
        else if (agendamento.randomizar) {
            // Se for apenas para randomizar (sem tratar como postagens individuais),
            // seleciona uma mídia aleatoriamente sem incrementar contador
            selectedMidia = agendamento.midias[Math.floor(Math.random() * agendamento.midias.length)];
            console.log(`[AgendamentoService] Selecionada mídia aleatória ${selectedMidia?.id} (sem incrementar contador)`);
        }
        else {
            // Se não for para randomizar nem tratar como postagens individuais,
            // retorna a primeira mídia (o webhook tratará como um único post)
            selectedMidia = agendamento.midias[0];
            console.log(`[AgendamentoService] Selecionada primeira mídia ${selectedMidia?.id} (sem randomização)`);
        }
        console.log("[AgendamentoService] Mídia selecionada:", selectedMidia?.id);
        return selectedMidia;
    }
    catch (error) {
        console.error("[AgendamentoService] Erro ao selecionar mídia para envio:", error);
        throw error;
    }
}
/**
 * Função para corrigir a URL do MinIO
 */
function correctMinioUrl(url) {
    // Substitui objstore.witdev.com.br por objstoreapi.witdev.com.br
    return url.replace('objstore.witdev.com.br', 'objstoreapi.witdev.com.br');
}
/**
 * Prepara os dados para envio ao webhook
 */
async function prepareWebhookData(agendamentoId) {
    try {
        // Busca o agendamento com suas mídias
        const agendamento = await prisma_1.prisma.agendamento.findUnique({
            where: { id: agendamentoId },
            include: {
                midias: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                account: {
                    select: {
                        id: true,
                        provider: true,
                        providerAccountId: true,
                        access_token: true,
                        expires_at: true,
                        igUserId: true,
                        igUsername: true,
                    },
                },
            },
        });
        if (!agendamento) {
            throw new Error(`Agendamento não encontrado: ${agendamentoId}`);
        }
        // Usa a conta associada diretamente ao agendamento
        const instagramAccount = agendamento.account;
        // Verifica se o token expirou
        const tokenExpired = instagramAccount.expires_at
            ? instagramAccount.expires_at * 1000 < Date.now()
            : false;
        let midia = null;
        let allMidias = null;
        // Se for para tratar como postagens individuais, seleciona apenas uma mídia
        if (agendamento.tratarComoPostagensIndividuais) {
            midia = await selectMidiaForSending(agendamentoId);
            if (!midia) {
                throw new Error(`Nenhuma mídia disponível para o agendamento: ${agendamentoId}`);
            }
            console.log(`[AgendamentoService] Preparando webhook para agendamento ${agendamentoId} com mídia única ${midia.id}`);
        }
        else {
            // Se não for para tratar como postagens individuais, envia todas as mídias
            allMidias = agendamento.midias;
            console.log(`[AgendamentoService] Preparando webhook para agendamento ${agendamentoId} com ${allMidias.length} mídias para carrossel`);
        }
        // Prepara os dados para o webhook
        const webhookData = {
            id: agendamento.id,
            userId: agendamento.userId,
            userName: agendamento.user.name,
            userEmail: agendamento.user.email,
            descricao: agendamento.descricao,
            data: agendamento.data.toISOString(),
            instagram: agendamento.instagram,
            facebook: agendamento.facebook,
            linkedin: agendamento.linkedin,
            x: agendamento.x,
            stories: agendamento.stories,
            reels: agendamento.reels,
            postNormal: agendamento.postNormal,
            diario: agendamento.diario,
            semanal: agendamento.semanal,
            randomizar: agendamento.randomizar,
            tratarComoPostagensIndividuais: agendamento.tratarComoPostagensIndividuais,
            tokenExpired,
            instagramAccountId: instagramAccount.providerAccountId,
            instagramAccessToken: instagramAccount.access_token,
            igUserId: instagramAccount.igUserId,
            igUsername: instagramAccount.igUsername,
        };
        // Se for para tratar como postagens individuais, adiciona apenas uma mídia
        if (agendamento.tratarComoPostagensIndividuais && midia) {
            webhookData.midiaUrl = correctMinioUrl(midia.url);
            webhookData.midiaMimeType = midia.mime_type;
            webhookData.midiaThumbnailUrl = midia.thumbnail_url ? correctMinioUrl(midia.thumbnail_url) : null;
        }
        else if (allMidias && allMidias.length > 0) {
            // Se não for para tratar como postagens individuais, adiciona todas as mídias
            webhookData.midias = allMidias.map(m => ({
                url: correctMinioUrl(m.url),
                mime_type: m.mime_type,
                thumbnail_url: m.thumbnail_url ? correctMinioUrl(m.thumbnail_url) : null,
            }));
            // Mantém também o campo midiaUrl para compatibilidade, usando a primeira mídia
            webhookData.midiaUrl = correctMinioUrl(allMidias[0].url);
            webhookData.midiaMimeType = allMidias[0].mime_type;
            webhookData.midiaThumbnailUrl = allMidias[0].thumbnail_url ? correctMinioUrl(allMidias[0].thumbnail_url) : null;
        }
        // Log dos dados do webhook
        if (agendamento.tratarComoPostagensIndividuais) {
            console.log(`[AgendamentoService] Webhook preparado para agendamento ${agendamentoId} (postagem individual):`, {
                id: webhookData.id,
                midiaUrl: webhookData.midiaUrl,
                midiaMimeType: webhookData.midiaMimeType,
                stories: webhookData.stories,
                reels: webhookData.reels,
                postNormal: webhookData.postNormal,
            });
        }
        else {
            console.log(`[AgendamentoService] Webhook preparado para agendamento ${agendamentoId} (carrossel):`, {
                id: webhookData.id,
                totalMidias: webhookData.midias?.length || 0,
                stories: webhookData.stories,
                reels: webhookData.reels,
                postNormal: webhookData.postNormal,
            });
        }
        return webhookData;
    }
    catch (error) {
        console.error("[AgendamentoService] Erro ao preparar dados para webhook:", error);
        throw error;
    }
}
