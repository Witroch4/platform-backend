#!/usr/bin/env tsx

import { getPrismaInstance } from "@/lib/connections";

const prisma = getPrismaInstance();

async function checkDatabase() {
  console.log('🔍 Verificando conteúdo do banco de dados...\n');

  try {
    // Verificar tabelas principais
    console.log('📊 Contagem de registros por tabela:\n');

    // Users
    const userCount = await prisma.user.count();
    console.log(`👥 Users: ${userCount}`);

    // Leads
    const leadCount = await prisma.lead.count();
    console.log(`🎯 Leads: ${leadCount}`);

    // UsuarioChatwit
    const usuarioChatwitCount = await prisma.usuarioChatwit.count();
    console.log(`💬 UsuarioChatwit: ${usuarioChatwitCount}`);

    // LeadChatwit
    const leadChatwitCount = await prisma.leadChatwit.count();
    console.log(`📋 LeadChatwit: ${leadChatwitCount}`);

    // ArquivoLeadChatwit
    const arquivoCount = await prisma.arquivoLeadChatwit.count();
    console.log(`📎 ArquivoLeadChatwit: ${arquivoCount}`);

    // Templates
    const templateCount = await prisma.template.count();
    console.log(`📝 Templates: ${templateCount}`);

    // Automacoes
    const automacaoCount = await prisma.automacao.count();
    console.log(`🤖 Automacoes: ${automacaoCount}`);

    // Agendamentos
    const agendamentoCount = await prisma.agendamento.count();
    console.log(`📅 Agendamentos: ${agendamentoCount}`);

    // Notifications
    const notificationCount = await prisma.notification.count();
    console.log(`🔔 Notifications: ${notificationCount}`);

    // Subscriptions
    const subscriptionCount = await prisma.subscription.count();
    console.log(`💳 Subscriptions: ${subscriptionCount}`);

    console.log('\n' + '='.repeat(50) + '\n');

    // Verificar alguns registros específicos
    console.log('🔍 Amostras de dados:\n');

    // Primeiros 3 users
    const users = await prisma.user.findMany({
      take: 3,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true
      }
    });
    console.log('👥 Primeiros 3 Users:');
    users.forEach(user => {
      console.log(`   - ${user.name} (${user.email}) - ${user.createdAt.toLocaleDateString()}`);
    });

    console.log();

    // Primeiros 3 leads
    const leads = await prisma.lead.findMany({
      take: 3,
      select: {
        igSenderId: true,
        name: true,
        email: true,
        whatsapp: true,
        createdAt: true
      }
    });
    console.log('🎯 Primeiros 3 Leads:');
    leads.forEach(lead => {
      console.log(`   - ${lead.name} (${lead.email}) - ${lead.igSenderId} - ${lead.createdAt.toLocaleDateString()}`);
    });

    console.log();

    // Primeiros 3 templates
    const templates = await prisma.template.findMany({
      take: 3,
      select: {
        id: true,
        name: true,
        type: true,
        createdAt: true
      }
    });
    console.log('📝 Primeiros 3 Templates:');
    templates.forEach(template => {
      console.log(`   - ${template.name} (${template.type}) - ${template.createdAt.toLocaleDateString()}`);
    });

    console.log('\n' + '='.repeat(50) + '\n');

    // Verificar relacionamentos
    console.log('🔗 Verificando relacionamentos:\n');

    // LeadChatwit com arquivos
    const leadChatwitsWithFiles = await prisma.leadChatwit.findMany({
      where: {
        ArquivoLeadChatwit: {
          some: {}
        }
      },
      include: {
        _count: {
          select: {
            ArquivoLeadChatwit: true
          }
        }
      },
      take: 5
    });

    console.log('📎 LeadChatwit com arquivos:');
    leadChatwitsWithFiles.forEach(lead => {
      console.log(`   - ${lead.name}: ${lead._count.ArquivoLeadChatwit} arquivos`);
    });

    console.log();

    // Usuários com LeadChatwit
    const usersWithLeadChatwits = await prisma.usuarioChatwit.findMany({
      where: {
        LeadChatwit: {
          some: {}
        }
      },
      include: {
        _count: {
          select: {
            LeadChatwit: true
          }
        }
      },
      take: 5
    });

    console.log('👥 Usuários com LeadChatwit:');
    usersWithLeadChatwits.forEach(user => {
      console.log(`   - ${user.name}: ${user._count.LeadChatwit} leads`);
    });

    console.log('\n✅ Verificação concluída!');

  } catch (error) {
    console.error('❌ Erro ao verificar banco de dados:', error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  checkDatabase().catch(console.error);
}