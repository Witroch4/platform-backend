// prisma/seed.ts
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcryptjs from 'bcryptjs';
import { restoreAllChatwit } from '../scripts/restore-chatwit-all';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando seed do banco de dados...');
  
  try {
    // Primeiro, executar o seed padrão para criar os usuários
    console.log('🌱 Executando seed de usuários administradores...');
    const { amandaChatwit } = await seedPadrao();
    
    // Configurar WhatsApp e Chatwit automaticamente
    console.log('⚙️ Configurando WhatsApp e Chatwit automaticamente...');
    await configurarWhatsAppEChatwit(amandaChatwit);
    
    // Depois, executar o restore do Chatwit
    console.log('🔄 Executando restore do Chatwit...');
    await restoreAllChatwit();
    
    console.log('✅ Seed e restore concluídos com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante o seed/restore:', error);
    throw error;
  }
}

async function seedPadrao() {
  console.log('Iniciando seed padrão do banco de dados...');
  
  // Senha '123456' para ambos os usuários
  const hashedPassword = await bcryptjs.hash('123456', 10);
  const dataAtual = new Date();
  
  console.log('👤 Criando usuário Amanda...');
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

  console.log('👤 Criando usuário Witalo...');
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

  console.log('📱 Criando UsuarioChatwit para Amanda...');
  const amandaChatwit = await prisma.usuarioChatwit.upsert({
    where: { appUserId: amanda.id },
    update: {
      name: 'DraAmandaSousa',
      accountName: 'DraAmandaSousa',
      channel: 'Whatsapp',
      chatwitAccountId: '3', // ID da conta no Chatwit
    },
    create: {
      appUserId: amanda.id,
      name: 'DraAmandaSousa',
      accountName: 'DraAmandaSousa',
      channel: 'Whatsapp',
      chatwitAccountId: '3', // ID da conta no Chatwit
    },
  });

  console.log('📱 Criando UsuarioChatwit para Witalo...');
  await prisma.usuarioChatwit.upsert({
    where: { appUserId: witalo.id },
    update: {
      name: 'WitDev MASTER',
      accountName: 'WitDev MASTER',
      channel: 'Api',
      chatwitAccountId: '1', // ID da conta no Chatwit
    },
    create: {
      appUserId: witalo.id,
      name: 'WitDev MASTER',
      accountName: 'WitDev MASTER',
      channel: 'Api',
      chatwitAccountId: '1', // ID da conta no Chatwit
    },
  });

  console.log('✅ Seed de usuários concluído!');
  return { amandaChatwit };
}

async function configurarWhatsAppEChatwit(amandaChatwit: any) {
  try {
    // Configurar WhatsApp Global
    console.log('📱 Configurando WhatsApp Global...');
    await prisma.whatsAppGlobalConfig.upsert({
      where: { usuarioChatwitId: amandaChatwit.id },
      update: {
        phoneNumberId: '274633962398273',
        whatsappBusinessAccountId: '294585820394901',
        whatsappApiKey: 'EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbjXeDpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc',
        graphApiBaseUrl: 'https://graph.facebook.com/v22.0',
        updatedAt: new Date()
      },
      create: {
        usuarioChatwitId: amandaChatwit.id,
        phoneNumberId: '274633962398273',
        whatsappBusinessAccountId: '294585820394901',
        whatsappApiKey: 'EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbjXeDpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc',
        graphApiBaseUrl: 'https://graph.facebook.com/v22.0'
      }
    });

    // Configurar Chatwit Access Token
    console.log('🔑 Configurando Chatwit Access Token...');
    await prisma.usuarioChatwit.update({
      where: { id: amandaChatwit.id },
      data: {
        chatwitAccessToken: 'XzqGPinpcBhwkfyyjuyShBgD'
      }
    });

    console.log('✅ Configurações do WhatsApp e Chatwit salvas automaticamente!');
  } catch (error) {
    console.error('❌ Erro ao configurar WhatsApp/Chatwit:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 