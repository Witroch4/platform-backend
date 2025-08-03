"use strict";
//gpt/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleInstagramWebhook = handleInstagramWebhook;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("@/lib/prisma");
const instagram_auth_1 = require("@/lib/instagram-auth");
const followUpQueue_1 = require("@/worker/queues/followUpQueue");
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
        if (automacao.publicReply) {
            const pubMsg = pickRandomPublicReply(automacao.publicReply);
            await replyPublicComment(commentId, accessToken, pubMsg);
        }
        if (automacao.fraseBoasVindas && automacao.buttonPayload) {
            await sendPrivateReplyWithButton({
                igUserId,
                accessToken,
                commentId,
                text: automacao.fraseBoasVindas,
                buttonTitle: automacao.buttonPayload,
                buttonPayload: automacao.buttonPayload,
            });
        }
        // Se contatoSemClique estiver ativo, agenda job para follow-up caso o usuário não clique
        if (automacao.anyword) {
            const senderId = from.id;
            let lead = await prisma_1.prisma.lead.findUnique({ where: { id: senderId } });
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
                        sourceIdentifier: senderId,
                        source: "INSTAGRAM",
                        accountId: account.id
                    }
                });
            }
            let la = await prisma_1.prisma.leadAutomacao.findUnique({
                where: {
                    leadId_automacaoId: {
                        leadId: lead.id,
                        automacaoId: automacao.id,
                    },
                },
            });
            if (!la) {
                la = await prisma_1.prisma.leadAutomacao.create({
                    data: {
                        leadId: lead.id,
                        automacaoId: automacao.id,
                        linkSent: false,
                        waitingForEmail: false,
                    },
                });
            }
            await followUpQueue_1.followUpQueue.add("noClickFollowUp", {
                leadId: lead.id,
                automacaoId: automacao.id,
                buttonPayload: automacao.buttonPayload,
                followUpMsg: "🔥 Quer saber mais? Então não esquece de clicar no link aqui embaixo!",
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
        // Se for postback/quick_reply: identifica a automação via buttonPayload.
        if (msgEvt.postback?.payload) {
            const postbackPayload = msgEvt.postback.payload;
            const automacao = await prisma_1.prisma.automacao.findFirst({
                where: {
                    buttonPayload: postbackPayload
                }
            });
            if (!automacao) {
                console.log("[handleMessageEvent] Automação não encontrada para payload:", postbackPayload);
                return;
            }
            const senderId = msgEvt.sender?.id;
            let lead = await prisma_1.prisma.lead.findUnique({ where: { id: senderId } });
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
                        sourceIdentifier: senderId,
                        source: "INSTAGRAM",
                        accountId: account.id
                    }
                });
            }
            let la = await prisma_1.prisma.leadAutomacao.findUnique({
                where: {
                    leadId_automacaoId: {
                        leadId: lead.id,
                        automacaoId: automacao.id,
                    },
                },
            });
            if (!la) {
                la = await prisma_1.prisma.leadAutomacao.create({
                    data: {
                        leadId: lead.id,
                        automacaoId: automacao.id,
                        linkSent: false,
                        waitingForEmail: false,
                    },
                });
            }
            // Se pedirParaSeguirPro estiver ativo, marca o lead como seguidor (validação automática).
            if (automacao.anyword && postbackPayload === automacao.buttonPayload) {
                // Verificar se o lead é seguidor através do perfil do Instagram
                const instagramProfile = await prisma_1.prisma.leadInstagramProfile.findUnique({
                    where: { leadId: lead.id }
                });
                if (!instagramProfile?.isFollower) {
                    await prisma_1.prisma.leadInstagramProfile.upsert({
                        where: { leadId: lead.id },
                        update: { isFollower: true },
                        create: {
                            leadId: lead.id,
                            isFollower: true
                        }
                    });
                }
            }
            // Se pedirEmailPro estiver ativo, verifica se há e-mail. Se não houver, marca como waitingForEmail e solicita o e-mail.
            if (automacao.anyword) {
                if (!lead.email) {
                    await prisma_1.prisma.leadAutomacao.update({
                        where: {
                            leadId_automacaoId: {
                                leadId: lead.id,
                                automacaoId: automacao.id,
                            },
                        },
                        data: { waitingForEmail: true },
                    });
                    const prompt = "Por favor, informe seu e-mail:";
                    await sendEmailRequestMessage({
                        igUserId,
                        accessToken,
                        recipientId: senderId,
                        emailPrompt: prompt,
                    });
                    console.log("[handleMessageEvent] Solicitando e-mail para lead=", lead.id);
                    return;
                }
            }
            // Caso contrário, envia a mensagem com o link da etapa 3.
            await sendLinkForAutomacao(lead, automacao, accessToken, igUserId);
        }
        // Se for mensagem de texto:
        if (msgEvt.message?.text) {
            const text = msgEvt.message.text;
            const senderId = msgEvt.sender?.id;
            // Verifica se o texto é um e-mail válido
            if (isValidEmail(text)) {
                const lead = await prisma_1.prisma.lead.findUnique({ where: { id: senderId } });
                if (!lead) {
                    console.log("[handleMessageEvent] Lead não encontrado para senderId=", senderId);
                    return;
                }
                // Atualiza o lead com o e-mail
                await prisma_1.prisma.lead.update({
                    where: { id: lead.id },
                    data: { email: text },
                });
                // Busca automações aguardando e-mail para este lead
                const automacoesAguardando = await prisma_1.prisma.leadAutomacao.findMany({
                    where: { leadId: lead.id, waitingForEmail: true },
                    include: { automacao: true },
                });
                if (automacoesAguardando.length === 0) {
                    console.log("[handleMessageEvent] Nenhuma automação aguardando e-mail para lead=", lead.id);
                    return;
                }
                // Para cada automação aguardando e-mail
                for (const la of automacoesAguardando) {
                    // Marca como não aguardando mais e-mail
                    await prisma_1.prisma.leadAutomacao.update({
                        where: { id: la.id },
                        data: { waitingForEmail: false },
                    });
                    // Verifica se o lead é seguidor (quando exigido)
                    const instagramProfile = await prisma_1.prisma.leadInstagramProfile.findUnique({
                        where: { leadId: lead.id }
                    });
                    if (la.automacao.anyword && !instagramProfile?.isFollower) {
                        // Solicita follow
                        await sendFollowRequestMessage({
                            igUserId,
                            accessToken,
                            recipientId: lead.id,
                            followPrompt: "Para continuar, siga nosso perfil:",
                            buttonPayload: la.automacao.buttonPayload,
                        });
                    }
                    else {
                        // Envia o link da automação
                        await sendLinkForAutomacao(lead, la.automacao, accessToken, igUserId);
                    }
                }
            }
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
    try {
        // Busca a LeadAutomacao para verificar se já foi enviado o link
        const la = await prisma_1.prisma.leadAutomacao.findUnique({
            where: {
                leadId_automacaoId: {
                    leadId: lead.id,
                    automacaoId: automacao.id,
                },
            },
        });
        if (!la) {
            console.log("[sendLinkForAutomacao] LeadAutomacao não encontrada");
            return;
        }
        if (la.linkSent) {
            console.log("[sendLinkForAutomacao] Link já foi enviado para este lead/automação");
            return;
        }
        // Marca como link enviado
        await prisma_1.prisma.leadAutomacao.update({
            where: {
                leadId_automacaoId: {
                    leadId: lead.id,
                    automacaoId: automacao.id,
                },
            },
            data: { linkSent: true },
        });
        // Envia o template com o link
        await sendTemplateLink({
            igUserId,
            accessToken,
            recipientId: lead.id,
            title: "Aqui está o que você pediu! 🎉",
            url: `https://chatwit.com.br/automacao/${automacao.id}?lead=${lead.id}`,
            urlButtonTitle: "Acessar Agora",
        });
        console.log("[sendLinkForAutomacao] Link enviado com sucesso para lead=", lead.id);
    }
    catch (error) {
        console.error("[sendLinkForAutomacao] Erro:", error);
        throw error;
    }
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
