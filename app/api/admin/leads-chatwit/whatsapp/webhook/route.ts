import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import axios from 'axios';

// Configuração base para WhatsApp API
const WHATSAPP_API_BASE_URL = 'https://graph.facebook.com/v18.0';

interface DialogflowRequest {
  queryResult: {
    intent: {
      displayName: string;
    };
    parameters: {
      person?: {
        name: string;
      };
      [key: string]: any;
    };
  };
  session: string;
  originalDetectIntentRequest?: {
    payload?: {
      token?: string;
      phoneNumberId?: string;
      waid?: string;
      messageId?: string;
      [key: string]: any;
    };
  };
}

interface WhatsAppConfig {
  headers: {
    'Authorization': string;
    'Content-Type': string;
  };
}

// Função para sanitizar chaves do Firebase
function sanitizeKey(key: string): string {
  return key.replace(/[.#$[\]]/g, '_');
}

// Função para enviar mensagem WhatsApp
async function sendWhatsAppMessage(
  phoneNumberId: string,
  token: string,
  data: any
): Promise<void> {
  const config: WhatsAppConfig = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  const url = `${WHATSAPP_API_BASE_URL}/${phoneNumberId}/messages`;
  
  try {
    await axios.post(url, data, config);
    console.log('Mensagem WhatsApp enviada com sucesso:', data);
  } catch (error) {
    console.error('Erro ao enviar mensagem WhatsApp:', error);
    throw error;
  }
}

// Função para enviar template WhatsApp
async function sendWhatsAppTemplate(
  phoneNumberId: string,
  token: string,
  to: string,
  templateName: string,
  imageUrl?: string,
  parameters?: any[]
): Promise<void> {
  const components = [];
  
  if (imageUrl) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'image',
          image: { link: imageUrl }
        }
      ]
    });
  }

  if (parameters && parameters.length > 0) {
    components.push({
      type: 'body',
      parameters: parameters
    });
  }

  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'pt_BR' },
      components: components
    }
  };

  await sendWhatsAppMessage(phoneNumberId, token, data);
}

// Função para enviar mensagem interativa
async function sendInteractiveMessage(
  phoneNumberId: string,
  token: string,
  to: string,
  messageData: {
    headerType?: 'text' | 'image';
    headerContent?: string;
    bodyText: string;
    footerText?: string;
    buttons: Array<{
      id: string;
      title: string;
    }>;
  }
): Promise<void> {
  const interactive: any = {
    type: 'button',
    body: { text: messageData.bodyText },
    action: {
      buttons: messageData.buttons.map(btn => ({
        type: 'reply',
        reply: {
          id: btn.id,
          title: btn.title
        }
      }))
    }
  };

  if (messageData.headerType === 'image' && messageData.headerContent) {
    interactive.header = {
      type: 'image',
      image: { link: messageData.headerContent }
    };
  } else if (messageData.headerType === 'text' && messageData.headerContent) {
    interactive.header = {
      type: 'text',
      text: messageData.headerContent
    };
  }

  if (messageData.footerText) {
    interactive.footer = { text: messageData.footerText };
  }

  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: interactive
  };

  await sendWhatsAppMessage(phoneNumberId, token, data);
}

// Handler para intenção OAB
async function handleOabIntent(
  req: DialogflowRequest,
  phoneNumber: string,
  payload: any
): Promise<NextResponse> {
  const parameters = req.queryResult.parameters;
  const nome = parameters?.person?.name || 'Cliente';
  
  try {
    // Buscar configurações de lote ativo
    const loteAtivo = await prisma.loteOab.findFirst({
      where: { ativo: true }
    });

    if (!loteAtivo) {
      throw new Error('Nenhum lote ativo encontrado');
    }

    // Buscar mensagem interativa configurada para OAB
    const mensagemOab = await prisma.mensagemInterativa.findFirst({
      where: { 
        tipo: 'oab',
        ativo: true 
      },
      include: { botoes: true }
    });

    if (!mensagemOab) {
      throw new Error('Mensagem OAB não configurada');
    }

    // Salvar lead no banco
    await prisma.leadOab.create({
      data: {
        nome: nome,
        telefone: phoneNumber,
        loteId: loteAtivo.id,
        usuarioChatwitId: loteAtivo.usuarioChatwitId,
        payload: payload ? JSON.stringify(payload) : null
      }
    });

    // Montar texto da mensagem com dados dinâmicos
    const messageText = mensagemOab.texto
      .replace('{{nome}}', nome)
      .replace('{{valor_analise}}', loteAtivo.valorAnalise.toString())
      .replace('{{valor_lote}}', loteAtivo.valor.toString())
      .replace('{{pix}}', loteAtivo.chavePix);

    // Enviar mensagem interativa
    await sendInteractiveMessage(
      payload?.phoneNumberId,
      payload?.token,
      phoneNumber,
      {
        headerType: mensagemOab.headerTipo as 'text' | 'image',
        headerContent: mensagemOab.headerConteudo ?? undefined,
        bodyText: messageText,
        footerText: mensagemOab.rodape ?? undefined,
        buttons: mensagemOab.botoes.map((btn: any) => ({
          id: btn.id,
          title: btn.titulo
        }))
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro no handler OAB:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// Handler para atendimento humano
async function handleAtendimentoHumano(
  req: DialogflowRequest,
  phoneNumber: string,
  payload: any
): Promise<NextResponse> {
  try {
    const template = await prisma.whatsAppTemplate.findFirst({
      where: { 
        name: 'menu_novo',
        status: 'APPROVED'
      }
    });

    if (template) {
      await sendWhatsAppTemplate(
        payload?.phoneNumberId,
        payload?.token,
        phoneNumber,
        template.name,
        template.publicMediaUrl ?? undefined
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro no handler atendimento humano:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// Handler para exibir payload (debug)
async function handleExibirPayload(req: DialogflowRequest): Promise<NextResponse> {
  const payload = req.originalDetectIntentRequest?.payload;
  
  console.log('Payload recebido:', JSON.stringify(payload, null, 2));
  
  const fulfillmentText = (payload && Object.keys(payload).length > 0)
    ? `✅ SUCESSO! Payload recebido:\n\n${JSON.stringify(payload, null, 2)}`
    : '❌ Falha: Payload não encontrado em originalDetectIntentRequest.payload.';

  return NextResponse.json({
    fulfillmentMessages: [{
      text: {
        text: [fulfillmentText]
      }
    }]
  });
}

// Handler principal do webhook
export async function POST(request: NextRequest) {
  try {
    const body: DialogflowRequest = await request.json();
    
    console.log('Webhook recebido:', JSON.stringify(body, null, 2));
    
    const intentName = body.queryResult?.intent?.displayName;
    const session = body.session || '';
    const phoneNumber = session.split('/').pop()?.replace(/\D/g, '') || '';
    const payload = body.originalDetectIntentRequest?.payload;

    // Log do payload para debug
    console.log('Payload extraído:', JSON.stringify(payload, null, 2));

    switch (intentName) {
      case 'oab':
        return await handleOabIntent(body, phoneNumber, payload);
      
      case 'atendimentohumano':
        return await handleAtendimentoHumano(body, phoneNumber, payload);
      
      case 'exibirpayload':
        return await handleExibirPayload(body);
      
      default:
        console.log(`Intenção não reconhecida: ${intentName}`);
        return NextResponse.json({ 
          fulfillmentMessages: [{
            text: {
              text: ['Intenção não reconhecida']
            }
          }]
        });
    }
  } catch (error) {
    console.error('Erro no webhook:', error);
    return NextResponse.json({ 
      error: 'Erro interno do servidor' 
    }, { status: 500 });
  }
}

// Handler para verificação do webhook (GET)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  // Verificação do webhook do WhatsApp
  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verificado com sucesso');
    return new NextResponse(challenge);
  }

  return NextResponse.json({ error: 'Verificação falhou' }, { status: 403 });
}
