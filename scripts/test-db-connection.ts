// Script para testar a conexão com o banco de dados
const { PrismaClient } = require('@prisma/client');
const path = require('path');

// Configura o dotenv para carregar o arquivo .env específico
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.production'), override: true });

// Inicializa o Prisma Client
const prisma = new PrismaClient();

async function testConnection() {
  console.log('🔍 Testando conexão com o banco de dados...');
  console.log('📋 DATABASE_URL:', process.env.DATABASE_URL);
  
  try {
    // Testa a conexão
    await prisma.$connect();
    console.log('✅ Conexão estabelecida com sucesso!');
    
    // Executa uma query simples para verificar o banco
    const result = await prisma.$queryRaw`SELECT current_database() as database_name, current_user as user_name`;
    console.log('📊 Informações do banco:', result);
    
    // Lista todas as tabelas do banco
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    console.log('📋 Tabelas disponíveis no banco:');
    tables.forEach((table: any) => {
      console.log(`  - ${table.table_name}`);
    });
    
  } catch (error) {
    console.error('❌ Erro na conexão:', error);
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Conexão fechada.');
  }
}

testConnection(); 