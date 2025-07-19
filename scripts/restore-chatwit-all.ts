#!/usr/bin/env tsx

import { PrismaClient, UserRole } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

async function seedAdminUsers() {
  console.log('🌱 Executando seed de usuários administradores...');
  
  try {
    const hashedPassword = await bcryptjs.hash('123456', 10);
    const dataAtual = new Date();
    
    // Criar usuário Amanda
    console.log('👤 Criando usuário Amanda...');
    const amanda = await prisma.user.upsert({
      where: { email: 'amandasousa22.adv@gmail.com' },
      update: {
        name: 'Amanda',
        emailVerified: dataAtual,
        role: UserRole.ADMIN,
        password: hashedPassword,
      },
      create: {
        email: 'amandasousa22.adv@gmail.com',
        name: 'Amanda',
        emailVerified: dataAtual,
        role: UserRole.ADMIN,
        password: hashedPassword,
        createdAt: dataAtual,
      },
    });

    // Criar usuário Witalo
    console.log('👤 Criando usuário Witalo...');
    const witalo = await prisma.user.upsert({
      where: { email: 'witalo_rocha@hotmail.com' },
      update: {
        name: 'Witalo',
        emailVerified: dataAtual,
        role: UserRole.ADMIN,
        password: hashedPassword,
      },
      create: {
        email: 'witalo_rocha@hotmail.com',
        name: 'Witalo',
        emailVerified: dataAtual,
        role: UserRole.ADMIN,
        password: hashedPassword,
        createdAt: dataAtual,
      },
    });

    // Criar UsuarioChatwit para Amanda
    console.log('📱 Criando UsuarioChatwit para Amanda...');
    const amandaChatwit = await prisma.usuarioChatwit.upsert({
      where: { appUserId: amanda.id },
      update: {
        name: 'DraAmandaSousa',
        accountName: 'DraAmandaSousa',
        channel: 'Whatsapp',
        chatwitAccountId: '3',
      },
      create: {
        appUserId: amanda.id,
        name: 'DraAmandaSousa',
        accountName: 'DraAmandaSousa',
        channel: 'Whatsapp',
        chatwitAccountId: '3',
      },
    });

    // Criar UsuarioChatwit para Witalo
    console.log('📱 Criando UsuarioChatwit para Witalo...');
    const witaloChatwit = await prisma.usuarioChatwit.upsert({
      where: { appUserId: witalo.id },
      update: {
        name: 'WitDev MASTER',
        accountName: 'WitDev MASTER',
        channel: 'Api',
        chatwitAccountId: '1',
      },
      create: {
        appUserId: witalo.id,
        name: 'WitDev MASTER',
        accountName: 'WitDev MASTER',
        channel: 'Api',
        chatwitAccountId: '1',
      },
    });

    console.log('✅ Seed de usuários concluído!');
    return { amanda, amandaChatwit };
    
  } catch (error) {
    console.error('❌ Erro durante o seed:', error);
    throw error;
  }
}

async function restoreAllChatwit(backupFileName?: string) {
  console.log('🔄 Iniciando restauração completa dos dados do Chatwit...');

  try {
    // Determinar arquivo de backup
    let backupPath: string;
    if (backupFileName) {
      backupPath = join(process.cwd(), 'backups', backupFileName);
      if (!existsSync(backupPath)) {
        console.error(`❌ Arquivo de backup não encontrado: ${backupPath}`);
        return;
      }
    } else {
      // Usar backup mais recente se não especificado
      backupPath = join(process.cwd(), 'backups', 'backup_simple_2025-07-15_20-46-00.json');
      if (!existsSync(backupPath)) {
        console.error(`❌ Arquivo de backup padrão não encontrado: ${backupPath}`);
        return;
      }
    }

    console.log(`📁 Carregando backup: ${backupPath}`);
    const backupData = JSON.parse(readFileSync(backupPath, 'utf-8'));
    
    const usuarios = backupData.data.usuariosChatwit;
    const leads = backupData.data.leadsChatwit;
    const arquivos = backupData.data.arquivosLeadChatwit;
    const espelhosBiblioteca = backupData.data.espelhosBiblioteca || [];
    const espelhosPadrao = backupData.data.espelhosPadrao || [];

    let leadsRestaurados = 0;
    let arquivosRestaurados = 0;
    let espelhosRestaurados = 0;

    // Verificar se usuários existem, se não, executar seed
    const amandaUser = await prisma.user.findUnique({
      where: { email: 'amandasousa22.adv@gmail.com' },
      include: { usuarioChatwit: true }
    });

    let amandaChatwit;
    if (!amandaUser || !amandaUser.usuarioChatwit) {
      console.log('⚠️ Usuários não encontrados, executando seed...');
      const seedResult = await seedAdminUsers();
      amandaChatwit = seedResult.amandaChatwit;
    } else {
      console.log(`✅ Usuário Amanda encontrado: ${amandaUser.name} (${amandaUser.email})`);
      amandaChatwit = amandaUser.usuarioChatwit;
    }

    console.log(`✅ UsuarioChatwit ID: ${amandaChatwit.id}`);

    // Encontrar o UsuarioChatwit da Amanda no backup
    const amandaBackup = usuarios.find((u: any) => u.name === 'DraAmandaSousa');
    
    if (!amandaBackup) {
      console.error('❌ UsuarioChatwit da Amanda não encontrado no backup!');
      return;
    }

    console.log(`✅ UsuarioChatwit da Amanda no backup: ${amandaBackup.id}`);

    // Restaurar espelhos da biblioteca
    console.log('\n📚 Restaurando espelhos da biblioteca...');
    for (const espelho of espelhosBiblioteca) {
      try {
        await prisma.espelhoBiblioteca.upsert({
          where: { id: espelho.id },
          update: {
            nome: espelho.nome,
            descricao: espelho.descricao,
            textoDOEspelho: espelho.textoDOEspelho,
            espelhoCorrecao: espelho.espelhoCorrecao,
            isAtivo: espelho.isAtivo,
            totalUsos: espelho.totalUsos,
            espelhoBibliotecaProcessado: espelho.espelhoBibliotecaProcessado,
            aguardandoEspelho: espelho.aguardandoEspelho,
            criadoPorId: amandaChatwit.id, // Usar o ID correto do banco atual
            updatedAt: new Date()
          },
          create: {
            id: espelho.id,
            nome: espelho.nome,
            descricao: espelho.descricao,
            textoDOEspelho: espelho.textoDOEspelho,
            espelhoCorrecao: espelho.espelhoCorrecao,
            isAtivo: espelho.isAtivo,
            totalUsos: espelho.totalUsos,
            espelhoBibliotecaProcessado: espelho.espelhoBibliotecaProcessado,
            aguardandoEspelho: espelho.aguardandoEspelho,
            criadoPorId: amandaChatwit.id,
            createdAt: new Date(espelho.createdAt),
            updatedAt: new Date(espelho.updatedAt)
          }
        });
        espelhosRestaurados++;
      } catch (error: any) {
        console.error(`❌ Erro ao restaurar espelho ${espelho.id}:`, error.message);
      }
    }

    // Restaurar espelhos padrão
    console.log('\n📋 Restaurando espelhos padrão...');
    for (const espelho of espelhosPadrao) {
      try {
        await prisma.espelhoPadrao.upsert({
          where: { especialidade: espelho.especialidade },
          update: {
            nome: espelho.nome,
            descricao: espelho.descricao,
            textoMarkdown: espelho.textoMarkdown,
            espelhoCorrecao: espelho.espelhoCorrecao,
            isAtivo: espelho.isAtivo,
            totalUsos: espelho.totalUsos,
            processado: espelho.processado,
            aguardandoProcessamento: espelho.aguardandoProcessamento,
            atualizadoPorId: amandaChatwit.id,
            updatedAt: new Date()
          },
          create: {
            especialidade: espelho.especialidade,
            nome: espelho.nome,
            descricao: espelho.descricao,
            textoMarkdown: espelho.textoMarkdown,
            espelhoCorrecao: espelho.espelhoCorrecao,
            isAtivo: espelho.isAtivo,
            totalUsos: espelho.totalUsos,
            processado: espelho.processado,
            aguardandoProcessamento: espelho.aguardandoProcessamento,
            atualizadoPorId: amandaChatwit.id,
            createdAt: new Date(espelho.createdAt),
            updatedAt: new Date(espelho.updatedAt)
          }
        });
        espelhosRestaurados++;
      } catch (error: any) {
        console.error(`❌ Erro ao restaurar espelho padrão ${espelho.especialidade}:`, error.message);
      }
    }

    // Restaurar leads da Amanda
    const leadsDaAmanda = leads.filter((l: any) => l.usuarioId === amandaBackup.id);
    console.log(`\n👥 Encontrados ${leadsDaAmanda.length} leads da Amanda no backup`);
    console.log('🔄 Iniciando restauração dos leads...');

    for (let i = 0; i < leadsDaAmanda.length; i++) {
      const lead = leadsDaAmanda[i];
      
      try {
        await prisma.leadChatwit.upsert({
          where: { id: lead.id },
          update: {
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
            usuarioId: amandaChatwit.id,
            updatedAt: new Date()
          },
          create: {
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
            usuarioId: amandaChatwit.id,
            createdAt: new Date(lead.createdAt),
            updatedAt: new Date(lead.updatedAt)
          }
        });
        leadsRestaurados++;
        
        // Restaurar arquivos desse lead
        const arquivosDoLead = arquivos.filter((a: any) => a.leadId === lead.id);
        for (const arquivo of arquivosDoLead) {
          try {
            await prisma.arquivoLeadChatwit.upsert({
              where: { id: arquivo.id },
              update: {
                fileType: arquivo.fileType,
                dataUrl: arquivo.dataUrl,
                pdfConvertido: arquivo.pdfConvertido,
                leadId: lead.id,
                updatedAt: new Date()
              },
              create: {
                id: arquivo.id,
                fileType: arquivo.fileType,
                dataUrl: arquivo.dataUrl,
                pdfConvertido: arquivo.pdfConvertido,
                leadId: lead.id,
                createdAt: new Date(arquivo.createdAt),
                updatedAt: new Date(arquivo.updatedAt)
              }
            });
            arquivosRestaurados++;
          } catch (error: any) {
            console.error(`❌ Erro ao restaurar arquivo ${arquivo.id}:`, error.message);
          }
        }

        // Mostrar progresso a cada 5 leads
        if ((i + 1) % 5 === 0) {
          console.log(`📊 Progresso: ${i + 1}/${leadsDaAmanda.length} leads restaurados (${Math.round(((i + 1) / leadsDaAmanda.length) * 100)}%)`);
        }
        
      } catch (error: any) {
        console.error(`❌ Erro ao restaurar lead ${lead.id}:`, error.message);
      }
    }

    // Estatísticas finais
    console.log('\n📊 Resumo da restauração:');
    console.log(`  - Espelhos: ${espelhosRestaurados} restaurados`);
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
  const backupFile = process.argv[2];
  restoreAllChatwit(backupFile).catch(console.error);
}

export { restoreAllChatwit }; 