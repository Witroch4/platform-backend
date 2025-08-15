import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';
import { createLogger } from '@/lib/utils/logger';
import { Prisma } from '@prisma/client';

const prisma = getPrismaInstance();
const logger = createLogger('SocialWise-Rollback-Config');

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { inboxId, historyId } = body;

    if (!inboxId || !historyId) {
      return NextResponse.json({ 
        error: 'inboxId e historyId são obrigatórios' 
      }, { status: 400 });
    }

    // Find the ChatwitInbox by inboxId
    const chatwitInbox = await prisma.chatwitInbox.findFirst({
      where: { 
        inboxId: inboxId,
        usuarioChatwit: {
          appUserId: session.user.id
        }
      }
    });

    if (!chatwitInbox) {
      return NextResponse.json({ error: 'Inbox não encontrada' }, { status: 404 });
    }

    // Find the history entry to rollback to
    const historyEntry = await prisma.inboxConfigHistory.findFirst({
      where: {
        id: historyId,
        inboxId: chatwitInbox.id
      }
    });

    if (!historyEntry) {
      return NextResponse.json({ error: 'Entrada de histórico não encontrada' }, { status: 404 });
    }

    // Get the config to rollback to
    let rollbackConfig;
    try {
      rollbackConfig = typeof historyEntry.previousConfig === 'string' 
        ? JSON.parse(historyEntry.previousConfig)
        : historyEntry.previousConfig;
    } catch (e) {
      return NextResponse.json({ error: 'Configuração de rollback inválida' }, { status: 400 });
    }

    if (!rollbackConfig) {
      return NextResponse.json({ error: 'Não há configuração anterior para restaurar' }, { status: 400 });
    }

    // Get current config for history
    const currentConfigData = {
      inheritFromAgent: chatwitInbox.socialwiseInheritFromAgent,
      reasoningEffort: chatwitInbox.socialwiseReasoningEffort,
      verbosity: chatwitInbox.socialwiseVerbosity,
      temperature: chatwitInbox.socialwiseTemperature,
      tempSchema: chatwitInbox.socialwiseTempSchema,
      warmupDeadlineMs: chatwitInbox.socialwiseWarmupDeadlineMs,
      hardDeadlineMs: chatwitInbox.socialwiseHardDeadlineMs,
      softDeadlineMs: chatwitInbox.socialwiseSoftDeadlineMs,
      shortTitleLLM: chatwitInbox.socialwiseShortTitleLLM,
      toolChoice: chatwitInbox.socialwiseToolChoice
    };

    // Update the configuration with rollback values
    const updatedConfig = await prisma.chatwitInbox.update({
      where: { id: chatwitInbox.id },
      data: {
        socialwiseInheritFromAgent: rollbackConfig.inheritFromAgent ?? true,
        socialwiseReasoningEffort: rollbackConfig.inheritFromAgent ? null : rollbackConfig.reasoningEffort,
        socialwiseVerbosity: rollbackConfig.inheritFromAgent ? null : rollbackConfig.verbosity,
        socialwiseTemperature: rollbackConfig.inheritFromAgent ? null : rollbackConfig.temperature,
        socialwiseTempSchema: rollbackConfig.inheritFromAgent ? null : rollbackConfig.tempSchema,
        socialwiseWarmupDeadlineMs: rollbackConfig.inheritFromAgent ? null : rollbackConfig.warmupDeadlineMs,
        socialwiseHardDeadlineMs: rollbackConfig.inheritFromAgent ? null : rollbackConfig.hardDeadlineMs,
        socialwiseSoftDeadlineMs: rollbackConfig.inheritFromAgent ? null : rollbackConfig.softDeadlineMs,
        socialwiseShortTitleLLM: rollbackConfig.inheritFromAgent ? null : rollbackConfig.shortTitleLLM,
        socialwiseToolChoice: rollbackConfig.inheritFromAgent ? null : rollbackConfig.toolChoice
      }
    });

    // Create history entry for the rollback
    await prisma.inboxConfigHistory.create({
      data: {
        inboxId: chatwitInbox.id,
        userId: session.user.id,
        changeType: 'rollback',
        previousConfig: JSON.stringify(currentConfigData),
        newConfig: JSON.stringify(rollbackConfig),
        description: `Rollback para configuração do histórico ${historyId}`
      }
    });

    logger.info('Rollback de configuração executado', { 
      userId: session.user.id, 
      inboxId,
      historyId,
      rolledBackTo: rollbackConfig
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Configuração restaurada com sucesso',
      rolledBackTo: historyId,
      config: {
        inheritFromAgent: updatedConfig.socialwiseInheritFromAgent,
        reasoningEffort: updatedConfig.socialwiseReasoningEffort,
        verbosity: updatedConfig.socialwiseVerbosity,
        temperature: updatedConfig.socialwiseTemperature,
        tempSchema: updatedConfig.socialwiseTempSchema,
        warmupDeadlineMs: updatedConfig.socialwiseWarmupDeadlineMs,
        hardDeadlineMs: updatedConfig.socialwiseHardDeadlineMs,
        softDeadlineMs: updatedConfig.socialwiseSoftDeadlineMs,
        shortTitleLLM: updatedConfig.socialwiseShortTitleLLM,
        toolChoice: updatedConfig.socialwiseToolChoice
      }
    });

  } catch (error: any) {
    logger.error('Erro ao fazer rollback da configuração', error);
    return NextResponse.json({ 
      error: 'Erro interno do servidor', 
      details: error.message 
    }, { status: 500 });
  }
}