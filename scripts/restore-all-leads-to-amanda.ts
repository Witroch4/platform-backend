#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function restoreAllLeadsToAmanda() {
  console.log('🔄 Iniciando restauração de todos os leads para Amanda...');

  try {
    // Carregar backup mais recente
    const backupPath = join(process.cwd(), 'backups', 'backup_simple_2025-07-12_18-25-34.json');
    const backupData = JSON.parse(readFileSync(backupPath, 'utf8'));
    
    console.log('📂 Backup carregado:', backupPath);

    // Buscar Amanda no banco atual
    const amanda = await prisma.usuarioChatwit.findFirst({
      where: {
        appUser: {
          email: 'amandasousa22.adv@gmail.com'
        }
      },
      include: {
        appUser: true
      }
    });

    if (!amanda) {
      throw new Error('❌ Amanda não encontrada no banco de dados');
    }

    console.log(`✅ Amanda encontrada: ${amanda.name} (ID: ${amanda.id})`);

    // Buscar DraAmandaSousa no backup (que tem accountId: 3)
    const draAmandaBackup = backupData.data.usuariosChatwit.find(
      (user: any) => user.accountId === 3
    );

    if (!draAmandaBackup) {
      throw new Error('❌ DraAmandaSousa não encontrada no backup');
    }

    console.log(`✅ DraAmandaSousa encontrada no backup (accountId: ${draAmandaBackup.accountId})`);

    // Buscar todos os leads da DraAmandaSousa no backup
    const leadsBackup = backupData.data.leadsChatwit.filter(
      (lead: any) => lead.usuarioId === draAmandaBackup.id
    );

    console.log(`📊 Encontrados ${leadsBackup.length} leads no backup`);

    if (leadsBackup.length === 0) {
      console.log('⚠️ Nenhum lead encontrado para restaurar');
      return;
    }

    // Restaurar leads
    let leadsRestaurados = 0;
    let arquivosRestaurados = 0;
    let erros = 0;

    for (const leadBackup of leadsBackup) {
      try {
        // Criar lead
        const leadCriado = await prisma.leadChatwit.create({
          data: {
            sourceId: leadBackup.sourceId,
            name: leadBackup.name,
            nomeReal: leadBackup.nomeReal,
            phoneNumber: leadBackup.phoneNumber,
            email: leadBackup.email,
            thumbnail: leadBackup.thumbnail,
            concluido: leadBackup.concluido,
            anotacoes: leadBackup.anotacoes,
            pdfUnificado: leadBackup.pdfUnificado,
            imagensConvertidas: leadBackup.imagensConvertidas,
            leadUrl: leadBackup.leadUrl,
            fezRecurso: leadBackup.fezRecurso,
            datasRecurso: leadBackup.datasRecurso,
            provaManuscrita: leadBackup.provaManuscrita,
            manuscritoProcessado: leadBackup.manuscritoProcessado,
            aguardandoManuscrito: leadBackup.aguardandoManuscrito,
            espelhoCorrecao: leadBackup.espelhoCorrecao,
            textoDOEspelho: leadBackup.textoDOEspelho,
            espelhoProcessado: leadBackup.espelhoProcessado,
            aguardandoEspelho: leadBackup.aguardandoEspelho,
            analiseUrl: leadBackup.analiseUrl,
            argumentacaoUrl: leadBackup.argumentacaoUrl,
            analiseProcessada: leadBackup.analiseProcessada,
            aguardandoAnalise: leadBackup.aguardandoAnalise,
            analisePreliminar: leadBackup.analisePreliminar,
            analiseValidada: leadBackup.analiseValidada,
            consultoriaFase2: leadBackup.consultoriaFase2,
            recursoPreliminar: leadBackup.recursoPreliminar,
            recursoValidado: leadBackup.recursoValidado,
            recursoUrl: leadBackup.recursoUrl,
            recursoArgumentacaoUrl: leadBackup.recursoArgumentacaoUrl,
            aguardandoRecurso: leadBackup.aguardandoRecurso,
            seccional: leadBackup.seccional,
            areaJuridica: leadBackup.areaJuridica,
            notaFinal: leadBackup.notaFinal,
            situacao: leadBackup.situacao,
            inscricao: leadBackup.inscricao,
            examesParticipados: leadBackup.examesParticipados,
            especialidade: leadBackup.especialidade,
            usuarioId: amanda.id, // Usar o ID da Amanda atual
          }
        });

        leadsRestaurados++;

        // Buscar arquivos deste lead no backup
        const arquivosBackup = backupData.data.arquivosLeadChatwit.filter(
          (arquivo: any) => arquivo.leadId === leadBackup.id
        );

        // Restaurar arquivos
        for (const arquivoBackup of arquivosBackup) {
          try {
            await prisma.arquivoLeadChatwit.create({
              data: {
                fileType: arquivoBackup.fileType,
                dataUrl: arquivoBackup.dataUrl,
                pdfConvertido: arquivoBackup.pdfConvertido,
                leadId: leadCriado.id, // Usar o ID do lead recém-criado
              }
            });
            arquivosRestaurados++;
          } catch (arquivoError) {
            console.error(`❌ Erro ao restaurar arquivo:`, arquivoError);
            erros++;
          }
        }

      } catch (leadError) {
        console.error(`❌ Erro ao restaurar lead ${leadBackup.sourceId}:`, leadError);
        erros++;
      }
    }

    console.log('\n📊 Resumo da restauração:');
    console.log(`✅ Leads restaurados: ${leadsRestaurados}`);
    console.log(`✅ Arquivos restaurados: ${arquivosRestaurados}`);
    console.log(`❌ Erros: ${erros}`);
    console.log(`🎉 Restauração concluída!`);

  } catch (error) {
    console.error('❌ Erro durante a restauração:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  restoreAllLeadsToAmanda().catch(console.error);
}

export { restoreAllLeadsToAmanda }; 