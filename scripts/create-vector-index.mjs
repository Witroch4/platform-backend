// scripts/create-vector-index.mjs
// Script para criar índice vetorial usando Prisma

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createVectorIndex() {
  try {
    console.log('🔧 Criando índice vetorial para AiDocument...');
    
    // Verificar se pgvector está habilitado
    console.log('📋 Verificando extensão pgvector...');
    const extensions = await prisma.$queryRaw`
      SELECT * FROM pg_extension WHERE extname = 'vector';
    `;
    
    if (extensions.length === 0) {
      console.log('⚠️  Extensão pgvector não encontrada. Tentando habilitar...');
      await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector;`;
      console.log('✅ Extensão pgvector habilitada!');
    } else {
      console.log('✅ Extensão pgvector já está habilitada');
    }
    
    // Verificar se o índice já existe
    const existingIndexes = await prisma.$queryRaw`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'AiDocument' 
      AND indexname LIKE '%embedding%';
    `;
    
    if (existingIndexes.length > 0) {
      console.log('✅ Índice vetorial já existe:', existingIndexes);
      return;
    }
    
    console.log('🚀 Criando índice IVFFlat para busca vetorial...');
    
    // Criar índice vetorial
    await prisma.$executeRaw`
      CREATE INDEX CONCURRENTLY idx_aidocument_embedding_ivfflat 
      ON "AiDocument" USING ivfflat (embedding vector_cosine_ops) 
      WITH (lists = 100);
    `;
    
    console.log('✅ Índice vetorial criado com sucesso!');
    
    // Verificar criação
    const newIndexes = await prisma.$queryRaw`
      SELECT 
          schemaname,
          tablename,
          indexname,
          indexdef
      FROM pg_indexes 
      WHERE tablename = 'AiDocument' 
      AND indexname LIKE '%embedding%';
    `;
    
    console.log('📊 Índices vetoriais criados:');
    console.table(newIndexes);
    
  } catch (error) {
    console.error('❌ Erro ao criar índice vetorial:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  createVectorIndex()
    .then(() => {
      console.log('🎉 Processo concluído!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Falha no processo:', error);
      process.exit(1);
    });
}

export { createVectorIndex };
