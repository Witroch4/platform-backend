#!/usr/bin/env node

/**
 * Script de inicialização do banco de dados
 * Verifica se o banco existe e cria se necessário
 */

// Carregar variáveis de ambiente
const path = require('path');
const fs = require('fs');

// Tentar carregar diferentes arquivos de ambiente
const envFiles = [
  '.env.production',
  '.env.local', 
  '.env'
];

for (const envFile of envFiles) {
  const envPath = path.join(process.cwd(), envFile);
  if (fs.existsSync(envPath)) {
    console.log(`📄 Carregando variáveis de ambiente de: ${envFile}`);
    require('dotenv').config({ path: envPath });
    break;
  }
}

// Fallback para dotenv padrão
require('dotenv').config();

const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

async function initDatabase() {
  console.log('🔍 Verificando configuração do banco de dados...');
  
  // Debug das variáveis de ambiente
  console.log('🔧 NODE_ENV:', process.env.NODE_ENV);
  console.log('🔧 Diretório atual:', process.cwd());
  console.log('🔧 Arquivos .env disponíveis:');
  const envFiles = ['.env.production', '.env.local', '.env'];
  envFiles.forEach(file => {
    const exists = fs.existsSync(path.join(process.cwd(), file));
    console.log(`   ${file}: ${exists ? '✅' : '❌'}`);
  });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL não está definida');
    console.log('🔧 Variáveis de ambiente disponíveis:');
    Object.keys(process.env).filter(key => key.includes('DATABASE')).forEach(key => {
      console.log(`   ${key}: ${process.env[key]}`);
    });
    throw new Error('DATABASE_URL não está definida');
  }

  try {
    // Parse da DATABASE_URL
    const url = new URL(databaseUrl);
    const dbHost = url.hostname;
    const dbPort = url.port || 5432;
    const dbUser = url.username;
    const dbPass = url.password;
    const dbName = url.pathname.slice(1); // Remove a barra inicial

    console.log('📊 Configuração do banco:');
    console.log(`   Host: ${dbHost}`);
    console.log(`   Port: ${dbPort}`);
    console.log(`   User: ${dbUser}`);
    console.log(`   Database: ${dbName}`);

    // Criar URL para conectar ao banco postgres (padrão)
    const postgresUrl = `postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/postgres`;

    console.log('🔌 Tentando conectar ao PostgreSQL...');

    // Conectar ao PostgreSQL usando Prisma
    const adminPrisma = new PrismaClient({
      datasources: {
        db: {
          url: postgresUrl
        }
      }
    });

    // Testar conexão
    await adminPrisma.$connect();
    console.log('✅ Conectado ao PostgreSQL com sucesso!');

    // Verificar se o banco existe usando query raw do Prisma
    console.log(`🔍 Verificando se o banco '${dbName}' existe...`);
    const result = await adminPrisma.$queryRaw`
      SELECT 1 FROM pg_database WHERE datname = ${dbName}
    `;

    if (!result || result.length === 0) {
      console.log(`📝 Banco '${dbName}' não existe, criando...`);
      try {
        await adminPrisma.$executeRaw`CREATE DATABASE "${dbName}"`;
        console.log(`✅ Banco '${dbName}' criado com sucesso!`);
      } catch (createError) {
        // Se o erro for que o banco já existe, apenas logar
        if (createError.code === '42P04' || createError.message.includes('already exists')) {
          console.log(`✅ Banco '${dbName}' já existe (criado por outro processo)`);
        } else {
          throw createError;
        }
      }
    } else {
      console.log(`✅ Banco '${dbName}' já existe`);
    }

    await adminPrisma.$disconnect();
    console.log('🔌 Desconectado do PostgreSQL');

    // Executar migrações
    console.log('🔄 Executando migrações do Prisma...');
    try {
      execSync('npx prisma migrate deploy', { 
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: databaseUrl }
      });
      console.log('✅ Migrações executadas com sucesso!');
    } catch (migrationError) {
      console.error('⚠️  Erro durante migrações:', migrationError.message);
      console.log('🔄 Tentando push do schema...');
      try {
        execSync('npx prisma db push', { 
          stdio: 'inherit',
          env: { ...process.env, DATABASE_URL: databaseUrl }
        });
        console.log('✅ Schema push executado com sucesso!');
      } catch (pushError) {
        console.error('❌ Erro durante push do schema:', pushError.message);
        throw pushError;
      }
    }

    // Gerar cliente Prisma
    console.log('🔧 Gerando cliente Prisma...');
    execSync('npx prisma generate', { 
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl }
    });
    console.log('✅ Cliente Prisma gerado!');

    console.log('🎉 Configuração do banco de dados concluída!');

  } catch (error) {
    console.error('❌ Erro durante a inicialização do banco:', error.message);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase }; 