#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function restoreAllChatwit() {
  console.log('🔄 Iniciando restauração completa dos dados do Chatwit...');

  try {
    // Ler o backup mais recente
    const backupPath = join(process.cwd(), 'backups', 'backup_simple_2025-07-12_18-25-34.json');
    const backupData = JSON.parse(readFileSync(backupPath, 'utf-8'));
    
    const usuarios = backupData.data.usuariosChatwit;
    const leads = backupData.data.leadsChatwit;
    const arquivos = backupData.data.arquivosLeadChatwit;

    let usuariosRestaurados = 0;
    let leadsRestaurados = 0;
    let arquivosRestaurados = 0;

    for (const usuario of usuarios) {
      try {
        // Buscar usuário do app relacionado
        const appUser = await prisma.user.findFirst({ where: { email: usuario.email } });
        let appUserId = appUser?.id;
        // Se não achar pelo email, tenta pelo nome (ajuste se necessário)
        if (!appUserId && usuario.name) {
          const byName = await prisma.user.findFirst({ where: { name: usuario.name } });
          appUserId = byName?.id;
        }
        // Se não achar, pula
        if (!appUserId) {
          console.warn(`⚠️ Usuário do app não encontrado para UsuarioChatwit ${usuario.id} (${usuario.name}), pulando...`);
          continue;
        }
        // Cria UsuarioChatwit
        await prisma.usuarioChatwit.create({
          data: {
            id: usuario.id,
            appUserId,
            externalUserId: usuario.externalUserId ?? null,
            name: usuario.name,
            availableName: usuario.availableName ?? null,
            accountId: usuario.accountId,
            accountName: usuario.accountName,
            channel: usuario.channel,
            inboxId: usuario.inboxId ?? null,
            inboxName: usuario.inboxName ?? null,
            createdAt: new Date(usuario.createdAt),
            updatedAt: new Date(usuario.updatedAt)
          }
        });
        usuariosRestaurados++;
        // Restaurar leads desse usuario
        const leadsDoUsuario = leads.filter((l: any) => l.usuarioId === usuario.id);
        for (const lead of leadsDoUsuario) {
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
                usuarioId: usuario.id
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
      } catch (error: any) {
        if (error.code === 'P2002') {
          console.log(`⚠️ UsuarioChatwit ${usuario.id} já existe, pulando...`);
        } else {
          console.error(`❌ Erro ao restaurar UsuarioChatwit ${usuario.id}:`, error.message);
        }
      }
    }

    // Estatísticas finais
    console.log('\n📊 Resumo da restauração:');
    console.log(`  - UsuarioChatwit: ${usuariosRestaurados} restaurados`);
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