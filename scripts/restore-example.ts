#!/usr/bin/env tsx

import { PostgresRestorer } from "./restore-postgres-dump";

// Exemplo de uso do restaurador de PostgreSQL

async function example() {
	console.log("📋 Exemplos de uso do PostgresRestorer:\n");

	// Exemplo 1: Restaurar com arquivo padrão
	console.log("1️⃣ Restaurar com arquivo padrão:");
	console.log("   npx tsx scripts/restore-postgres-dump.ts\n");

	// Exemplo 2: Restaurar com arquivo específico
	console.log("2️⃣ Restaurar com arquivo específico:");
	console.log("   npx tsx scripts/restore-postgres-dump.ts faceApp_backup_2025-07-28_00_00_01_1MB.sql.gz\n");

	// Exemplo 3: Usar programaticamente
	console.log("3️⃣ Usar programaticamente:");
	console.log(`
   import { PostgresRestorer } from './scripts/restore-postgres-dump';
   
   const restorer = new PostgresRestorer({
     dumpFile: 'meu_backup.sql.gz',
     dbName: 'meuBanco',
     dbUser: 'postgres',
     dbPassword: 'postgres'
   });
   
   await restorer.restore();
  `);

	// Exemplo 4: Listar arquivos disponíveis
	console.log("4️⃣ Listar arquivos de backup disponíveis:");
	console.log('   Get-ChildItem backups -Name "*.sql.gz"\n');

	console.log("🎯 O script irá:");
	console.log("   ✅ Verificar se o Docker está rodando");
	console.log("   ✅ Fazer backup do banco atual");
	console.log("   ✅ Dropar e recriar o banco");
	console.log("   ✅ Restaurar o dump");
	console.log("   ✅ Aplicar migrações do Prisma");
	console.log("   ✅ Regenerar Prisma Client");
	console.log("   ✅ Reiniciar a aplicação");
}

if (require.main === module) {
	example();
}
