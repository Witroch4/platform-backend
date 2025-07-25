"use strict";
//gpt/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleInstagramWebhook = handleInstagramWebhook;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("../../../lib/prisma");
const instagram_auth_1 = require("../../../lib/instagram-auth");
const followUpQueue_1 = require("../../../worker/queues/followUpQueue");
// Base da Graph API do Instagram
const IG_GRAPH_API_BASE = process.env.IG_GRAPH_API_BASE || "https://graph.instagram.com/v21.0";
/**
 * Função principal que recebe o webhook e despacha para handleCommentChange() ou handleMessageEvent().
 */
async function handleInstagramWebhook(data) {
    const { object, entry } = data;
    if (object !== "instagram") {
        console.warn("[handleInstagramWebhook] Objeto não suportado:", object);
        return;
    }
    for (const event of entry) {
        const igUserId = event.id;
        // 1) Se for "changes" => comentários
        if (event.changes) {
            for (const change of event.changes) {
                if (change.field === "comments") {
                    await handleCommentChange(change.value, igUserId);
                }
            }
        }
        // 2) Se for "messaging" => DM/postback
        if (event.messaging) {
            for (const msgEvt of event.messaging) {
                await handleMessageEvent(msgEvt, igUserId);
            }
        }
    }
}
/**
 * 1) Trata Comentários:
 *    - Verifica se a automação aplica para o comentário (mídia selecionada e palavras-chave).
 *    - Se responderPublico, envia resposta pública e, se houver frase de boas-vindas,
 *      envia mensagem privada com botão.
 *    - Se contatoSemClique for true, agenda um job para follow-up em 1h.
 */
async function handleCommentChange(value, igUserId) {
    try {
        const { id: commentId, text: commentText = "", from, media } = value;
        const mediaId = media?.id;
        const originalMediaId = media?.original_media_id;
        const effectiveMediaId = originalMediaId || mediaId;
        console.log(`[handleCommentChange] Comentário: media=${mediaId}, text="${commentText}"`);
        // Ignora comentário do próprio usuário (dono da conta)
        if (from?.id === igUserId) {
            console.log("[handleCommentChange] Ignorando comentário do próprio igUserId.");
            return;
        }
        // Token para requisições na Graph API
        const accessToken = await (0, instagram_auth_1.getInstagramUserToken)(igUserId);
        if (!accessToken) {
            console.warn("[handleCommentChange] Sem token para igUserId=", igUserId);
            return;
        }
        // Busca automações ativas para esse usuário
        const automacoes = await prisma_1.prisma.automacao.findMany({
            where: {
                user: { accounts: { some: { provider: "instagram", igUserId } } },
                live: true,
            },
        });
        if (!automacoes.length) {
            console.log("[handleCommentChange] Nenhuma automação ativa para igUserId=", igUserId);
            return;
        }
        // Função de filtro para identificar se o comentário bate com a automação
        function matches(automacao) {
            if (!automacao.anyMediaSelected) {
                if (effectiveMediaId !== automacao.selectedMediaId)
                    return false;
            }
            if (!automacao.anyword) {
                const kw = automacao.palavrasChave?.toLowerCase() || "";
                if (!commentText.toLowerCase().includes(kw))
                    return false;
            }
            return true;
        }
        const matchList = automacoes.filter(matches);
        if (!matchList.length) {
            console.log("[handleCommentChange] Nenhuma automação correspondeu.");
            return;
        }
        // Seleciona a primeira automação que bateu
        const automacao = matchList[0];
        // Se responderPublico, envia resposta pública e/ou mensagem privada com botão de boas-vindas
        if (automacao.responderPublico) {
            const pubMsg = pickRandomPublicReply(automacao.publicReply);
            await replyPublicComment(commentId, accessToken, pubMsg);
        }
        if (automacao.fraseBoasVindas && automacao.quickReplyTexto) {
            await sendPrivateReplyWithButton({
                igUserId,
                accessToken,
                commentId,
                text: automacao.fraseBoasVindas,
                buttonTitle: automacao.quickReplyTexto,
                buttonPayload: automacao.buttonPayload,
            });
        }
        // Se contatoSemClique estiver ativo, agenda job para follow-up caso o usuário não clique
        if (automacao.contatoSemClique) {
            const senderId = from.id;
            let lead = await prisma_1.prisma.lead.findUnique({ where: { igSenderId: senderId } });
            if (!lead) {
                // Primeiro buscamos a conta pelo igUserId
                const account = await prisma_1.prisma.account.findFirst({
                    where: {
                        provider: "instagram",
                        igUserId: igUserId
                    }
                });
                if (!account) {
                    throw new Error(`Conta não encontrada para igUserId=${igUserId}`);
                }
                lead = await prisma_1.prisma.lead.create({
                    data: {
                        igSenderId: senderId,
                        accountId: account.id
                    }
                });
            }
            let la = await prisma_1.prisma.leadAutomacao.findUnique({
                where: {
                    leadIgSenderId_automacaoId: {
                        leadIgSenderId: lead.igSenderId,
                        automacaoId: automacao.id,
                    },
                },
            });
            if (!la) {
                la = await prisma_1.prisma.leadAutomacao.create({
                    data: {
                        leadIgSenderId: lead.igSenderId,
                        automacaoId: automacao.id,
                        linkSent: false,
                        waitingForEmail: false,
                    },
                });
            }
            await followUpQueue_1.followUpQueue.add("noClickFollowUp", {
                leadId: lead.igSenderId,
                automacaoId: automacao.id,
                quickReplyTexto: automacao.quickReplyTexto,
                followUpMsg: automacao.noClickPrompt ||
                    "🔥 Quer saber mais? Então não esquece de clicar no link aqui embaixo!",
            }, { delay: 3600000 } // 1 hora de delay
            );
            console.log("[handleCommentChange] Job agendado para contatoSemClique em 1h.");
        }
        console.log("[handleCommentChange] OK, automacaoId =", automacao.id);
    }
    catch (err) {
        console.error("[handleCommentChange] Erro:", err);
        throw err;
    }
}
/**
 * 2) Trata Mensagens (DM) e Postbacks.
 *    - Se for postback/quick_reply: identifica a automação via buttonPayload.
 *      * Se pedirParaSeguirPro estiver ativo, marca o lead como seguidor (validação automática).
 *      * Se pedirEmailPro estiver ativo, verifica se há e-mail. Se não houver, marca como waitingForEmail e solicita o e-mail.
 *      * Caso contrário, envia a mensagem com o link da etapa 3.
 *    - Se for mensagem de texto:
 *      * Se o texto for um e-mail válido, atualiza o lead e, para cada automação aguardando e-mail,
 *        se o lead não for seguidor (quando exigido), solicita follow; senão, envia o link.
 */
async function handleMessageEvent(msgEvt, igUserId) {
    try {
        if (msgEvt.message?.is_echo) {
            console.log("[handleMessageEvent] Ignorando echo");
            return;
        }
        const senderId = msgEvt.sender?.id;
        if (!senderId || senderId === igUserId)
            return;
        const accessToken = await (0, instagram_auth_1.getInstagramUserToken)(igUserId);
        if (!accessToken)
            return;
        const postbackPayload = msgEvt.postback?.payload || msgEvt.message?.quick_reply?.payload;
        if (postbackPayload) {
            console.log("[handleMessageEvent] Postback ou quick_reply detectado, payload =", postbackPayload);
            // Busca a automação que tenha o payload correspondente em buttonPayload ou followButtonPayload
            const automacao = await prisma_1.prisma.automacao.findFirst({
                where: {
                    user: { accounts: { some: { provider: "instagram", igUserId } } },
                    live: true,
                    OR: [
                        { buttonPayload: postbackPayload },
                        { followButtonPayload: postbackPayload }
                    ]
                },
            });
            if (!automacao) {
                console.log("[handleMessageEvent] Automação não encontrada para payload =", postbackPayload);
                return;
            }
            let lead = await prisma_1.prisma.lead.findUnique({ where: { igSenderId: senderId } });
            if (!lead) {
                // Primeiro buscamos a conta pelo igUserId
                const account = await prisma_1.prisma.account.findFirst({
                    where: {
                        provider: "instagram",
                        igUserId: igUserId
                    }
                });
                if (!account) {
                    throw new Error(`Conta não encontrada para igUserId=${igUserId}`);
                }
                lead = await prisma_1.prisma.lead.create({
                    data: {
                        igSenderId: senderId,
                        accountId: account.id
                    }
                });
            }
            let la = await prisma_1.prisma.leadAutomacao.findUnique({
                where: {
                    leadIgSenderId_automacaoId: {
                        leadIgSenderId: lead.igSenderId,
                        automacaoId: automacao.id,
                    },
                },
            });
            if (!la) {
                la = await prisma_1.prisma.leadAutomacao.create({
                    data: {
                        leadIgSenderId: lead.igSenderId,
                        automacaoId: automacao.id,
                        linkSent: false,
                        waitingForEmail: false,
                    },
                });
            }
            // Se a automação pede para seguir e o payload recebido for o followButtonPayload,
            // atualiza o lead para seguidor=true.
            if (automacao.pedirParaSeguirPro && postbackPayload === automacao.followButtonPayload) {
                if (!lead.seguidor) {
                    await prisma_1.prisma.lead.update({
                        where: { igSenderId: lead.igSenderId },
                        data: { seguidor: true },
                    });
                    console.log("[handleMessageEvent] Lead marcada como seguidor.");
                }
            }
            // Se a automação pede e-mail, verifica se o lead já possui um e-mail válido.
            if (automacao.pedirEmailPro) {
                if (!lead.email || lead.email.trim() === "") {
                    await prisma_1.prisma.leadAutomacao.update({
                        where: { id: la.id },
                        data: { waitingForEmail: true },
                    });
                    const prompt = automacao.emailPrompt || "Por favor, informe seu e-mail:";
                    await sendEmailRequestMessage({
                        igUserId,
                        accessToken,
                        recipientId: senderId,
                        emailPrompt: prompt,
                    });
                    return; // Interrompe o fluxo até que o e-mail seja recebido.
                }
            }
            // Se não for necessário e-mail ou já foi informado, envia o link da automação.
            await sendLinkForAutomacao(lead, automacao, accessToken, igUserId);
            return;
        }
        // Fluxo para mensagens de texto (sem postback/quick_reply):
        const text = msgEvt.message?.text || "";
        if (!text)
            return;
        const lead = await prisma_1.prisma.lead.findUnique({ where: { igSenderId: senderId } });
        if (!lead)
            return;
        const waitingList = await prisma_1.prisma.leadAutomacao.findMany({
            where: { leadIgSenderId: lead.igSenderId, waitingForEmail: true },
        });
        if (!waitingList.length) {
            console.log("[handleMessageEvent] Nenhuma automação aguardando e-mail para lead=", lead.igSenderId);
            return;
        }
        if (isValidEmail(text)) {
            // Atualiza o lead com o e-mail informado
            const updatedLead = await prisma_1.prisma.lead.update({
                where: { igSenderId: lead.igSenderId },
                data: { email: text },
            });
            // Para cada automação que aguardava e-mail:
            for (const la of waitingList) {
                await prisma_1.prisma.leadAutomacao.update({
                    where: { id: la.id },
                    data: { waitingForEmail: false },
                });
                const automacao = await prisma_1.prisma.automacao.findUnique({
                    where: { id: la.automacaoId },
                });
                if (!automacao)
                    continue;
                // Se a automação exige seguir e o lead ainda não for seguidor, solicita o follow.
                if (automacao.pedirParaSeguirPro && !updatedLead.seguidor) {
                    await sendFollowRequestMessage({
                        igUserId,
                        accessToken,
                        recipientId: lead.igSenderId,
                        followPrompt: automacao.followPrompt ||
                            "Você está quase lá! 🚀 Este link é exclusivo para meus seguidores. Me segue e clique em 'Estou seguindo'!",
                        buttonPayload: automacao.followButtonPayload || automacao.buttonPayload,
                    });
                    continue; // Aguarda que o usuário confirme o follow.
                }
                // Envia o link da automação
                await sendLinkForAutomacao(updatedLead, automacao, accessToken, igUserId);
            }
        }
        else {
            // Caso o e-mail não seja válido, solicita novamente um e-mail válido.
            await sendEmailRequestMessage({
                igUserId,
                accessToken,
                recipientId: senderId,
                emailPrompt: "Digite um email válido 🤗 , ex: joao@gmail.com, maria@outlook.com, etc",
            });
        }
    }
    catch (err) {
        console.error("[handleMessageEvent] erro:", err.message);
    }
}
/**
 * Envia mensagem pedindo para seguir com quick reply ("Estou seguindo").
 */
async function sendFollowRequestMessage({ igUserId, accessToken, recipientId, followPrompt, buttonPayload, }) {
    const url = `${IG_GRAPH_API_BASE}/${igUserId}/messages`;
    const body = {
        recipient: { id: recipientId },
        message: {
            text: followPrompt,
            quick_replies: [
                {
                    content_type: "text",
                    title: "Estou seguindo",
                    payload: buttonPayload,
                },
            ],
        },
    };
    await axios_1.default.post(url, body, { params: { access_token: accessToken } });
    console.log("[sendFollowRequestMessage] Mensagem pedindo follow enviada para", recipientId);
}
/**
 * Envia resposta pública a um comentário.
 */
async function replyPublicComment(commentId, accessToken, msg) {
    await axios_1.default.post(`${IG_GRAPH_API_BASE}/${commentId}/replies`, new URLSearchParams({
        message: msg,
        access_token: accessToken,
    }));
    console.log("[replyPublicComment] Resposta pública enviada para commentId=", commentId);
}
/**
 * Retorna uma frase aleatória a partir de publicReply (ou fallback).
 */
function pickRandomPublicReply(publicReply) {
    let frases = [];
    if (publicReply) {
        try {
            const arr = JSON.parse(publicReply);
            if (Array.isArray(arr) && arr.length > 0) {
                frases = arr;
            }
        }
        catch (err) {
            console.warn("[pickRandomPublicReply] erro ao parsear publicReply JSON");
        }
    }
    if (frases.length === 0) {
        return "Olá! Eu te mandei uma mensagem privada, dá uma olhada! ✅";
    }
    return frases[Math.floor(Math.random() * frases.length)];
}
/**
 * Envia mensagem privada com botão (template do tipo button) para o comentário.
 */
async function sendPrivateReplyWithButton({ igUserId, accessToken, commentId, text, buttonTitle, buttonPayload, }) {
    const url = `${IG_GRAPH_API_BASE}/${igUserId}/messages`;
    const body = {
        recipient: { comment_id: commentId },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text,
                    buttons: [
                        {
                            type: "postback",
                            title: buttonTitle,
                            payload: buttonPayload,
                        },
                    ],
                },
            },
        },
    };
    await axios_1.default.post(url, body, { params: { access_token: accessToken } });
    console.log("[sendPrivateReplyWithButton] Mensagem privada com botão enviada para commentId=", commentId);
}
/**
 * Envia mensagem com template (generic) contendo link (etapa 3).
 */
async function sendTemplateLink({ igUserId, accessToken, recipientId, title, url, urlButtonTitle, }) {
    const endpoint = `${IG_GRAPH_API_BASE}/${igUserId}/messages`;
    const body = {
        recipient: { id: recipientId },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [
                        {
                            title,
                            buttons: [
                                {
                                    type: "web_url",
                                    url,
                                    title: urlButtonTitle,
                                },
                            ],
                        },
                    ],
                },
            },
        },
    };
    await axios_1.default.post(endpoint, body, { params: { access_token: accessToken } });
    console.log("[sendTemplateLink] Link enviado por DM para userId=", recipientId);
}
/**
 * Solicita o e-mail do usuário.
 */
async function sendEmailRequestMessage({ igUserId, accessToken, recipientId, emailPrompt, }) {
    const url = `${IG_GRAPH_API_BASE}/${igUserId}/messages`;
    const body = {
        recipient: { id: recipientId },
        message: { text: emailPrompt },
    };
    await axios_1.default.post(url, body, { params: { access_token: accessToken } });
    console.log("[sendEmailRequestMessage] Solicitando email de", recipientId);
}
/**
 * Envia a etapa 3 (link) da automação e marca que o link já foi enviado.
 */
async function sendLinkForAutomacao(lead, automacao, accessToken, igUserId) {
    let la = await prisma_1.prisma.leadAutomacao.findUnique({
        where: {
            leadIgSenderId_automacaoId: {
                leadIgSenderId: lead.igSenderId,
                automacaoId: automacao.id,
            },
        },
    });
    if (!la) {
        la = await prisma_1.prisma.leadAutomacao.create({
            data: {
                leadIgSenderId: lead.igSenderId,
                automacaoId: automacao.id,
                linkSent: false,
                waitingForEmail: false,
            },
        });
    }
    if (la.linkSent) {
        console.log("[sendLinkForAutomacao] Link já enviado para automacaoId=", automacao.id);
        return;
    }
    const textEtapa3 = automacao.mensagemEtapa3 || "Obrigado! Segue nosso link.";
    const link = automacao.linkEtapa3 || "https://exemplo.com";
    const linkTitle = automacao.legendaBotaoEtapa3 || "Acessar Link";
    await sendTemplateLink({
        igUserId,
        accessToken,
        recipientId: lead.igSenderId,
        title: textEtapa3,
        url: link,
        urlButtonTitle: linkTitle,
    });
    await prisma_1.prisma.leadAutomacao.update({
        where: { id: la.id },
        data: { linkSent: true },
    });
    console.log("[sendLinkForAutomacao] Link enviado para automacao =", automacao.id);
}
/**
 * Validação simples de e-mail.
 */
function isValidEmail(email) {
    const regex = /^[A-Za-z0-9._%+-]+@(gmail|outlook|icloud|aol|zoho|yahoo|gmx|protonmail|hotmail)\.com(\.br)?$/i;
    return regex.test(email);
}
// Nota: Removemos a função de checagem de seguidor (checkIfUserFollows)
// pois a validação automática ocorre ao receber o clique no botão.
