// Importa os módulos necessários
const { PrismaClient, Prisma } = require('@prisma/client');
const fs = require('fs/promises');
const path = require('path');

/**
 * Script para criar um backup completo (dump de dados) de um banco de dados usando Prisma.
 *
 * O que ele faz:
 * 1. Carrega a variável de ambiente DATABASE_URL do arquivo .env.development.
 * 2. Inicializa o Prisma Client.
 * 3. Descobre dinamicamente todos os modelos definidos no seu schema.prisma.
 * 4. Itera sobre cada modelo, salvando apenas os que não estão vazios.
 * 5. Garante que uma pasta 'backups' exista.
 * 6. Grava os dados coletados em um arquivo JSON.
 * 7. Exibe um sumário com o total de tabelas e registros salvos.
 * 8. Desconecta o Prisma Client ao final do processo.
 */

// Configura o dotenv para carregar o arquivo .env específico
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.development') });

// Inicializa o Prisma Client
const prisma = new PrismaClient();

async function criarBackup() {
  console.log('🚀 Iniciando o processo de backup do banco de dados...');

  try {
    // Descobre todos os nomes de modelos do DMMF (Data Model Meta Format) do Prisma
    const nomesDosModelos = Prisma.dmmf.datamodel.models.map((model) => model.name);
    const dadosDoBackup = {};

    // NOVO: Contadores para o sumário
    let totalRegistrosSalvos = 0;
    let tabelasComRegistros = 0;

    console.log(`🔍 Modelos encontrados no schema: ${nomesDosModelos.join(', ')}`);

    // Itera sobre cada modelo para buscar os dados
    for (const nomeDoModelo of nomesDosModelos) {
      const chaveDoModelo = nomeDoModelo.charAt(0).toLowerCase() + nomeDoModelo.slice(1);
      
      console.log(`\n    - Verificando o modelo: ${nomeDoModelo}...`);
      
      const dados = await prisma[chaveDoModelo].findMany();
      
      // NOVO: Condição para processar apenas tabelas com dados
      if (dados.length > 0) {
        dadosDoBackup[nomeDoModelo] = dados;
        totalRegistrosSalvos += dados.length;
        tabelasComRegistros++;
        console.log(`      ✅ Salvos ${dados.length} registros.`);
      } else {
        console.log(`      ⚪️ Modelo vazio, não incluído no backup.`);
      }
    }

    // Se nenhuma tabela tinha registros, não há o que salvar.
    if (tabelasComRegistros === 0) {
        console.log('\n⚠️ Nenhuma tabela com dados encontrada. O arquivo de backup não foi gerado.');
        return; // Sai da função mais cedo
    }
    
    // --- NOVO: SUMÁRIO DETALHADO ---
    console.log('\n============================================');
    console.log('📊 SUMÁRIO FINAL DO BACKUP');
    console.log('============================================');
    console.log(`Tabelas Salvas: ${tabelasComRegistros} (apenas com registros)`);
    console.log(`Total de Registros: ${totalRegistrosSalvos}`);
    console.log('============================================\n');
    
    // Define o diretório de backups
    const backupDir = path.join(process.cwd(), 'backups');

    // Garante que o diretório exista (cria se não existir)
    await fs.mkdir(backupDir, { recursive: true });

    // Cria o nome do arquivo e o caminho completo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nomeDoArquivo = `backup-${timestamp}.json`;
    const caminhoDoArquivo = path.join(backupDir, nomeDoArquivo);

    // Escreve os dados do backup no caminho completo
    await fs.writeFile(caminhoDoArquivo, JSON.stringify(dadosDoBackup, null, 2));

    console.log(`🎉 Backup concluído com sucesso!`);
    console.log(`💾 Arquivo salvo em: ${caminhoDoArquivo}`);

  } catch (erro) {
    console.error('❌ Ocorreu um erro durante o processo de backup:', erro);
  } finally {
    // Garante que o Prisma Client seja desconectado
    await prisma.$disconnect();
    console.log('\n🔌 Conexão com o banco de dados fechada.');
  }
}

// Executa a função de backup
criarBackup();