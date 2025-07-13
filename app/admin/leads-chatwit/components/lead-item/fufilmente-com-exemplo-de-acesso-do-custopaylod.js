'use strict';

// Importação dos módulos
const axios = require('axios');
const { onRequest } = require('firebase-functions/v2/https'); // Cloud Functions Geração 2
const { logger } = require('firebase-functions'); // Logger integrado do Firebase
const admin = require('firebase-admin');

// --- INICIALIZAÇÃO E CONFIGURAÇÃO ---

// Inicialize o Firebase Admin SDK uma única vez
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: 'https://chatbotamanda-vuqb-default-rtdb.firebaseio.com/',
});

// Configuração para a API do WhatsApp com o token hardcoded
const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0/274633962398273/messages';
const configWhatsApp = {
  headers: {
    'Authorization': 'Bearer EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbjXeDpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc',
    'Content-Type': 'application/json',
  },
};

// --- FUNÇÕES DE LÓGICA DO WHATSAPP ---

/**
 * Envia uma mensagem genérica para a API do WhatsApp.
 * @param {object} data O corpo da requisição para a API do WhatsApp.
 */
async function enviarMensagemWhatsApp(data) {
  try {
    await axios.post(WHATSAPP_API_URL, data, configWhatsApp);
    logger.info('Mensagem do WhatsApp enviada com sucesso.', { data });
  } catch (error) {
    logger.error('Erro ao enviar mensagem via WhatsApp:', {
      error: error.response?.data || error.message,
    });
    throw new Error('Falha no envio da mensagem do WhatsApp.');
  }
}

/**
 * Função reutilizável para enviar templates com imagem do WhatsApp.
 * @param {string} to - O número do destinatário.
 * @param {string} templateName - O nome do modelo de mensagem.
 * @param {string} imageUrl - A URL da imagem para o cabeçalho.
 */
async function enviarTemplateWhatsApp(to, templateName, imageUrl) {
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'pt_BR' },
      components: [
        {
          type: 'header',
          parameters: [{ type: 'image', image: { link: imageUrl } }],
        },
      ],
    },
  };
  await enviarMensagemWhatsApp(data);
}

// --- FUNÇÕES DE LÓGICA DAS INTENÇÕES ---

/**
 * Handler para a intenção 'Welcome'. Verifica se o usuário já existe.
 */
async function handleWelcome(req, res, to) {
  const snapshot = await admin.database().ref(`/lista_contato/${to}`).once('value');
  if (snapshot.exists()) {
    const nome = snapshot.val().nome;
    const fulfillmentText = `*Bem-vindo(a) de volta, Sr(a). ${nome}!* \nSegue as opções disponíveis para atendimento.`;

    await enviarTemplateWhatsApp(to, 'menu_novo', 'https://amandasousaprev.adv.br/wp-content/uploads/2024/04/logo_quad_quad.png');

    res.send({
      fulfillmentMessages: [{ text: { text: [fulfillmentText] } }],
      outputContexts: [{
        name: `${req.body.session}/contexts/menu`,
        lifespanCount: 10,
        parameters: { person: nome },
      }],
    });
  } else {
    const fulfillmentText = 'Olá, tudo bem? Sou Ana, assistente virtual da Dra. Amanda Sousa. *(No momento eu ainda não consigo reconhecer mensagens de mídia (áudio, vídeo, foto, etc). Por favor, envie apenas mensagens de texto. 🚫🎵📸🚫)* Para sua segurança, informamos que o escritório *Dra. Amanda Sousa* utiliza dados pessoais em conformidade com a `Lei Geral de Proteção de Dados Pessoais (LGPD) Lei Nº 13.709/18`. Ao prosseguir com seu contato, você está de acordo com a troca de mensagens por este canal. Faço seu pré-atendimento, antes de começar qual é seu *NOME?*';
    res.send({ fulfillmentMessages: [{ text: { text: [fulfillmentText] } }] });
  }
}

/**
 * Handler para a intenção 'identificacao'. Salva o nome do novo usuário.
 */
async function handleIdentificacao(req, res, to) {
  const nome = req.body.queryResult.parameters?.person?.name;
  if (!nome) {
    logger.warn('Nome não encontrado nos parâmetros da intenção identificacao.');
    res.send({ fulfillmentMessages: [{ text: { text: ['Desculpe, não consegui identificar seu nome. Poderia repetir?'] } }] });
    return;
  }

  await admin.database().ref(`/lista_contato/${to}`).set({ nome, numero: to });
  logger.info(`Novo usuário salvo no banco de dados: ${nome} (${to})`);

  res.send({
    fulfillmentMessages: [{ text: { text: [`Perfeito, ${nome}. Posso confirmar o cadastro do seu nome?`] } }],
    outputContexts: [{
      name: `${req.body.session}/contexts/menu`,
      lifespanCount: 10,
      parameters: { person: nome },
    }],
  });
}

/**
 * Handler para a intenção 'exibirpayload'. Mostra o payload customizado.
 */
async function handleExibirPayload(req, res) {
  // --- AJUSTE AQUI ---
  // O payload enviado pela sua integração chega neste caminho:
  const payload = req.body.originalDetectIntentRequest?.payload;

  // Log para depuração no Firebase
  logger.info('Tentando acessar payload em originalDetectIntentRequest.payload:', { payload });

  // O resto do código continua igual, mas agora com a variável 'payload' correta.
  const fulfillmentText = (payload && Object.keys(payload).length > 0)
    ? `✅ SUCESSO! Payload recebido:\n\n${JSON.stringify(payload, null, 2)}`
    : '❌ Falha: Payload não encontrado em originalDetectIntentRequest.payload. Verifique se o Chatwoot está realmente enviando.';

  // Envia a resposta de volta para o usuário através do Dialogflow
  res.send({
    fulfillmentMessages: [{
      text: {
        text: [fulfillmentText],
      },
    }],
  });
}


// --- HANDLERS DAS INTENÇÕES (MAPEAMENTO) ---

const intentHandlers = {
  'BPC-LOAS': (req, res, to) => enviarTemplateWhatsApp(to, 'bpc_loas', 'https://amandasousaprev.adv.br/wp-content/uploads/2024/04/bpc-loas.jpg'),
  'confirmação.nome.menu': (req, res, to) => enviarTemplateWhatsApp(to, 'menu_novo', 'https://amandasousaprev.adv.br/wp-content/uploads/2024/04/logo_quad_quad.png'),
  'maternidade': (req, res, to) => enviarTemplateWhatsApp(to, 'maternidade_novo', 'https://amandasousaprev.adv.br/wp-content/uploads/2024/04/salario-maternidade.jpg'),
  'invalidez': (req, res, to) => enviarTemplateWhatsApp(to, 'invalidez', 'https://amandasousaprev.adv.br/wp-content/uploads/2024/04/2.jpg'),
  'auxilio': (req, res, to) => enviarTemplateWhatsApp(to, 'auxilio', 'https://amandasousaprev.adv.br/wp-content/uploads/2024/04/auxilio.jpg'),
  'consulta.juridica': (req, res, to) => enviarTemplateWhatsApp(to, 'consulta_juridica', 'https://amandasousaprev.adv.br/wp-content/uploads/2024/04/atendimento-wp.jpg'),
  'atendimentoexclusivo': (req, res, to) => enviarTemplateWhatsApp(to, 'falar_com_atendente', 'https://amandasousaprev.adv.br/wp-content/uploads/2024/04/logo_quad_quad.png'),
  
  'Welcome': handleWelcome,
  'identificacao': handleIdentificacao,
  'exibirpayload': handleExibirPayload,
};

// --- FUNÇÃO PRINCIPAL DO WEBHOOK ---

exports.dialogflowFirebaseFulfillment = onRequest(async (req, res) => {
  const intentName = req.body.queryResult?.intent?.displayName;
  const session = req.body.session || '';
  const userPhoneNumber = session.match(/\d+/g)?.[0] || '';

  logger.info(`Executando intenção: "${intentName}" para o usuário: ${userPhoneNumber}`, {
    fullRequest: req.body,
  });

  try {
    const handler = intentHandlers[intentName];
    if (handler) {
      await handler(req, res, userPhoneNumber);
      if (!res.headersSent) {
        res.send({});
      }
    } else {
      logger.warn(`Intenção desconhecida: "${intentName}"`);
      res.send({
        fulfillmentMessages: [{
          text: { text: ['Desculpe, não consegui entender sua solicitação. Poderia reformular?'] },
        }],
      });
    }
  } catch (error) {
    logger.error('Erro fatal no fulfillment da intenção:', { intent: intentName, error: error.message });
    if (!res.headersSent) {
      res.status(500).send({
        fulfillmentMessages: [{
          text: { text: ['Ocorreu um erro inesperado. Nossa equipe já foi notificada. Por favor, tente novamente mais tarde.'] },
        }],
      });
    }
  }
});