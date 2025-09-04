// Debug específico para loadAssistantConfiguration
import { PrismaClient } from '@prisma/client';

async function debugLoadAssistantConfiguration() {
  const prisma = new PrismaClient();
  const inboxId = '4';
  
  console.log('🔍 Debug: loadAssistantConfiguration para inbox', inboxId);
  
  try {
    // Primeiro: buscar assistant via getAssistantForInbox (simulado)
    const inbox = await prisma.chatwitInbox.findFirst({
      where: { inboxId },
      include: {
        usuarioChatwit: true,
        aiAssistantLinks: {
          include: {
            assistant: { select: { id: true, model: true, instructions: true, updatedAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    
    console.log('📦 Inbox encontrada:', !!inbox);
    
    const linked = inbox?.aiAssistantLinks;
    let assistant = null;
    
    if (linked && linked.length > 0 && linked[0]?.assistant) {
      const a = linked[0].assistant;
      assistant = { id: a.id, model: a.model, instructions: a.instructions };
      console.log('✅ Assistant básico encontrado:', assistant);
    }
    
    if (!assistant) {
      console.log('❌ No assistant found');
      return null;
    }

    // Segundo: buscar configuração completa do assistant
    console.log('🔍 Buscando configuração completa do assistant:', assistant.id);
    
    const fullAssistant = await prisma.aiAssistant.findFirst({
      where: { 
        id: assistant.id,
        isActive: true 
      },
      select: {
        id: true,
        model: true,
        instructions: true,
        reasoningEffort: true,
        verbosity: true,
        temperature: true,
        topP: true,
        tempSchema: true,
        tempCopy: true,
        maxOutputTokens: true,
        warmupDeadlineMs: true,
        hardDeadlineMs: true,
        softDeadlineMs: true,
        shortTitleLLM: true,
        toolChoice: true,
        embedipreview: true
      }
    });

    console.log('🤖 Full assistant:', {
      found: !!fullAssistant,
      id: fullAssistant?.id,
      model: fullAssistant?.model,
      isActive: 'checking...'
    });

    if (!fullAssistant) {
      console.log('❌ Full assistant configuration not found');
      return null;
    }

    // Terceiro: buscar configuração da inbox
    console.log('🔍 Buscando configuração da inbox...');
    
    const inboxConfig = await prisma.chatwitInbox.findFirst({
      where: { inboxId },
      select: {
        socialwiseInheritFromAgent: true,
        socialwiseReasoningEffort: true,
        socialwiseVerbosity: true,
        socialwiseTemperature: true,
        socialwiseTempSchema: true,
        socialwiseWarmupDeadlineMs: true,
        socialwiseHardDeadlineMs: true,
        socialwiseSoftDeadlineMs: true,
        socialwiseShortTitleLLM: true,
        socialwiseToolChoice: true
      }
    });
    
    console.log('📥 Inbox config:', {
      found: !!inboxConfig,
      inheritFromAgent: inboxConfig?.socialwiseInheritFromAgent
    });

    // Quarto: construir configuração final
    const inheritFromAgent = inboxConfig?.socialwiseInheritFromAgent ?? true;
    
    const finalConfig = {
      model: fullAssistant.model,
      instructions: fullAssistant.instructions || '',
      developer: fullAssistant.instructions || '',
      embedipreview: fullAssistant.embedipreview,
      reasoningEffort: inheritFromAgent 
        ? fullAssistant.reasoningEffort 
        : (inboxConfig?.socialwiseReasoningEffort || fullAssistant.reasoningEffort),
      verbosity: inheritFromAgent 
        ? fullAssistant.verbosity 
        : (inboxConfig?.socialwiseVerbosity || fullAssistant.verbosity),
      temperature: inheritFromAgent 
        ? fullAssistant.temperature 
        : (inboxConfig?.socialwiseTemperature || fullAssistant.temperature),
      tempSchema: inheritFromAgent 
        ? fullAssistant.tempSchema 
        : (inboxConfig?.socialwiseTempSchema || fullAssistant.tempSchema),
      tempCopy: fullAssistant.tempCopy,
      maxOutputTokens: fullAssistant.maxOutputTokens,
      warmupDeadlineMs: inheritFromAgent 
        ? fullAssistant.warmupDeadlineMs 
        : (inboxConfig?.socialwiseWarmupDeadlineMs || fullAssistant.warmupDeadlineMs),
      hardDeadlineMs: inheritFromAgent 
        ? fullAssistant.hardDeadlineMs 
        : (inboxConfig?.socialwiseHardDeadlineMs || fullAssistant.hardDeadlineMs),
      softDeadlineMs: inheritFromAgent 
        ? fullAssistant.softDeadlineMs 
        : (inboxConfig?.socialwiseSoftDeadlineMs || fullAssistant.softDeadlineMs),
      shortTitleLLM: inheritFromAgent 
        ? fullAssistant.shortTitleLLM 
        : (inboxConfig?.socialwiseShortTitleLLM ?? fullAssistant.shortTitleLLM),
      toolChoice: inheritFromAgent 
        ? fullAssistant.toolChoice 
        : (inboxConfig?.socialwiseToolChoice || fullAssistant.toolChoice),
      inheritFromAgent
    };

    console.log('🎯 Configuração final:', {
      assistantId: fullAssistant.id,
      inheritFromAgent,
      warmupDeadlineMs: finalConfig.warmupDeadlineMs,
      hardDeadlineMs: finalConfig.hardDeadlineMs,
      softDeadlineMs: finalConfig.softDeadlineMs,
      model: finalConfig.model,
      reasoningEffort: finalConfig.reasoningEffort,
      verbosity: finalConfig.verbosity,
      embedipreview: finalConfig.embedipreview
    });

    return finalConfig;
    
  } catch (error) {
    console.error('❌ Erro na loadAssistantConfiguration:', error);
    return null;
  }
}

debugLoadAssistantConfiguration()
  .then(result => {
    console.log('🏁 Resultado final:', !!result ? 'SUCCESS' : 'FAILED');
    if (result) {
      console.log('📋 Config:', result);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });
