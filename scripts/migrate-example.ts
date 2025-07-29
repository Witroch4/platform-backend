#!/usr/bin/env tsx

import { DataMigrator } from './migrate-data-to-new-schema';

// Exemplo de uso do migrador de dados

async function example() {
  console.log('📋 Exemplo de migração de dados:\n');

  console.log('🎯 Este script migra dados do banco restaurado para o novo schema:');
  console.log('   - LeadChatwit → Lead + LeadOabData');
  console.log('   - ArquivoLeadChatwit → ArquivoLeadOab');
  console.log('   - Mantém relacionamentos e dados');
  console.log('   - Preserva IDs originais');
  console.log('   - Não duplica registros existentes\n');

  console.log('🚀 Para executar a migração:');
  console.log('   npx tsx scripts/migrate-data-to-new-schema.ts\n');

  console.log('📊 O que será migrado:');
  console.log('   ✅ Users (se não existirem)');
  console.log('   ✅ UsuarioChatwit (se não existirem)');
  console.log('   ✅ LeadChatwit → Lead + LeadOabData');
  console.log('   ✅ ArquivoLeadChatwit → ArquivoLeadOab');
  console.log('   ✅ Notifications (se não existirem)\n');

  console.log('🔧 Pré-requisitos:');
  console.log('   1. Banco restaurado com dados antigos');
  console.log('   2. Schema novo aplicado (prisma db push)');
  console.log('   3. Prisma Client regenerado (prisma generate)\n');

  console.log('⚠️ Importante:');
  console.log('   - O script é idempotente (pode rodar múltiplas vezes)');
  console.log('   - Não duplica dados existentes');
  console.log('   - Preserva todos os relacionamentos');
  console.log('   - Mantém a integridade dos dados');
}

if (require.main === module) {
  example();
}