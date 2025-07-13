#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function restoreAmandaData() {
  console.log('🔄 Iniciando restauração dos dados da Dra Amanda...');

  try {
    // Ler o backup mais recente
    const backupPath = join(process.cwd(), 'backups', 'backup_simple_2025-07-12_18-25-34.json');
    const backupData = JSON.parse(readFileSync(backupPath, 'utf-8'));
    
    console.log('📖 Backup carregado com sucesso');

    // Buscar o usuário Amanda no banco atual
    const amanda = await prisma.user.findUnique({
      where: { email: 'amandasousa22.adv@gmail.com' }
    });

    if (!amanda) {
      throw new Error('Usuário Amanda não encontrado no banco');
    }

    console.log('👤 Usuário Amanda encontrado:', amanda.id);

    // Buscar o UsuarioChatwit da Amanda no backup
    const amandaChatwitBackup = backupData.data.usuariosChatwit.find(
      (u: any) => u.name === 'DraAmandaSousa'
    );

    if (!amandaChatwitBackup) {
      throw new Error('Dra Amanda não encontrada no backup');
    }

    console.log('👤 Dra Amanda encontrada no backup:', amandaChatwitBackup.id);

    // Criar o UsuarioChatwit para Amanda
    const usuarioChatwit = await prisma.usuarioChatwit.create({
      data: {
        id: amandaChatwitBackup.id,
        appUserId: amanda.id,
        externalUserId: amandaChatwitBackup.externalUserId ?? null,
        name: amandaChatwitBackup.name,
        availableName: amandaChatwitBackup.availableName ?? null,
        accountId: amandaChatwitBackup.accountId,
        accountName: amandaChatwitBackup.accountName,
        channel: amandaChatwitBackup.channel,
        inboxId: amandaChatwitBackup.inboxId ?? null,
        inboxName: amandaChatwitBackup.inboxName ?? null,
        createdAt: new Date(amandaChatwitBackup.createdAt),
        updatedAt: new Date(amandaChatwitBackup.updatedAt)
      }
    });

    console.log('✅ UsuarioChatwit criado:', usuarioChatwit.id);

    // Restaurar os leads da Dra Amanda
    const leadsAmanda = backupData.data.leadsChatwit.filter(
      (lead: any) => lead.usuarioChatwitId === amandaChatwitBackup.id
    );

    console.log(`📋 Encontrados ${leadsAmanda.length} leads para restaurar`);

    let leadsRestaurados = 0;
    for (const leadBackup of leadsAmanda) {
      try {
        await prisma.leadChatwit.create({
          data: {
            id: leadBackup.id,
            nome: leadBackup.nome,
            email: leadBackup.email,
            telefone: leadBackup.telefone,
            status: leadBackup.status,
            origem: leadBackup.origem,
            observacoes: leadBackup.observacoes,
            usuarioChatwitId: usuarioChatwit.id,
            createdAt: new Date(leadBackup.createdAt),
            updatedAt: new Date(leadBackup.updatedAt)
          }
        });
        leadsRestaurados++;
      } catch (error: any) {
        if (error.code === 'P2002') {
          console.log(`⚠️ Lead ${leadBackup.id} já existe, pulando...`);
        } else {
          console.error(`❌ Erro ao restaurar lead ${leadBackup.id}:`, error.message);
        }
      }
    }

    console.log(`✅ ${leadsRestaurados} leads restaurados com sucesso`);

    // Restaurar os arquivos dos leads
    const arquivosAmanda = backupData.data.arquivosLeadChatwit.filter(
      (arquivo: any) => {
        const lead = leadsAmanda.find((l: any) => l.id === arquivo.leadChatwitId);
        return lead !== undefined;
      }
    );

    console.log(`📁 Encontrados ${arquivosAmanda.length} arquivos para restaurar`);

    let arquivosRestaurados = 0;
    for (const arquivoBackup of arquivosAmanda) {
      try {
        await prisma.arquivoLeadChatwit.create({
          data: {
            id: arquivoBackup.id,
            nome: arquivoBackup.nome,
            tipo: arquivoBackup.tipo,
            tamanho: arquivoBackup.tamanho,
            url: arquivoBackup.url,
            leadChatwitId: arquivoBackup.leadChatwitId,
            createdAt: new Date(arquivoBackup.createdAt),
            updatedAt: new Date(arquivoBackup.updatedAt)
          }
        });
        arquivosRestaurados++;
      } catch (error: any) {
        if (error.code === 'P2002') {
          console.log(`⚠️ Arquivo ${arquivoBackup.id} já existe, pulando...`);
        } else {
          console.error(`❌ Erro ao restaurar arquivo ${arquivoBackup.id}:`, error.message);
        }
      }
    }

    console.log(`✅ ${arquivosRestaurados} arquivos restaurados com sucesso`);

    // Estatísticas finais
    console.log('\n📊 Resumo da restauração:');
    console.log(`  - UsuarioChatwit: 1 criado`);
    console.log(`  - Leads: ${leadsRestaurados} restaurados`);
    console.log(`  - Arquivos: ${arquivosRestaurados} restaurados`);

    console.log('✅ Restauração concluída com sucesso!');

  } catch (error) {
    console.error('❌ Erro durante a restauração:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  restoreAmandaData().catch(console.error);
}

export { restoreAmandaData }; 