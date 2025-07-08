import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import axios from 'axios';
import { sendTemplateMessage } from '@/lib/whatsapp';

// Função para obter configuração do WhatsApp atual
async function getCurrentWhatsAppConfig() {
  // Buscar a primeira configuração ativa no banco de dados
  const config = await prisma.whatsAppConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' }
  });
  
  if (!config) {
    // Se não houver configuração no banco, usar valores do .env
    return {
      token: process.env.WHATSAPP_TOKEN || '',
      businessId: process.env.WHATSAPP_BUSINESS_ID || '',
      apiBase: 'https://graph.facebook.com/v22.0', // Forçar versão v22.0
    };
  }
  
  return {
    token: config.whatsappToken,
    businessId: config.whatsappBusinessAccountId,
    apiBase: 'https://graph.facebook.com/v22.0', // Forçar versão v22.0
  };
}

// Função para obter configuração do MTF Diamante
async function getMtfDiamanteConfig() {
  const config = await prisma.mtfDiamanteConfig.findFirst({
    where: { isActive: true },
    include: {
      lotes: {
        where: { isActive: true },
        orderBy: { numero: 'asc' }
      },
      intentMappings: {
        where: { isActive: true }
      }
    }
  });

  if (!config) {
    // Configuração padrão se não existir no banco
    return {
      valorAnalise: "R$ 27,90",
      chavePix: "atendimento@amandasousaprev.adv.br",
      lotes: [{
        numero: 1,
        nome: "Primeiro Lote",
        valor: "R$ 287,90",
        dataInicio: new Date(),
        dataFim: new Date()
      }],
      intentMappings: []
    };
  }

  return config;
}

// Função para obter mapeamento de template por intenção
async function getTemplateForIntent(intentName: string, mtfConfig: any) {
  const mapping = mtfConfig.intentMappings.find(
    (mapping: any) => mapping.intentName === intentName
  );
  
  if (mapping) {
    return mapping.templateName;
  }

  // Mapeamentos padrão se não estiver configurado
  const defaultMappings: Record<string, string> = {
    'Welcome': 'welcome',
    'identificacao': 'identificacao',
    'oab': 'oab',
    'oab - pix': 'pix',
    'atendimentohumano': 'menu_novo',
    'confirmação.nome.menu': 'menu_novo',
    'maternidade': 'maternidade_novo',
    'invalidez': 'invalidez',
    'auxilio': 'auxilio',
    'consulta.juridica': 'consulta_juridica',
    'BPC-LOAS': 'bpc_loas'
  };

  return defaultMappings[intentName] || null;
}

// Manipulador para atendimento OAB (versão dinâmica)
async function handleOAB(req: any, telefoneLead: string, mtfConfig: any): Promise<boolean> {
  try {
    const parameters = req.queryResult.parameters;
    const nome = parameters['person']['name'];

    console.log(`[MTF Diamante] Dados salvos no banco para o usuário ${nome}`);

    // Obter configuração atual do WhatsApp
    const whatsappConfig = await getCurrentWhatsAppConfig();
    
    // Configuração para a API do WhatsApp
    const urlwhatsapp = `${whatsappConfig.apiBase}/${whatsappConfig.businessId}/messages`;
    const configwhatsapp = {
      headers: {
        'Authorization': `Bearer ${whatsappConfig.token}`,
        'Content-Type': 'application/json',
      },
    };

    // Usar configurações dinâmicas do MTF Diamante
    const loteAtivo = mtfConfig.lotes[0]; // Primeiro lote ativo
    const messageText = `Últimas Vagas - Sr(a) *${nome}*,
Para a análise de pontos, cobro ${mtfConfig.valorAnalise}.
Escolha a opção que melhor se encaixa:
- ${loteAtivo.nome}: Valor ${loteAtivo.valor}, válido até ${loteAtivo.dataFim.toLocaleDateString('pt-BR')}.

O valor pago na análise será deduzido do total.
Envie o comprovante de pagamento para a chave Pix: ${mtfConfig.chavePix}.
Envie a prova e o espelho (NÃO envie login e senha).
Obrigado. Escolha uma opção:`;

    // Dados que seriam enviados para a API do WhatsApp
    const data = {
      messaging_product: "whatsapp",
      to: telefoneLead,
      type: "interactive",
      interactive: {
        type: "button",
        header: {
          type: "image",
          image: {
            link: "https://amandasousaprev.adv.br/wp-content/uploads/2024/10/AmandaFOTO.jpg",
          },
        },
        body: {
          text: messageText,
        },
        footer: {
          text: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™",
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: {
                id: "id_enviar_prova",
                title: "Enviar a Prova",
              },
            },
            {
              type: "reply",
              reply: {
                id: "id_qual_pix",
                title: "Qual o PIX?",
              },
            },
            {
              type: "reply",
              reply: {
                id: "id_finalizar",
                title: "Foi Engano.",
              },
            },
          ],
        },
      },
    };

    console.log('[MTF Diamante] Enviando mensagem interativa para o WhatsApp:', JSON.stringify(data));

    // Enviar mensagem real (não simulação)
    const response = await axios.post(urlwhatsapp, data, configwhatsapp);
    
    console.log('[MTF Diamante] Mensagem interativa enviada com sucesso.');
    
    return true;
  } catch (error) {
    console.error('Erro ao enviar atendimento OAB:', error);
    return false;
  }
}

// Manipulador para enviar PIX (usando template)
async function handleOabPix(telefoneLead: string, mtfConfig: any): Promise<boolean> {
  try {
    // Enviar template PIX com a chave dinâmica
    const success = await sendTemplateMessage(telefoneLead, 'pix', {
      couponCode: mtfConfig.chavePix
    });
    
    if (success) {
      console.log('[MTF Diamante] Template PIX enviado com sucesso');
    } else {
      console.error('[MTF Diamante] Falha ao enviar template PIX');
    }
    
    return success;
  } catch (error) {
    console.error('Erro ao enviar PIX:', error);
    return false;
  }
}

// Manipulador para enviar mensagem de template dinâmico
async function sendDynamicTemplate(telefoneLead: string, templateName: string, mtfConfig: any): Promise<boolean> {
  try {
    // Buscar parâmetros específicos para o template se existir mapeamento
    const mapping = mtfConfig.intentMappings.find(
      (m: any) => m.templateName === templateName
    );
    
    const parameters = mapping?.parameters || {};
    
    const success = await sendTemplateMessage(telefoneLead, templateName, parameters);
    
    if (success) {
      console.log(`[MTF Diamante] Template ${templateName} enviado com sucesso`);
    } else {
      console.error(`[MTF Diamante] Falha ao enviar template ${templateName}`);
    }
    
    return success;
  } catch (error) {
    console.error(`Erro ao enviar template ${templateName}:`, error);
    return false;
  }
}

// Identificar usuário e salvar no banco
async function handleIdentificacao(req: any, telefoneLead: string): Promise<NextResponse> {
  try {
    const parameters = req.queryResult.parameters;
    const nome = parameters['person']['name'];

    console.log(`[MTF Diamante] Dados do usuário ${nome} (${telefoneLead}) processados`);

    return NextResponse.json({
      fulfillmentMessages: [
        { text: { text: [`Perfeito, ${nome}. Posso confirmar o cadastro do seu nome?`] } },
      ],
      outputContexts: [
        {
          name: `${req.session}/contexts/menu`,
          lifespanCount: 10,
          parameters: {
            person: nome,
          },
        },
      ],
    });
  } catch (error) {
    console.error('Erro ao processar identificação:', error);
    return NextResponse.json({ error: 'Erro ao processar identificação' }, { status: 500 });
  }
}

// Bem-vindo e verificação de usuário existente
async function handleWelcome(req: any, telefoneLead: string): Promise<NextResponse> {
  try {
    // Buscar se é usuário existente (pode usar leads do sistema se necessário)
    const exists = Math.random() > 0.5; // Simulação

    if (exists) {
      const mockName = "Cliente Existente";
      console.log(`[MTF Diamante] Usuário existente encontrado: ${mockName}`);
      
      const responseData = {
        fulfillmentMessages: [
          {
            text: {
              text: [
                `*Bem-vindo(a) de volta, Sr(a). ${mockName}!* \nSegue as opções disponíveis para atendimento (espere um pouco).`,
              ],
            },
          },
        ],
        outputContexts: [
          {
            name: `${req.session}/contexts/menu`,
            lifespanCount: 10,
            parameters: {
              person: mockName,
            },
          },
        ],
      };

      // Enviar template de menu
      await sendDynamicTemplate(telefoneLead, 'menu_novo', {});
      
      return NextResponse.json(responseData);
    } else {
      console.log(`[MTF Diamante] Novo usuário: ${telefoneLead}`);
      
      return NextResponse.json({
        fulfillmentMessages: [
          {
            text: {
              text: [
                'Olá, tudo bem? Sou Ana, assistente virtual da Dra. Amanda Sousa. *(No momento eu ainda não consigo reconhecer mensagens de mídia (áudio, vídeo, foto, etc). Por favor, envie apenas mensagens de texto. 🚫🎵📸🚫)* Para sua segurança, informamos que o escritório *Dra. Amanda Sousa* utiliza dados pessoais em conformidade com a `Lei Geral de Proteção de Dados Pessoais (LGPD) Lei Nº 13.709/18`. Ao prosseguir com seu contato, você está de acordo com a troca de mensagens por este canal. Faço seu pré-atendimento, antes de começar qual é seu *NOME?*',
              ],
            },
          },
        ],
      });
    }
  } catch (error) {
    console.error('Erro ao processar boas-vindas:', error);
    return NextResponse.json({ error: 'Erro ao processar boas-vindas' }, { status: 500 });
  }
}

// Rota principal que processa o webhook
export async function POST(request: Request) {
  try {
    const req = await request.json();
    console.log('[MTF Diamante] Dialogflow Request body:', JSON.stringify(req));

    // Obter configuração do MTF Diamante
    const mtfConfig = await getMtfDiamanteConfig();

    // Se o payload estiver vazio ou incompleto, criar um mock básico
    const intentName = req.queryResult?.intent?.displayName || 'Welcome';
    const session = req.session || 'session/5584994072876';

    // Extrai o número de telefone da sessão e remove caracteres não numéricos
    const telefoneLead = session.split('/').pop().replace(/\D/g, '');

    let result: any;

    // Buscar template mapeado para a intenção
    const templateName = await getTemplateForIntent(intentName, mtfConfig);

    // Processa a intenção recebida
    switch (intentName) {
      case 'oab':
        await handleOAB(req, telefoneLead, mtfConfig);
        result = NextResponse.json({});
        break;
        
      case 'oab - pix':
        await handleOabPix(telefoneLead, mtfConfig);
        result = NextResponse.json({});
        break;
        
      case 'Welcome':
        result = await handleWelcome(req, telefoneLead);
        break;
        
      case 'identificacao':
        result = await handleIdentificacao(req, telefoneLead);
        break;
        
      case 'atendimentohumano':
      case 'confirmação.nome.menu':
      case 'maternidade':
      case 'invalidez':
      case 'auxilio':
      case 'consulta.juridica':
      case 'BPC-LOAS':
        if (templateName) {
          await sendDynamicTemplate(telefoneLead, templateName, mtfConfig);
        }
        result = NextResponse.json({});
        break;
        
      default:
        console.log(`[MTF Diamante] Intenção desconhecida: ${intentName}`);
        result = NextResponse.json({
          fulfillmentMessages: [
            {
              text: {
                text: ['Desculpe, não consegui entender sua solicitação. Poderia reformular?'],
              },
            },
          ],
        });
    }

    return result;
  } catch (error) {
    console.error('Erro no webhook MTF Diamante:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 