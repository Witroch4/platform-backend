#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function restoreAllChatwit() {
  console.log('🔄 Iniciando restauração completa dos dados do Chatwit...');

  try {
    // Ler o backup mais recente
    const backupPath = join(process.cwd(), 'backups', 'backup_simple_2025-07-13_15-40-53.json');
    const backupData = JSON.parse(readFileSync(backupPath, 'utf-8'));
    
    const usuarios = backupData.data.usuariosChatwit;
    const leads = backupData.data.leadsChatwit;
    const arquivos = backupData.data.arquivosLeadChatwit;

    let leadsRestaurados = 0;
    let arquivosRestaurados = 0;

    // Buscar o usuário Amanda pelo email
    const amandaUser = await prisma.user.findUnique({
      where: { email: 'amandasousa22.adv@gmail.com' },
      include: { usuarioChatwit: true }
    });

    if (!amandaUser || !amandaUser.usuarioChatwit) {
      console.error('❌ Usuário Amanda ou UsuarioChatwit não encontrado!');
      return;
    }

    console.log(`✅ Usuário Amanda encontrado: ${amandaUser.name} (${amandaUser.email})`);
    console.log(`✅ UsuarioChatwit ID: ${amandaUser.usuarioChatwit.id}`);

    // Encontrar o UsuarioChatwit da Amanda no backup
    const amandaBackup = usuarios.find((u: any) => u.name === 'DraAmandaSousa');
    
    if (!amandaBackup) {
      console.error('❌ UsuarioChatwit da Amanda não encontrado no backup!');
      return;
    }

    console.log(`✅ UsuarioChatwit da Amanda no backup: ${amandaBackup.id}`);

    // Restaurar leads da Amanda
    const leadsDaAmanda = leads.filter((l: any) => l.usuarioId === amandaBackup.id);
    console.log(`📊 Encontrados ${leadsDaAmanda.length} leads da Amanda no backup`);

    for (const lead of leadsDaAmanda) {
      try {
        await prisma.leadChatwit.create({
          data: {
            id: lead.id,
            sourceId: lead.sourceId,
            name: lead.name,
            nomeReal: lead.nomeReal,
            phoneNumber: lead.phoneNumber,
            email: lead.email,
            thumbnail: lead.thumbnail,
            concluido: lead.concluido,
            anotacoes: lead.anotacoes,
            pdfUnificado: lead.pdfUnificado,
            imagensConvertidas: lead.imagensConvertidas,
            leadUrl: lead.leadUrl,
            fezRecurso: lead.fezRecurso,
            datasRecurso: lead.datasRecurso,
            provaManuscrita: lead.provaManuscrita,
            manuscritoProcessado: lead.manuscritoProcessado,
            aguardandoManuscrito: lead.aguardandoManuscrito,
            espelhoCorrecao: lead.espelhoCorrecao,
            textoDOEspelho: lead.textoDOEspelho,
            espelhoProcessado: lead.espelhoProcessado,
            aguardandoEspelho: lead.aguardandoEspelho,
            analiseUrl: lead.analiseUrl,
            argumentacaoUrl: lead.argumentacaoUrl,
            analiseProcessada: lead.analiseProcessada,
            aguardandoAnalise: lead.aguardandoAnalise,
            analisePreliminar: lead.analisePreliminar,
            analiseValidada: lead.analiseValidada,
            consultoriaFase2: lead.consultoriaFase2,
            recursoPreliminar: lead.recursoPreliminar,
            recursoValidado: lead.recursoValidado,
            recursoUrl: lead.recursoUrl,
            recursoArgumentacaoUrl: lead.recursoArgumentacaoUrl,
            aguardandoRecurso: lead.aguardandoRecurso,
            seccional: lead.seccional,
            areaJuridica: lead.areaJuridica,
            notaFinal: lead.notaFinal,
            situacao: lead.situacao,
            inscricao: lead.inscricao,
            examesParticipados: lead.examesParticipados,
            espelhoBibliotecaId: lead.espelhoBibliotecaId,
            especialidade: lead.especialidade,
            createdAt: new Date(lead.createdAt),
            updatedAt: new Date(lead.updatedAt),
            usuarioId: amandaUser.usuarioChatwit.id // Usar o ID correto do banco atual
          }
        });
        leadsRestaurados++;
        
        // Restaurar arquivos desse lead
        const arquivosDoLead = arquivos.filter((a: any) => a.leadId === lead.id);
        for (const arquivo of arquivosDoLead) {
          try {
            await prisma.arquivoLeadChatwit.create({
              data: {
                id: arquivo.id,
                fileType: arquivo.fileType,
                dataUrl: arquivo.dataUrl,
                pdfConvertido: arquivo.pdfConvertido,
                createdAt: new Date(arquivo.createdAt),
                updatedAt: new Date(arquivo.updatedAt),
                leadId: lead.id
              }
            });
            arquivosRestaurados++;
          } catch (error: any) {
            if (error.code === 'P2002') {
              console.log(`⚠️ Arquivo ${arquivo.id} já existe, pulando...`);
            } else {
              console.error(`❌ Erro ao restaurar arquivo ${arquivo.id}:`, error.message);
            }
          }
        }
      } catch (error: any) {
        if (error.code === 'P2002') {
          console.log(`⚠️ Lead ${lead.id} já existe, pulando...`);
        } else {
          console.error(`❌ Erro ao restaurar lead ${lead.id}:`, error.message);
        }
      }
    }

    // Estatísticas finais
    console.log('\n📊 Resumo da restauração:');
    console.log(`  - Leads: ${leadsRestaurados} restaurados`);
    console.log(`  - Arquivos: ${arquivosRestaurados} restaurados`);

    console.log('✅ Restauração completa concluída!');

  } catch (error) {
    console.error('❌ Erro durante a restauração:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  restoreAllChatwit().catch(console.error);
}

export { restoreAllChatwit }; 