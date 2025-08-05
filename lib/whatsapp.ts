// lib/whatsapp.ts
import axios from 'axios';
import { auth } from '@/auth';
import { getWhatsAppConfig as _getWhatsAppConfig, getWhatsAppApiUrl as _getWhatsAppApiUrl } from '@/app/lib';
import { getPrismaInstance } from '@/lib/connections';

export interface SendOpts {
  bodyVars?: (string | number)[];
  headerVar?: string;
  headerMedia?: string;
  buttonOverrides?: Record<number, any>;
  couponCode?: string;
}

export interface EnvioResult {
  nome: string;
  numero: string;
  status: 'enviado' | 'falha';
  erro?: string;
}

export function formatE164(num: string): string | null {
  const d = num.replace(/\D/g, '');
  if (!d) return null;
  return d.startsWith('55') ? d : `55${d}`;
}

export function sanitizeCoupon(raw?: string): string {
  const ok = (raw || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
  if (!ok) throw new Error('coupon_code inválido ‑ use 1‑32 letras/números sem espaço');
  return ok;
}

export async function sendTemplateMessage(
  toRaw: string,
  templateName: string,
  opts: SendOpts = {}
): Promise<boolean> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error('401');
    const usuarioChatwit = await getPrismaInstance().usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      select: { id: true }
    });
    if (!usuarioChatwit) throw new Error('Usuário Chatwit não encontrado');
    const cfg = await _getWhatsAppConfig(session.user.id);
    const api = _getWhatsAppApiUrl(cfg);
    const tpl = await getPrismaInstance().template.findFirst({
      where: {
        name: templateName,
        // Removendo campo que não existe no schema
        // usuarioChatwitId: usuarioChatwit.id
      }
    });
    if (!tpl) throw new Error(`Template '${templateName}' não encontrado`);
    if (tpl.status !== 'APPROVED') throw new Error(`Template '${templateName}' ≠ APPROVED`);
    const to = formatE164(toRaw);
    if (!to) throw new Error('Número inválido');
    const comps: any[] = [];
    // Removendo acesso a campo que não existe
    // const components = tpl.components as any[];
    const components: any[] = []; // Placeholder - ajustar conforme schema real
    
    for (const c of components) {
      switch (c.type) {
        case 'HEADER': {
          if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format)) {
            // Removendo acesso a campo que não existe
            // const mediaUrl = tpl.publicMediaUrl;
            const mediaUrl = null; // Placeholder - ajustar conforme schema real
            if (!mediaUrl) {
              console.warn(`[sendTemplateMessage] Tentando enviar template '${templateName}' com mídia, mas publicMediaUrl está vazia.`);
              continue;
            }
            const key = c.format.toLowerCase();
            comps.push({
              type: 'header',
              parameters: [{ type: key, [key]: { link: mediaUrl } }],
            });
          } else if (c.format === 'TEXT') {
            const txt = opts.headerVar || c.text?.replace(/\{\{1\}\}/, opts.headerVar || '');
            if (!txt) throw new Error('HEADER TEXT requer headerVar');
            comps.push({ type: 'header', parameters: [{ type: 'text', text: txt }] });
          } else if (c.format === 'LOCATION') {
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
            const params = opts.bodyVars!.slice(0, placeholders).map((v) => ({ type: 'text', text: String(v) }));
            comps.push({ type: 'body', parameters: params });
          } else {
            comps.push({ type: 'body' });
          }
          break;
        }
        case 'FOOTER':
          comps.push({ type: 'footer' });
          break;
        case 'BUTTONS':
          c.buttons.forEach((btn: any, idx: number) => {
            let item: any;
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
    await axios.post(api, payload, { headers: { Authorization: `Bearer ${cfg.whatsappToken}` } });
    return true;
  } catch (e: any) {
    console.error('[sendTemplateMessage]', e.response?.data || e.message);
    return false;
  }
}

export async function testWhatsAppApiConnection(cfg: any) {
  try {
    const id = cfg.phoneNumberId || cfg.whatsappBusinessAccountId;
    await axios.get(
      `${cfg.fbGraphApiBase}/${id}/whatsapp_business_profile`,
      {
        headers: {
          Authorization: `Bearer ${cfg.whatsappToken}`,
        },
      }
    );
    return { success: true };
  } catch (e: any) {
    return {
      success: false,
      details: e.response?.data?.error?.message || e.message,
    };
  }
}

export function processCSV(csv: string) {
  // se precisar processar CSV
  return [];
}

export async function getWhatsAppTemplate(templateId: string, userId: string) {
  try {
    // Buscar template no banco de dados
    const tpl = await getPrismaInstance().template.findFirst({
      where: {
        whatsappOfficialInfo: {
          metaTemplateId: templateId
        },
        createdById: userId
      },
      include: {
        whatsappOfficialInfo: true
      }
    });

    if (!tpl) {
      throw new Error('Template não encontrado');
    }

    return tpl;
  } catch (error) {
    console.error('Erro ao buscar template:', error);
    throw error;
  }
}

export const getWhatsAppConfig = _getWhatsAppConfig;
export const getWhatsAppApiUrl = _getWhatsAppApiUrl;
