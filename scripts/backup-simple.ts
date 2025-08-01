#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';

const prisma = new PrismaClient();

async function simpleBackup() {
  const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
  const backupDir = join(process.cwd(), 'backups');
  
  // Criar diretório se não existir
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  console.log(`🔄 Iniciando backup completo...`);
  console.log(`📅 Data/Hora: ${timestamp}`);

  try {
    const backup = {
      metadata: {
        created_at: new Date().toISOString(),
        database: 'faceapp',
        version: '1.1.0',
        backup_type: 'complete',
        description: 'Backup completo incluindo leads, espelhos e todas as tabelas relacionadas'
      },
      data: {
        // === USUÁRIOS E CONTAS ===
        users: await prisma.user.findMany(),
        accounts: await prisma.account.findMany(),
        
        // === AUTOMAÇÕES E LEADS ===
        automacoes: await prisma.automacao.findMany(),
        leads: await prisma.lead.findMany(),
        leadAutomacao: await prisma.leadAutomacao.findMany(),
        pastas: await prisma.pasta.findMany(),
        
        // === CHATWIT - SISTEMA PRINCIPAL ===
        usuariosChatwit: await prisma.usuarioChatwit.findMany(),
        leadsChatwit: await prisma.leadChatwit.findMany(),
        arquivosLeadChatwit: await prisma.arquivoLeadChatwit.findMany(),
        
        // === ESPELHOS - SISTEMA DE CORREÇÃO ===
        espelhosBiblioteca: await prisma.espelhoBiblioteca.findMany(),
        espelhosPadrao: await prisma.espelhoPadrao.findMany(),
        
        // === WHATSAPP E COMUNICAÇÃO ===
        whatsAppConfigs: await prisma.whatsAppGlobalConfig.findMany(),
        templates: await prisma.template.findMany(),
        
        // === MTF DIAMANTE ===
        mtfDiamanteConfigs: await prisma.mtfDiamanteConfig.findMany(),
        mtfDiamanteLotes: await prisma.mtfDiamanteLote.findMany(),
        mtfDiamanteIntentMappings: await prisma.mtfDiamanteIntentMapping.findMany(),
        disparosMtfDiamante: await prisma.disparoMtfDiamante.findMany(),
        
        // === OAB E LOTES ===
        lotesOab: await prisma.loteOab.findMany(),
        leadsOab: await prisma.leadOab.findMany(),
        
        // === MENSAGENS INTERATIVAS ===
        mensagensInterativas: await prisma.mensagemInterativa.findMany(),
        botoesMensagem: await prisma.botaoMensagem.findMany(),
        
        // === CAIXA DE ENTRADA ===
        chatwitInboxes: await prisma.chatwitInbox.findMany(),
        
        // === AGENTES DIALOGFLOW ===
        agentesDialogflow: await prisma.agenteDialogflow.findMany(),
        
        // === MAPEAMENTOS DE INTENÇÃO ===
        mapeamentosIntencao: await prisma.mapeamentoIntencao.findMany(),
        
        // === MODELOS DE RECURSO ===
        modelosRecurso: await prisma.modeloRecurso.findMany(),
        
        // === CHAT E IA ===
        chatSessions: await prisma.chatSession.findMany(),
        chatMessages: await prisma.chatMessage.findMany(),
        chatFiles: await prisma.chatFile.findMany(),
        generatedImages: await prisma.generatedImage.findMany(),
        
        // === OUTROS SISTEMAS ===
        subscriptions: await prisma.subscription.findMany(),
        notifications: await prisma.notification.findMany(),
        agendamentos: await prisma.agendamento.findMany(),
        midias: await prisma.midia.findMany(),
        chats: await prisma.chat.findMany(),
        messages: await prisma.message.findMany(),
        
        // === TOKENS E AUTENTICAÇÃO ===
        verificationTokens: await prisma.verificationToken.findMany(),
        twoFactorTokens: await prisma.twoFactorToken.findMany(),
        resetPasswordTokens: await prisma.resetPasswordToken.findMany()
      }
    };

    // Calcular estatísticas detalhadas
    const totalRecords = Object.values(backup.data).reduce((sum, table: any) => sum + table.length, 0);
    
    console.log(`📊 Estatísticas do backup completo:`);
    console.log(`\n=== USUÁRIOS E CONTAS ===`);
    console.log(`  users: ${backup.data.users.length} registros`);
    console.log(`  accounts: ${backup.data.accounts.length} registros`);
    
    console.log(`\n=== AUTOMAÇÕES E LEADS ===`);
    console.log(`  automacoes: ${backup.data.automacoes.length} registros`);
    console.log(`  leads: ${backup.data.leads.length} registros`);
    console.log(`  leadAutomacao: ${backup.data.leadAutomacao.length} registros`);
    console.log(`  pastas: ${backup.data.pastas.length} registros`);
    
    console.log(`\n=== CHATWIT ===`);
    console.log(`  usuariosChatwit: ${backup.data.usuariosChatwit.length} registros`);
    console.log(`  leadsChatwit: ${backup.data.leadsChatwit.length} registros`);
    console.log(`  arquivosLeadChatwit: ${backup.data.arquivosLeadChatwit.length} registros`);
    
    console.log(`\n=== ESPELHOS ===`);
    console.log(`  espelhosBiblioteca: ${backup.data.espelhosBiblioteca.length} registros`);
    console.log(`  espelhosPadrao: ${backup.data.espelhosPadrao.length} registros`);
    
    console.log(`\n=== WHATSAPP ===`);
    console.log(`  whatsAppConfigs: ${backup.data.whatsAppConfigs.length} registros`);
    console.log(`  templates: ${backup.data.templates.length} registros`);
    
    console.log(`\n=== MTF DIAMANTE ===`);
    console.log(`  mtfDiamanteConfigs: ${backup.data.mtfDiamanteConfigs.length} registros`);
    console.log(`  mtfDiamanteLotes: ${backup.data.mtfDiamanteLotes.length} registros`);
    console.log(`  mtfDiamanteIntentMappings: ${backup.data.mtfDiamanteIntentMappings.length} registros`);
    console.log(`  disparosMtfDiamante: ${backup.data.disparosMtfDiamante.length} registros`);
    
    console.log(`\n=== OAB ===`);
    console.log(`  lotesOab: ${backup.data.lotesOab.length} registros`);
    console.log(`  leadsOab: ${backup.data.leadsOab.length} registros`);
    
    console.log(`\n=== MENSAGENS ===`);
    console.log(`  mensagensInterativas: ${backup.data.mensagensInterativas.length} registros`);
    console.log(`  botoesMensagem: ${backup.data.botoesMensagem.length} registros`);
    
    console.log(`\n=== OUTROS ===`);
    console.log(`  chatwitInboxes: ${backup.data.chatwitInboxes.length} registros`);
    console.log(`  agentesDialogflow: ${backup.data.agentesDialogflow.length} registros`);
    console.log(`  mapeamentosIntencao: ${backup.data.mapeamentosIntencao.length} registros`);
    console.log(`  modelosRecurso: ${backup.data.modelosRecurso.length} registros`);
    console.log(`  chatSessions: ${backup.data.chatSessions.length} registros`);
    console.log(`  chatMessages: ${backup.data.chatMessages.length} registros`);
    console.log(`  chatFiles: ${backup.data.chatFiles.length} registros`);
    console.log(`  generatedImages: ${backup.data.generatedImages.length} registros`);
    console.log(`  subscriptions: ${backup.data.subscriptions.length} registros`);
    console.log(`  notifications: ${backup.data.notifications.length} registros`);
    console.log(`  agendamentos: ${backup.data.agendamentos.length} registros`);
    console.log(`  midias: ${backup.data.midias.length} registros`);
    console.log(`  chats: ${backup.data.chats.length} registros`);
    console.log(`  messages: ${backup.data.messages.length} registros`);
    
    console.log(`\n📈 Total: ${totalRecords} registros`);

    // Salvar backup
    const fileName = `backup_complete_${timestamp}.json`;
    const filePath = join(backupDir, fileName);
    
    writeFileSync(filePath, JSON.stringify(backup, null, 2));
    
    console.log(`\n💾 Backup salvo: ${filePath}`);
    console.log(`✅ Backup completo concluído com sucesso!`);
    
  } catch (error) {
    console.error(`❌ Erro durante o backup:`, error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  simpleBackup().catch(console.error);
}

export { simpleBackup }; 