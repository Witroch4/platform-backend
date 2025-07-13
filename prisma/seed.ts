// prisma/seed.ts
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed do banco de dados...');
  
  // Senha '123456' para ambos os usuários
  const hashedPassword = await bcryptjs.hash('123456', 10);
  const dataAtual = new Date();
  
  console.log('Cadastrando usuário Amanda...');
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

  console.log('Cadastrando usuário Witalo...');
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

  console.log('Cadastrando UsuarioChatwit para Amanda...');
  await prisma.usuarioChatwit.upsert({
    where: { appUserId: amanda.id },
    update: {
      name: 'DraAmandaSousa',
      accountName: 'DraAmandaSousa',
      channel: 'Whatsapp',
      inboxId: 4,
      inboxName: 'WhatsApp - ANA',
      chatwitAccountId: '3', // ID da conta no Chatwit
    },
    create: {
      appUserId: amanda.id,
      externalUserId: 3,
      name: 'DraAmandaSousa',
      accountName: 'DraAmandaSousa',
      channel: 'Whatsapp',
      inboxId: 4,
      inboxName: 'WhatsApp - ANA',
      chatwitAccountId: '3', // ID da conta no Chatwit
    },
  });

  console.log('Cadastrando UsuarioChatwit para Witalo...');
  await prisma.usuarioChatwit.upsert({
    where: { appUserId: witalo.id },
    update: {
      name: 'WitDev MASTER',
      accountName: 'WitDev MASTER',
      channel: 'Api',
      inboxId: 96,
      inboxName: 'teste',
      chatwitAccountId: '1', // ID da conta no Chatwit
    },
    create: {
      appUserId: witalo.id,
      externalUserId: 1,
      name: 'WitDev MASTER',
      accountName: 'WitDev MASTER',
      channel: 'Api',
      inboxId: 96,
      inboxName: 'teste',
      chatwitAccountId: '1', // ID da conta no Chatwit
    },
  });

  console.log('Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 