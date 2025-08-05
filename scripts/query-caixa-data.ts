import { getPrismaInstance } from "@/lib/connections";

const prisma = getPrismaInstance();

async function queryCaixaData(caixaId: string) {
  try {
    console.log(`\n=== DADOS DA CAIXA: ${caixaId} ===\n`);

    // 1. Dados da caixa
    const caixa = await prisma.chatwitInbox.findUnique({
      where: { id: caixaId },
      include: {
        usuarioChatwit: true,
      }
    });

    console.log('📦 CAIXA DE ENTRADA:');
    console.log(JSON.stringify(caixa, null, 2));

    // 2. Mapeamentos de intenção
    const mapeamentos = await prisma.mapeamentoIntencao.findMany({
      where: { inboxId: caixaId },
      include: {
        template: true,
        inbox: true,
      }
    });

    console.log('\n🤖 MAPEAMENTOS DE INTENÇÃO:');
    console.log(JSON.stringify(mapeamentos, null, 2));

    // 3. Templates da caixa
    const templates = await prisma.template.findMany({
      where: { inboxId: caixaId },
      include: {
        interactiveContent: {
          include: {
            header: true,
            body: true,
            footer: true,
            actionCtaUrl: true,
            actionReplyButton: true,
            actionList: true,
            actionFlow: true,
            actionLocationRequest: true,
          }
        }
      }
    });

    console.log('\n📝 TEMPLATES:');
    console.log(JSON.stringify(templates, null, 2));

    // 4. Mapeamentos de botão
    const mapeamentosBotao = await prisma.mapeamentoBotao.findMany({
      where: { inboxId: caixaId }
    });

    console.log('\n🔘 MAPEAMENTOS DE BOTÃO:');
    console.log(JSON.stringify(mapeamentosBotao, null, 2));

    // 5. Agentes Dialogflow
    const agentes = await prisma.agenteDialogflow.findMany({
      where: { inboxId: caixaId }
    });

    console.log('\n🤖 AGENTES DIALOGFLOW:');
    console.log(JSON.stringify(agentes, null, 2));

  } catch (error) {
    console.error('Erro ao consultar dados:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar a consulta
const caixaId = 'cmdpr9tnq000lmu0kh0p74m80';
queryCaixaData(caixaId); 