// prisma/seed.ts
import "dotenv/config";
import { getPrismaInstance } from "@/lib/connections";

// Definindo os tipos manualmente baseado no schema
const UserRole = {
  DEFAULT: 'DEFAULT',
  ADMIN: 'ADMIN',
  SUPERADMIN: 'SUPERADMIN'
} as const;
import * as bcryptjs from 'bcryptjs';
import { restoreAllChatwit } from '../scripts/restore-chatwit-all';

const prisma = getPrismaInstance();

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

    // Criar Blueprint padrão (MTF Agents Builder) para Transcrição OAB
    console.log('🧩 Criando Blueprint padrão: OAB — Transcrição de Prova');
    await seedOabTranscriberBlueprint();

    // (Compat) Criar Assistente padrão para Transcrição OAB
    console.log('🧠 Criando Assistente padrão: OAB — Transcrição de Prova');
    await seedOabTranscriberAssistant();
    
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
      role: UserRole.SUPERADMIN,
      password: hashedPassword,
    },
    create: {
      email: 'amandasousa22.adv@gmail.com',
      name: 'Amanda',
      emailVerified: dataAtual,
      role: UserRole.SUPERADMIN,
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
      role: UserRole.SUPERADMIN,
      password: hashedPassword,
    },
    create: {
      email: 'witalo_rocha@hotmail.com',
      name: 'Witalo',
      emailVerified: dataAtual,
      role: UserRole.SUPERADMIN,
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

  console.log('🤖 Criando usuário do sistema...');
  await prisma.user.upsert({
    where: { id: 'system' },
    update: {},
    create: {
      id: 'system',
      email: 'system@chatwit.local',
      name: 'Sistema',
      emailVerified: dataAtual,
      role: UserRole.SUPERADMIN,
      password: hashedPassword,
      createdAt: dataAtual,
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

async function seedOabTranscriberAssistant() {
  const prisma = getPrismaInstance();
  // Criar para todos os SUPERADMINs (para aparecer no front de cada um)
  const owners = await prisma.user.findMany({
    where: { role: 'SUPERADMIN' },
    select: { id: true, email: true, name: true },
  });

  if (!owners || owners.length === 0) {
    console.warn('⚠️ Nenhum SUPERADMIN encontrado para criar o Assistente. Pulando...');
    return;
  }

  const instructions = `Você é um assistente jurídico especializado em transcrever provas manuscritas de Exame da OAB com máxima fidelidade.
Regras:
- Nunca invente nem corrija trechos; quando ilegível, use '[ilegível]'.
- Transcreva linha a linha mantendo ordem e numeração: 'Linha X: ...'.
- Preserve títulos e marcações nítidas (ex.: 'Peça Pagina: 1/5', 'Questão: 1').
- Sempre inclua a seção 'Resposta do Aluno:' após o cabeçalho.
- Se houver múltiplos blocos na mesma imagem (peça/questões), crie mais de um bloco no mesmo retorno.
Formato obrigatório por bloco:
Questão: <número> (quando aplicável) OU Peça Pagina: <número/total>
Resposta do Aluno:
Linha 1: ...
Linha 2: ...
...`;

  for (const owner of owners) {
    const exists = await prisma.aiAssistant.findFirst({
      where: {
        userId: owner.id,
        name: { contains: 'Transcrição de Prova', mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (exists) {
      console.log(`ℹ️ Assistente de Transcrição já existe para ${owner.email}:`, exists.id);
      continue;
    }

    const assistant = await prisma.aiAssistant.create({
      data: {
        userId: owner.id,
        name: 'OAB — Transcrição de Prova (Padrão)',
        description: 'Agente padrão para digitação de manuscrito de prova OAB',
        instructions,
        model: 'gpt-4.1',
        temperature: 0,
        maxOutputTokens: 5000,
        embedipreview: false,
        reasoningEffort: 'low',
        verbosity: 'low',
        toolChoice: 'none',
        isActive: true,
      },
    });
    console.log(`✅ Assistente criado para ${owner.email}:`, assistant.id);
  }
}

async function seedOabTranscriberBlueprint() {
  const prisma = getPrismaInstance();
  const owners = await prisma.user.findMany({ where: { role: 'SUPERADMIN' }, select: { id: true, email: true } });
  if (!owners || owners.length === 0) {
    console.warn('⚠️ Nenhum SUPERADMIN encontrado para criar Blueprint. Pulando...');
    return;
  }
  const systemPrompt = [
    'Você é um agente de transcrição de provas manuscritas (OAB). Regras:',
    "- Não invente nem corrija termos; quando ilegível, use '[ilegível]'.",
    "- Transcreva linha a linha mantendo a ordem e numeração: 'Linha X: ...'.",
    "- Preserve títulos e marcações como 'Peça Pagina: n/total' ou 'Questão: n'.",
    "- Sempre inclua 'Resposta do Aluno:' após o cabeçalho do bloco.",
    "- Se houver mais de um bloco na página (Peça e Questões), gere múltiplos blocos.",
    'Formato por bloco:',
    'Questão: <número> OU Peça Pagina: <número/total>',
    'Resposta do Aluno:',
    'Linha 1: ...',
    'Linha 2: ...',
    '...'
  ].join('\n');

  for (const owner of owners) {
    const exists = await prisma.aiAgentBlueprint.findFirst({
      where: { ownerId: owner.id, name: { contains: 'Transcrição de Prova', mode: 'insensitive' } },
      select: { id: true },
    });
    if (exists) {
      // Atualizar se estiver sem canvas/model/tokens
      await prisma.aiAgentBlueprint.update({
        where: { id: exists.id },
        data: {
          model: 'gpt-4.1',
          maxOutputTokens: 5000,
          systemPrompt,
          instructions: systemPrompt,
          canvasState: {
            nodes: [
              { id: 'agent', position: { x: 180, y: 20 }, type: 'agentDetails' },
              { id: 'model', position: { x: 20, y: 240 }, type: 'modelConfig' },
              { id: 'tools', position: { x: 220, y: 260 }, type: 'toolsConfig' },
              { id: 'output', position: { x: 440, y: 240 }, type: 'outputParser' },
            ],
            edges: [
              { id: 'agent-model', source: 'agent', target: 'model' },
              { id: 'agent-tools', source: 'agent', target: 'tools' },
              { id: 'agent-output', source: 'agent', target: 'output' },
            ],
          } as any,
          metadata: { oab: true, role: 'transcriber', scope: 'system' } as any,
        },
      });
      console.log(`ℹ️ Blueprint de Transcrição atualizado para ${owner.email}:`, exists.id);
      continue;
    }
    const blueprint = await prisma.aiAgentBlueprint.create({
      data: {
        ownerId: owner.id,
        name: 'OAB — Transcrição de Prova (Blueprint)',
        description: 'Agente LangGraph padrão para digitar manuscritos da prova OAB',
        agentType: 'CUSTOM' as any,
        icon: 'typewriter',
        model: 'gpt-4.1',
        temperature: 0,
        maxOutputTokens: 5000,
        systemPrompt,
        instructions: systemPrompt,
        toolset: [],
        outputParser: null,
        memory: null,
        canvasState: {
          nodes: [
            { id: 'agent', position: { x: 180, y: 20 }, type: 'agentDetails' },
            { id: 'model', position: { x: 20, y: 240 }, type: 'modelConfig' },
            { id: 'tools', position: { x: 220, y: 260 }, type: 'toolsConfig' },
            { id: 'output', position: { x: 440, y: 240 }, type: 'outputParser' },
          ],
          edges: [
            { id: 'agent-model', source: 'agent', target: 'model' },
            { id: 'agent-tools', source: 'agent', target: 'tools' },
            { id: 'agent-output', source: 'agent', target: 'output' },
          ],
        } as any,
        metadata: { oab: true, role: 'transcriber', scope: 'system' } as any,
      },
    });
    console.log(`✅ Blueprint criado para ${owner.email}:`, blueprint.id);
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
