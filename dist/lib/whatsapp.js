"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWhatsAppApiUrl = exports.getWhatsAppConfig = void 0;
exports.formatE164 = formatE164;
exports.sanitizeCoupon = sanitizeCoupon;
exports.sendTemplateMessage = sendTemplateMessage;
exports.testWhatsAppApiConnection = testWhatsAppApiConnection;
exports.processCSV = processCSV;
// lib/whatsapp.ts
const axios_1 = __importDefault(require("axios"));
const auth_1 = require("../auth");
const lib_1 = require("../app/lib");
const db_1 = require("../lib/db");
function formatE164(num) {
    const d = num.replace(/\D/g, '');
    if (!d)
        return null;
    return d.startsWith('55') ? d : `55${d}`;
}
function sanitizeCoupon(raw) {
    const ok = (raw || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
    if (!ok)
        throw new Error('coupon_code inválido ‑ use 1‑32 letras/números sem espaço');
    return ok;
}
async function sendTemplateMessage(toRaw, templateName, opts = {}) {
    try {
        const session = await (0, auth_1.auth)();
        if (!session?.user?.id)
            throw new Error('401');
        const usuarioChatwit = await db_1.db.usuarioChatwit.findUnique({
            where: { appUserId: session.user.id },
            select: { id: true }
        });
        if (!usuarioChatwit)
            throw new Error('Usuário Chatwit não encontrado');
        const cfg = await (0, lib_1.getWhatsAppConfig)(session.user.id);
        const api = (0, lib_1.getWhatsAppApiUrl)(cfg);
        const tpl = await db_1.db.whatsAppTemplate.findFirst({
            where: {
                name: templateName,
                usuarioChatwitId: usuarioChatwit.id
            }
        });
        if (!tpl)
            throw new Error(`Template '${templateName}' não encontrado`);
        if (tpl.status !== 'APPROVED')
            throw new Error(`Template '${templateName}' ≠ APPROVED`);
        const to = formatE164(toRaw);
        if (!to)
            throw new Error('Número inválido');
        const comps = [];
        const components = tpl.components;
        for (const c of components) {
            switch (c.type) {
                case 'HEADER': {
                    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format)) {
                        const mediaUrl = tpl.publicMediaUrl;
                        if (!mediaUrl) {
                            console.warn(`[sendTemplateMessage] Tentando enviar template '${templateName}' com mídia, mas publicMediaUrl está vazia.`);
                            continue;
                        }
                        const key = c.format.toLowerCase();
                        comps.push({
                            type: 'header',
                            parameters: [{ type: key, [key]: { link: mediaUrl } }],
                        });
                    }
                    else if (c.format === 'TEXT') {
                        const txt = opts.headerVar || c.text?.replace(/\{\{1\}\}/, opts.headerVar || '');
                        if (!txt)
                            throw new Error('HEADER TEXT requer headerVar');
                        comps.push({ type: 'header', parameters: [{ type: 'text', text: txt }] });
                    }
                    else if (c.format === 'LOCATION') {
                        comps.push({ type: 'header', parameters: [{ type: 'location', location: JSON.parse(opts.headerMedia || '{}') }] });
                    }
                    break;
                }
                case 'BODY': {
                    const placeholders = (c.text.match(/\{\{(\d+)\}\}/g) || []).length;
                    if (placeholders) {
                        if (!(opts.bodyVars && opts.bodyVars.length >= placeholders)) {
                            throw new Error(`BODY requer ${placeholders} variáveis (foram passadas ${opts.bodyVars?.length || 0})`);
                        }
                        const params = opts.bodyVars.slice(0, placeholders).map((v) => ({ type: 'text', text: String(v) }));
                        comps.push({ type: 'body', parameters: params });
                    }
                    else {
                        comps.push({ type: 'body' });
                    }
                    break;
                }
                case 'FOOTER':
                    comps.push({ type: 'footer' });
                    break;
                case 'BUTTONS':
                    c.buttons.forEach((btn, idx) => {
                        let item;
                        switch (btn.type) {
                            case 'COPY_CODE':
                                item = {
                                    type: 'button',
                                    sub_type: 'copy_code',
                                    index: String(idx),
                                    parameters: [{ type: 'coupon_code', coupon_code: sanitizeCoupon(opts.couponCode || btn.example?.[0] || 'CODE123') }],
                                };
                                break;
                            case 'PHONE_NUMBER':
                                item = {
                                    type: 'button',
                                    sub_type: 'voice_call',
                                    index: String(idx),
                                    parameters: [{ type: 'payload', payload: btn.phone_number }],
                                };
                                break;
                            case 'URL':
                                item = {
                                    type: 'button',
                                    sub_type: 'url',
                                    index: String(idx),
                                    parameters: [{ type: 'text', text: opts.buttonOverrides?.[idx] || btn.example || '' }],
                                };
                                break;
                            case 'QUICK_REPLY':
                                item = {
                                    type: 'button',
                                    sub_type: 'quick_reply',
                                    index: String(idx),
                                    parameters: [{ type: 'payload', payload: opts.buttonOverrides?.[idx] || 'OK' }],
                                };
                                break;
                            case 'FLOW':
                                item = {
                                    type: 'button',
                                    sub_type: 'flow',
                                    index: String(idx),
                                    parameters: [{ type: 'flow', flow: { flow_id: btn.flow_id, flow_action: btn.flow_action, navigate_screen: btn.navigate_screen } }],
                                };
                                break;
                            default:
                                throw new Error(`Botão não suportado: ${btn.type}`);
                        }
                        comps.push(item);
                    });
                    break;
            }
        }
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'template',
            template: {
                name: templateName,
                language: { code: tpl.language || 'pt_BR' },
                components: comps,
            },
        };
        console.log('[sendTemplateMessage] Payload final enviado:', JSON.stringify(payload, null, 2));
        await axios_1.default.post(api, payload, { headers: { Authorization: `Bearer ${cfg.whatsappToken}` } });
        return true;
    }
    catch (e) {
        console.error('[sendTemplateMessage]', e.response?.data || e.message);
        return false;
    }
}
async function testWhatsAppApiConnection(cfg) {
    try {
        const id = cfg.phoneNumberId || cfg.whatsappBusinessAccountId;
        await axios_1.default.get(`${cfg.fbGraphApiBase}/${id}/whatsapp_business_profile`, {
            headers: {
                Authorization: `Bearer ${cfg.whatsappToken}`,
            },
        });
        return { success: true };
    }
    catch (e) {
        return {
            success: false,
            details: e.response?.data?.error?.message || e.message,
        };
    }
}
function processCSV(csv) {
    // se precisar processar CSV
    return [];
}
exports.getWhatsAppConfig = lib_1.getWhatsAppConfig;
exports.getWhatsAppApiUrl = lib_1.getWhatsAppApiUrl;
