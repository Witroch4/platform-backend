#!/usr/bin/env tsx

import { getPrismaInstance } from "@/lib/connections";
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = getPrismaInstance();

async function restoreEspelhosBiblioteca() {
  console.log('🔄 Iniciando restauração dos espelhos da biblioteca...');

  try {
    // Carregar backup
    const backupPath = join(process.cwd(), 'backups', 'backup_simple_2025-07-12_18-25-34.json');
    const backupData = JSON.parse(readFileSync(backupPath, 'utf8'));
    
    console.log('📂 Backup carregado:', backupPath);

    // Buscar Amanda no banco atual
    const amanda = await prisma.usuarioChatwit.findFirst({
      where: {
        appUser: {
          email: 'amandasousa22.adv@gmail.com'
        }
      }
    });

    if (!amanda) {
      throw new Error('❌ Amanda não encontrada no banco de dados');
    }

    console.log(`✅ Amanda encontrada: ${amanda.name} (ID: ${amanda.id})`);

    // Buscar espelhos da biblioteca no backup
    const espelhosBackup = backupData.data.espelhosBiblioteca || [];

    console.log(`📊 Encontrados ${espelhosBackup.length} espelhos da biblioteca no backup`);

    if (espelhosBackup.length === 0) {
      console.log('⚠️ Nenhum espelho da biblioteca encontrado para restaurar');
      return;
    }

    // Restaurar espelhos da biblioteca
    let espelhosRestaurados = 0;
    let erros = 0;

    for (const espelhoBackup of espelhosBackup) {
      try {
        // Verificar se o espelho já existe
        const espelhoExistente = await prisma.espelhoBiblioteca.findFirst({
          where: {
            nome: espelhoBackup.nome,
            criadoPorId: amanda.id
          }
        });

        if (espelhoExistente) {
          console.log(`⚠️ Espelho ${espelhoBackup.nome} já existe, pulando...`);
          continue;
        }

        // Criar espelho da biblioteca
        await prisma.espelhoBiblioteca.create({
          data: {
            nome: espelhoBackup.nome,
            descricao: espelhoBackup.descricao,
            textoDOEspelho: espelhoBackup.textoDOEspelho,
            espelhoCorrecao: espelhoBackup.espelhoCorrecao,
            isAtivo: espelhoBackup.isAtivo,
            totalUsos: espelhoBackup.totalUsos,
            espelhoBibliotecaProcessado: espelhoBackup.espelhoBibliotecaProcessado,
            aguardandoEspelho: espelhoBackup.aguardandoEspelho,
            criadoPorId: amanda.id, // Usar Amanda como criado por
          }
        });

        espelhosRestaurados++;
        console.log(`✅ Espelho da biblioteca restaurado: ${espelhoBackup.nome}`);

      } catch (espelhoError) {
        console.error(`❌ Erro ao restaurar espelho ${espelhoBackup.nome}:`, espelhoError);
        erros++;
      }
    }

    console.log('\n📊 Resumo da restauração:');
    console.log(`✅ Espelhos da biblioteca restaurados: ${espelhosRestaurados}`);
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
  restoreEspelhosBiblioteca().catch(console.error);
}

export { restoreEspelhosBiblioteca }; 