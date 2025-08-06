// Importa os módulos necessários
const { PrismaClient } = require('@prisma/client');
const fs = require('fs/promises');
const path = require('path');

// Tipos para resolver os erros de TypeScript
interface BackupData {
  [key: string]: any[];
}

/**
 * Script auto-adaptável para criar backup completo de qualquer banco de dados PostgreSQL.
 * 
 * O que ele faz:
 * 1. Conecta ao banco usando a DATABASE_URL do .env.production
 * 2. Detecta automaticamente todas as tabelas existentes no banco
 * 3. Tenta acessar cada tabela usando Prisma (se disponível) ou query raw
 * 4. Salva apenas tabelas que contêm dados
 * 5. Gera um backup completo em JSON
 */

// Configura o dotenv para carregar o arquivo .env específico
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.production'), override: true });

// Inicializa o Prisma Client
const prismaClient = new PrismaClient({
  log: ['error', 'warn'], // Removido 'query' para reduzir logs
});

async function criarBackup() {
  console.log('🚀 Iniciando backup auto-adaptável do banco de dados...');
  console.log(`📋 Conectando a: ${process.env.DATABASE_URL?.split('@')[1] || 'banco desconhecido'}`);

  try {
    const dadosDoBackup: BackupData = {};
    let totalRegistrosSalvos = 0;
    let tabelasComRegistros = 0;

    // 1. Detecta todas as tabelas existentes no banco
    console.log('\n🔍 Detectando tabelas existentes no banco...');
    const tabelasExistentes = await prismaClient.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name NOT LIKE '_prisma_%'
      ORDER BY table_name
    `;
    
    const nomesTabelas = tabelasExistentes.map((t: any) => t.table_name);
    console.log(`📋 Encontradas ${nomesTabelas.length} tabelas no banco`);

    // 2. Itera sobre cada tabela para fazer backup
    for (const nomeTabela of nomesTabelas) {
      console.log(`\n    - Processando tabela: ${nomeTabela}...`);
      
      try {
        // Tenta usar Prisma primeiro (se o modelo existir)
        let dados: any[] = [];
        
        try {
          // Converte nome da tabela para formato camelCase do Prisma
          const chavePrisma = nomeTabela.charAt(0).toLowerCase() + nomeTabela.slice(1);
          
          // Verifica se o modelo existe no Prisma Client
          if (prismaClient[chavePrisma] && typeof prismaClient[chavePrisma].findMany === 'function') {
            dados = await prismaClient[chavePrisma].findMany();
            console.log(`      ✅ Usando Prisma Client para ${nomeTabela}`);
          } else {
            throw new Error('Modelo não encontrado no Prisma');
          }
        } catch (prismaError) {
          // Se Prisma falhar, usa query raw
          console.log(`      🔄 Usando query raw para ${nomeTabela}`);
          const result = await prismaClient.$queryRawUnsafe(`SELECT * FROM "${nomeTabela}"`);
          dados = result as any[];
        }

        // Processa os dados encontrados
        if (dados.length > 0) {
          dadosDoBackup[nomeTabela] = dados;
          totalRegistrosSalvos += dados.length;
          tabelasComRegistros++;
          console.log(`      ✅ Salvos ${dados.length} registros`);
        } else {
          console.log(`      ⚪️ Tabela vazia, não incluída no backup`);
        }

      } catch (error: any) {
        console.log(`      ❌ Erro ao processar ${nomeTabela}: ${error.message}`);
      }
    }

    // 3. Verifica se há dados para salvar
    if (tabelasComRegistros === 0) {
      console.log('\n⚠️ Nenhuma tabela com dados encontrada. Backup não foi gerado.');
      return;
    }

    // 4. Gera o sumário
    console.log('\n============================================');
    console.log('📊 SUMÁRIO FINAL DO BACKUP');
    console.log('============================================');
    console.log(`Tabelas Processadas: ${nomesTabelas.length}`);
    console.log(`Tabelas com Dados: ${tabelasComRegistros}`);
    console.log(`Total de Registros: ${totalRegistrosSalvos}`);
    console.log('============================================\n');

    // 5. Salva o arquivo de backup
    const backupDir = path.join(process.cwd(), 'backups');
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nomeDoArquivo = `backup-faceApp-${timestamp}.json`;
    const caminhoDoArquivo = path.join(backupDir, nomeDoArquivo);

    await fs.writeFile(caminhoDoArquivo, JSON.stringify(dadosDoBackup, null, 2));

    console.log(`🎉 Backup concluído com sucesso!`);
    console.log(`💾 Arquivo salvo em: ${caminhoDoArquivo}`);
    console.log(`📊 Tamanho do arquivo: ${(JSON.stringify(dadosDoBackup).length / 1024 / 1024).toFixed(2)} MB`);

  } catch (erro) {
    console.error('❌ Erro durante o backup:', erro);
  } finally {
    await prismaClient.$disconnect();
    console.log('\n🔌 Conexão com o banco de dados fechada.');
  }
}

// Executa o backup
criarBackup();