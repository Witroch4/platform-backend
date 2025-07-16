import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import axios from 'axios';

// Tipos do Dialogflow e WhatsApp
interface DialogflowRequest {
  queryResult: {
    intent: {
      displayName: string;
    };
    parameters: { [key: string]: any };
  };
  session: string;
  originalDetectIntentRequest?: {
    payload?: {
      phoneNumberId?: string;
      [key: string]: any;
    };
  };
}

// --- FUNÇÕES DE ENVIO (REUTILIZADAS E MELHORADAS) ---

async function sendWhatsAppMessage(phoneNumberId: string, token: string, data: any) {
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  try {
    await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Mensagem WhatsApp enviada com sucesso:', JSON.stringify(data));
  } catch (error: any) {
    console.error('Erro ao enviar mensagem WhatsApp:', error.response?.data || error.message);
    throw new Error('Falha ao enviar mensagem via WhatsApp API.');
  }
}

async function sendWhatsAppTemplate(
  config: { phoneNumberId: string; token: string },
  to: string,
  template: { name: string; components: any; language?: string }
) {
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language || 'pt_BR' },
      components: template.components || [],
    },
  };
  await sendWhatsAppMessage(config.phoneNumberId, config.token, data);
}

async function sendInteractiveMessage(
  config: { phoneNumberId: string; token: string },
  to: string,
  message: {
    texto: string;
    headerTipo?: string | null;
    headerConteudo?: string | null;
    rodape?: string | null;
    botoes: { id: string; titulo: string }[];
  }
) {
  const interactive: any = {
    type: 'button',
    body: { text: message.texto },
    action: {
      buttons: message.botoes.map(btn => ({
        type: 'reply',
        reply: { id: btn.id, title: btn.titulo },
      })),
    },
  };

  if (message.headerTipo && message.headerConteudo) {
    interactive.header = {
      type: message.headerTipo.toLowerCase(),
      [message.headerTipo.toLowerCase()]: 
        message.headerTipo.toLowerCase() === 'text' 
        ? { text: message.headerConteudo } 
        : { link: message.headerConteudo },
    };
  }
  if (message.rodape) {
    interactive.footer = { text: message.rodape };
  }

  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive,
  };
  await sendWhatsAppMessage(config.phoneNumberId, config.token, data);
}

// --- LÓGICA PRINCIPAL DO WEBHOOK (POST) ---

export async function POST(request: NextRequest) {
  try {
    const body: DialogflowRequest = await request.json();
    console.log('Webhook recebido:', JSON.stringify(body, null, 2));

    const intentName = body.queryResult?.intent?.displayName;
    const phoneNumberId = body.originalDetectIntentRequest?.payload?.phoneNumberId;
    const waid = body.session?.split('/').pop() || '';

    if (!intentName || !phoneNumberId || !waid) {
      console.error('Dados essenciais faltando no payload:', { intentName, phoneNumberId, waid });
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }

    // 1. Encontrar a configuração do WhatsApp com base no phoneNumberId
    let config = await db.configuracaoWhatsApp.findFirst({
      where: { phoneNumberId },
      include: { caixaEntrada: true },
    });

    // Fallback: se não achar config específica, busca a padrão (sem caixa associada)
    if (!config) {
        config = await db.configuracaoWhatsApp.findFirst({
            where: { caixaEntradaId: null },
            include: { caixaEntrada: true }, // será null, mas mantém a estrutura
        });
    }

    if (!config) {
      console.error(`Nenhuma configuração do WhatsApp encontrada para phoneNumberId: ${phoneNumberId} ou como padrão.`);
      return NextResponse.json({ error: 'Configuração não encontrada' }, { status: 404 });
    }

    // 2. Determinar a Caixa de Entrada (a específica ou a de fallback)
    let caixaId = config.caixaEntradaId;
    let caixaDeOrigem = config.caixaEntrada;

    if (!caixaId || !caixaDeOrigem) {
        console.warn(`Configuração ${config.id} não está associada a uma caixa. Operação pode ser limitada.`);
        // Decide-se o que fazer aqui. Por agora, vamos parar para evitar erros.
        return NextResponse.json({ error: 'Configuração de WhatsApp não associada a uma caixa de entrada.' }, { status: 404 });
    }
    
    console.log(`Processando para a caixa: ${caixaDeOrigem.nome} (ID: ${caixaId})`);

    // 3. Buscar o Mapeamento da Intenção na caixa atual
    let mapeamento = await db.mapeamentoIntencao.findUnique({
      where: { intentName_caixaEntradaId: { intentName, caixaEntradaId: caixaId } },
      include: { template: true, mensagemInterativa: { include: { botoes: true } } },
    });

    // 4. Lógica de Fallback para outra caixa, se configurado
    if (!mapeamento && caixaDeOrigem.fallbackParaCaixaId) {
      console.log(`Mapeamento não encontrado. Tentando fallback para a caixa: ${caixaDeOrigem.fallbackParaCaixaId}`);
      mapeamento = await db.mapeamentoIntencao.findUnique({
        where: { intentName_caixaEntradaId: { intentName, caixaEntradaId: caixaDeOrigem.fallbackParaCaixaId } },
        include: { template: true, mensagemInterativa: { include: { botoes: true } } },
      });
    }

    // 5. Executar a Ação (Enviar Template ou Mensagem Interativa)
    if (mapeamento) {
      if (mapeamento.template) {
        console.log(`Enviando template: ${mapeamento.template.name}`);
        await sendWhatsAppTemplate(
          { phoneNumberId, token: config.token },
          waid,
          mapeamento.template
        );
      } else if (mapeamento.mensagemInterativa) {
        console.log(`Enviando mensagem interativa: ${mapeamento.mensagemInterativa.nome}`);
        await sendInteractiveMessage(
          { phoneNumberId, token: config.token },
          waid,
          mapeamento.mensagemInterativa
        );
      }
      return NextResponse.json({ success: true, message: 'Ação executada com sucesso.' });
    }

    // 6. Se nenhum mapeamento for encontrado
    console.log(`Nenhum mapeamento de intenção encontrado para "${intentName}" na caixa ${caixaId} ou em seu fallback.`);
    return NextResponse.json({
      fulfillmentMessages: [{ text: { text: ['Desculpe, não entendi o que você quis dizer.'] } }],
    });

  } catch (error: any) {
    console.error('Erro fatal no webhook:', error);
    return NextResponse.json({ error: 'Erro interno do servidor', details: error.message }, { status: 500 });
  }
}

// --- VERIFICAÇÃO DO WEBHOOK (GET) ---

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook do WhatsApp verificado com sucesso!');
    return new NextResponse(challenge);
  }

  console.error('Falha na verificação do webhook do WhatsApp.');
  return NextResponse.json({ error: 'Verificação falhou' }, { status: 403 });
}