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

  console.log(`🔄 Iniciando backup simples...`);
  console.log(`📅 Data/Hora: ${timestamp}`);

  try {
    const backup = {
      metadata: {
        created_at: new Date().toISOString(),
        database: 'faceapp',
        version: '1.0.0',
        backup_type: 'simple'
      },
      data: {
        // Tabelas principais
        users: await prisma.user.findMany(),
        accounts: await prisma.account.findMany(),
        automacoes: await prisma.automacao.findMany(),
        leads: await prisma.lead.findMany(),
        leadAutomacao: await prisma.leadAutomacao.findMany(),
        pastas: await prisma.pasta.findMany(),
        
        // Chatwit
        usuariosChatwit: await prisma.usuarioChatwit.findMany(),
        leadsChatwit: await prisma.leadChatwit.findMany(),
        arquivosLeadChatwit: await prisma.arquivoLeadChatwit.findMany(),
        
        // Configurações
        whatsAppConfigs: await prisma.whatsAppConfig.findMany(),
        whatsAppTemplates: await prisma.whatsAppTemplate.findMany(),
        
        // Espelhos
        espelhosBiblioteca: await prisma.espelhoBiblioteca.findMany(),
        espelhosPadrao: await prisma.espelhoPadrao.findMany(),
        
        // MTF Diamante
        mtfDiamanteConfigs: await prisma.mtfDiamanteConfig.findMany(),
        mtfDiamanteLotes: await prisma.mtfDiamanteLote.findMany(),
        mtfDiamanteIntentMappings: await prisma.mtfDiamanteIntentMapping.findMany(),
        disparosMtfDiamante: await prisma.disparoMtfDiamante.findMany(),
        
        // Outros
        subscriptions: await prisma.subscription.findMany(),
        notifications: await prisma.notification.findMany(),
        agendamentos: await prisma.agendamento.findMany(),
        midias: await prisma.midia.findMany(),
        chats: await prisma.chat.findMany(),
        messages: await prisma.message.findMany()
      }
    };

    // Calcular estatísticas
    const totalRecords = Object.values(backup.data).reduce((sum, table: any) => sum + table.length, 0);
    
    console.log(`📊 Estatísticas do backup:`);
    for (const [tableName, tableData] of Object.entries(backup.data)) {
      console.log(`  ${tableName}: ${(tableData as any[]).length} registros`);
    }
    console.log(`  Total: ${totalRecords} registros`);

    // Salvar backup
    const fileName = `backup_simple_${timestamp}.json`;
    const filePath = join(backupDir, fileName);
    
    writeFileSync(filePath, JSON.stringify(backup, null, 2));
    
    console.log(`💾 Backup salvo: ${filePath}`);
    console.log(`✅ Backup concluído com sucesso!`);
    
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