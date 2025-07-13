#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixUsuarioChatwitWithSQL() {
  console.log('🔄 Adicionando coluna appUserId via SQL...');

  try {
    // 1. Adicionar a coluna como nullable
    await prisma.$executeRaw`ALTER TABLE "UsuarioChatwit" ADD COLUMN IF NOT EXISTS "appUserId" TEXT`;
    console.log('✅ Coluna appUserId adicionada');

    // 2. Buscar o primeiro usuário do sistema
    const firstUser = await prisma.user.findFirst({
      orderBy: { createdAt: 'asc' }
    });

    if (!firstUser) {
      throw new Error('Nenhum usuário encontrado no sistema');
    }

    console.log(`📊 Usando usuário: ${firstUser.name || firstUser.email} (${firstUser.id})`);

    // 3. Atualizar todos os UsuarioChatwit com o primeiro usuário
    await prisma.$executeRaw`
      UPDATE "UsuarioChatwit" 
      SET "appUserId" = ${firstUser.id}
      WHERE "appUserId" IS NULL
    `;
    console.log('✅ Registros atualizados');

    // 4. Tornar a coluna NOT NULL
    await prisma.$executeRaw`ALTER TABLE "UsuarioChatwit" ALTER COLUMN "appUserId" SET NOT NULL`;
    console.log('✅ Coluna tornada NOT NULL');

    // 5. Adicionar constraint UNIQUE (se não existir)
    try {
      await prisma.$executeRaw`ALTER TABLE "UsuarioChatwit" ADD CONSTRAINT "UsuarioChatwit_appUserId_key" UNIQUE ("appUserId")`;
      console.log('✅ Constraint UNIQUE adicionada');
    } catch (error) {
      console.log('⚠️  Constraint UNIQUE já existe ou erro:', error);
    }

    // 6. Adicionar foreign key (se não existir)
    try {
      await prisma.$executeRaw`
        ALTER TABLE "UsuarioChatwit" ADD CONSTRAINT "UsuarioChatwit_appUserId_fkey" 
        FOREIGN KEY ("appUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `;
      console.log('✅ Foreign key adicionada');
    } catch (error) {
      console.log('⚠️  Foreign key já existe ou erro:', error);
    }

    console.log('\n🎉 Processo concluído! Agora você pode executar "npx prisma db push"');

  } catch (error) {
    console.error('❌ Erro durante o processo:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  fixUsuarioChatwitWithSQL().catch(console.error);
}

export { fixUsuarioChatwitWithSQL }; 