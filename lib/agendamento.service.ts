import { prisma } from '@/lib/prisma';
import type { Agendamento, Midia } from '@prisma/client';
import { uploadToMinIO } from './minio';
import { scheduleAgendamentoJob, cancelAgendamentoJob } from '@/lib/queue/agendamento.queue';

/**
 * Interface para criação de um agendamento
 */
export interface CreateAgendamentoDTO {
  userId: string;
  accountId: string;
  Data: Date;
  Descricao?: string;
  Facebook?: boolean;
  Instagram?: boolean;
  Linkedin?: boolean;
  X?: boolean;
  Stories?: boolean;
  Reels?: boolean;
  PostNormal?: boolean;
  Diario?: boolean;
  Semanal?: boolean;
  Randomizar?: boolean;
  TratarComoUnicoPost?: boolean;
  TratarComoPostagensIndividuais?: boolean;
  midias: Array<{
    buffer: Buffer | ArrayBuffer;
    fileName: string;
    mimeType: string;
    url?: string; // URL opcional, caso o arquivo já tenha sido enviado
    thumbnail_url?: string; // URL da thumbnail, caso já tenha sido gerada
  }>;
}

/**
 * Interface para atualização de um agendamento
 */
export interface UpdateAgendamentoDTO {
  Data?: Date;
  Descricao?: string;
  Facebook?: boolean;
  Instagram?: boolean;
  Linkedin?: boolean;
  X?: boolean;
  Stories?: boolean;
  Reels?: boolean;
  PostNormal?: boolean;
  Diario?: boolean;
  Semanal?: boolean;
  Randomizar?: boolean;
  TratarComoUnicoPost?: boolean;
  TratarComoPostagensIndividuais?: boolean;
  midias?: Array<{
    id?: string;
    url: string;
    mime_type: string;
    thumbnail_url?: string;
  }>;
}

/**
 * Cria um novo agendamento
 */
export async function createAgendamento(data: CreateAgendamentoDTO): Promise<Agendamento> {
  try {
    // Cria o agendamento no banco de dados
    const agendamento = await prisma.agendamento.create({
      data: {
        userId: data.userId,
        accountId: data.accountId,
        Data: data.Data,
        Descricao: data.Descricao,
        Facebook: data.Facebook || false,
        Instagram: data.Instagram || false,
        Linkedin: data.Linkedin || false,
        X: data.X || false,
        Stories: data.Stories || false,
        Reels: data.Reels || false,
        PostNormal: data.PostNormal || false,
        Diario: data.Diario || false,
        Semanal: data.Semanal || false,
        Randomizar: data.Randomizar || false,
        TratarComoUnicoPost: data.TratarComoUnicoPost || false,
        TratarComoPostagensIndividuais: data.TratarComoPostagensIndividuais || false,
      },
    });

    console.log(`[AgendamentoService] Agendamento criado: ${agendamento.id}`);

    // Processa e salva as mídias
    const midiasPromises = data.midias.map(async (midia) => {
      let url = midia.url;
      const thumbnail_url = midia.thumbnail_url;

      // Se não tiver URL, faz upload para o MinIO
      if (!url) {
        const uploadResult = await uploadToMinIO(midia.buffer, midia.fileName, midia.mimeType);
        url = uploadResult.url;
        // Não temos thumbnail automática no upload atual
      }

      // Cria o registro da mídia no banco
      return prisma.midia.create({
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
    await scheduleAgendamentoJob({
      id: agendamento.id,
      Data: agendamento.Data,
      userId: agendamento.userId,
      accountId: agendamento.accountId,
      Diario: agendamento.Diario,
      Semanal: agendamento.Semanal,
    });

    return agendamento;
  } catch (error) {
    console.error('[AgendamentoService] Erro ao criar agendamento:', error);
    throw error;
  }
}

/**
 * Infere o tipo MIME a partir da URL ou extensão do arquivo
 */
function inferMimeTypeFromUrl(url: string): string {
  // Extrai a extensão do arquivo da URL
  const extension = url.split('.').pop()?.toLowerCase();

  // Mapeamento de extensões comuns para tipos MIME
  const mimeTypes: Record<string, string> = {
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
export async function getAgendamentoById(id: string): Promise<Agendamento | null> {
  try {
    return await prisma.agendamento.findUnique({
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
  } catch (error) {
    console.error("[AgendamentoService] Erro ao buscar agendamento:", error);
    throw error;
  }
}

/**
 * Busca agendamentos por usuário
 */
export async function getAgendamentosByUser(userId: string): Promise<Agendamento[]> {
  try {
    return await prisma.agendamento.findMany({
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
        Data: 'asc',
      },
    });
  } catch (error) {
    console.error("[AgendamentoService] Erro ao buscar agendamentos do usuário:", error);
    throw error;
  }
}

/**
 * Busca agendamentos por conta
 */
export async function getAgendamentosByAccount(accountId: string): Promise<Agendamento[]> {
  try {
    return await prisma.agendamento.findMany({
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
        Data: 'asc',
      },
    });
  } catch (error) {
    console.error("[AgendamentoService] Erro ao buscar agendamentos da conta:", error);
    throw error;
  }
}

/**
 * Atualiza um agendamento
 */
export async function updateAgendamento(id: string, data: UpdateAgendamentoDTO): Promise<Agendamento> {
  try {
    // Busca o agendamento atual
    const existingAgendamento = await prisma.agendamento.findUnique({
      where: { id },
      include: { midias: true },
    });

    if (!existingAgendamento) {
      throw new Error(`Agendamento não encontrado: ${id}`);
    }

    // Prepara os dados para atualização
    const updateData: any = {};

    // Atualiza apenas os campos fornecidos
    if (data.Data !== undefined) updateData.Data = data.Data;
    if (data.Descricao !== undefined) updateData.Descricao = data.Descricao;
    if (data.Facebook !== undefined) updateData.Facebook = data.Facebook;
    if (data.Instagram !== undefined) updateData.Instagram = data.Instagram;
    if (data.Linkedin !== undefined) updateData.Linkedin = data.Linkedin;
    if (data.X !== undefined) updateData.X = data.X;
    if (data.Stories !== undefined) updateData.Stories = data.Stories;
    if (data.Reels !== undefined) updateData.Reels = data.Reels;
    if (data.PostNormal !== undefined) updateData.PostNormal = data.PostNormal;
    if (data.Diario !== undefined) updateData.Diario = data.Diario;
    if (data.Semanal !== undefined) updateData.Semanal = data.Semanal;
    if (data.Randomizar !== undefined) updateData.Randomizar = data.Randomizar;
    if (data.TratarComoUnicoPost !== undefined) updateData.TratarComoUnicoPost = data.TratarComoUnicoPost;
    if (data.TratarComoPostagensIndividuais !== undefined) updateData.TratarComoPostagensIndividuais = data.TratarComoPostagensIndividuais;

    // Atualiza o agendamento
    const updatedAgendamento = await prisma.agendamento.update({
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
      const midiasToKeepIds = midiasToKeep.map((m) => m.id!);

      // Remove mídias que não estão na lista de mídias a manter
      await prisma.midia.deleteMany({
        where: {
          agendamentoId: id,
          id: { notIn: midiasToKeepIds },
        },
      });

      // Adiciona novas mídias
      const newMidias = data.midias.filter((m) => !m.id);
      for (const midia of newMidias) {
        await prisma.midia.create({
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
      await cancelAgendamentoJob(id);

      // Agenda um novo job com a nova data
      await scheduleAgendamentoJob({
        id: updatedAgendamento.id,
        Data: updatedAgendamento.Data,
        userId: updatedAgendamento.userId,
        accountId: updatedAgendamento.accountId,
        Diario: updatedAgendamento.Diario,
        Semanal: updatedAgendamento.Semanal,
      });
    }

    return updatedAgendamento;
  } catch (error) {
    console.error('[AgendamentoService] Erro ao atualizar agendamento:', error);
    throw error;
  }
}

/**
 * Exclui um agendamento
 */
export async function deleteAgendamento(id: string): Promise<void> {
  try {
    // Cancela o job na fila
    await cancelAgendamentoJob(id);

    // Exclui o agendamento (as mídias serão excluídas em cascata)
    await prisma.agendamento.delete({
      where: { id },
    });

    console.log(`[AgendamentoService] Agendamento ${id} excluído com sucesso`);
  } catch (error) {
    console.error(`[AgendamentoService] Erro ao excluir agendamento ${id}:`, error);
    throw error;
  }
}

/**
 * Seleciona uma mídia para envio com base na lógica de contadores
 */
export async function selectMidiaForSending(agendamentoId: string): Promise<Midia | null> {
  try {
    // Busca o agendamento com suas mídias
    const agendamento = await prisma.agendamento.findUnique({
      where: { id: agendamentoId },
      include: { midias: true },
    });

    if (!agendamento || agendamento.midias.length === 0) {
      console.log("[AgendamentoService] Agendamento não encontrado ou sem mídias:", agendamentoId);
      return null;
    }

    console.log(`[AgendamentoService] Agendamento ${agendamentoId} tem ${agendamento.midias.length} mídias. TratarComoPostagensIndividuais: ${agendamento.TratarComoPostagensIndividuais}, Randomizar: ${agendamento.Randomizar}`);

    let selectedMidia: Midia | null = null;

    // Se for para tratar como postagens individuais, seleciona com base no contador
    if (agendamento.TratarComoPostagensIndividuais) {
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
        await prisma.midia.update({
          where: { id: selectedMidia.id },
          data: { contador: { increment: 1 } },
        });

        console.log(`[AgendamentoService] Incrementado contador da mídia ${selectedMidia.id} para ${selectedMidia.contador + 1}`);

        // Atualiza o objeto com o novo valor do contador
        selectedMidia.contador += 1;
      }
    } else if (agendamento.Randomizar) {
      // Se for apenas para randomizar (sem tratar como postagens individuais),
      // seleciona uma mídia aleatoriamente sem incrementar contador
      selectedMidia = agendamento.midias[Math.floor(Math.random() * agendamento.midias.length)];
      console.log(`[AgendamentoService] Selecionada mídia aleatória ${selectedMidia?.id} (sem incrementar contador)`);
    } else {
      // Se não for para randomizar nem tratar como postagens individuais,
      // retorna a primeira mídia (o webhook tratará como um único post)
      selectedMidia = agendamento.midias[0];
      console.log(`[AgendamentoService] Selecionada primeira mídia ${selectedMidia?.id} (sem randomização)`);
    }

    console.log("[AgendamentoService] Mídia selecionada:", selectedMidia?.id);
    return selectedMidia;
  } catch (error) {
    console.error("[AgendamentoService] Erro ao selecionar mídia para envio:", error);
    throw error;
  }
}

/**
 * Função para corrigir a URL do MinIO
 */
function correctMinioUrl(url: string): string {
  // Substitui objstore.witdev.com.br por objstoreapi.witdev.com.br
  return url.replace('objstore.witdev.com.br', 'objstoreapi.witdev.com.br');
}

/**
 * Prepara os dados para envio ao webhook
 */
export async function prepareWebhookData(agendamentoId: string): Promise<any> {
  try {
    // Busca o agendamento com suas mídias
    const agendamento = await prisma.agendamento.findUnique({
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
    if (agendamento.TratarComoPostagensIndividuais) {
      midia = await selectMidiaForSending(agendamentoId);
      if (!midia) {
        throw new Error(`Nenhuma mídia disponível para o agendamento: ${agendamentoId}`);
      }
      console.log(`[AgendamentoService] Preparando webhook para agendamento ${agendamentoId} com mídia única ${midia.id}`);
    } else {
      // Se não for para tratar como postagens individuais, envia todas as mídias
      allMidias = agendamento.midias;
      console.log(`[AgendamentoService] Preparando webhook para agendamento ${agendamentoId} com ${allMidias.length} mídias para carrossel`);
    }

    // Prepara os dados para o webhook
    const webhookData: any = {
      id: agendamento.id,
      userId: agendamento.userId,
      userName: agendamento.user.name,
      userEmail: agendamento.user.email,
      descricao: agendamento.Descricao,
      data: agendamento.Data.toISOString(),
      instagram: agendamento.Instagram,
      facebook: agendamento.Facebook,
      linkedin: agendamento.Linkedin,
      x: agendamento.X,
      stories: agendamento.Stories,
      reels: agendamento.Reels,
      postNormal: agendamento.PostNormal,
      diario: agendamento.Diario,
      semanal: agendamento.Semanal,
      randomizar: agendamento.Randomizar,
      tratarComoPostagensIndividuais: agendamento.TratarComoPostagensIndividuais,
      tokenExpired,
      instagramAccountId: instagramAccount.providerAccountId,
      instagramAccessToken: instagramAccount.access_token,
      igUserId: instagramAccount.igUserId,
      igUsername: instagramAccount.igUsername,
    };

    // Se for para tratar como postagens individuais, adiciona apenas uma mídia
    if (agendamento.TratarComoPostagensIndividuais && midia) {
      webhookData.midiaUrl = correctMinioUrl(midia.url);
      webhookData.midiaMimeType = midia.mime_type;
      webhookData.midiaThumbnailUrl = midia.thumbnail_url ? correctMinioUrl(midia.thumbnail_url) : null;
    } else if (allMidias && allMidias.length > 0) {
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
    if (agendamento.TratarComoPostagensIndividuais) {
      console.log(`[AgendamentoService] Webhook preparado para agendamento ${agendamentoId} (postagem individual):`, {
        id: webhookData.id,
        midiaUrl: webhookData.midiaUrl,
        midiaMimeType: webhookData.midiaMimeType,
        stories: webhookData.stories,
        reels: webhookData.reels,
        postNormal: webhookData.postNormal,
      });
    } else {
      console.log(`[AgendamentoService] Webhook preparado para agendamento ${agendamentoId} (carrossel):`, {
        id: webhookData.id,
        totalMidias: webhookData.midias?.length || 0,
        stories: webhookData.stories,
        reels: webhookData.reels,
        postNormal: webhookData.postNormal,
      });
    }

    return webhookData;
  } catch (error) {
    console.error("[AgendamentoService] Erro ao preparar dados para webhook:", error);
    throw error;
  }
}