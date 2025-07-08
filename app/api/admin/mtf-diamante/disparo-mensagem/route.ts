// app/api/admin/mtf-diamante/disparo/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';
import { parse } from 'papaparse';
import { auth } from '@/auth';
import { getWhatsAppConfig, getWhatsAppApiUrl } from '@/app/lib';
import { db } from '@/lib/db';
import { z } from 'zod';

//
// ——— 1. Tipos e schemas —————————————————————————————————————————————————————————————————————————————————
//
interface SendOpts {
  bodyVars?: (string | number)[];
  headerVar?: string;
  headerMedia?: string;
  couponCode?: string;
  buttonOverrides?: Record<number, any>;
}

interface EnvioResult {
  nome: string;
  numero: string;
  status: 'enviado' | 'falha';
  erro?: string;
}

const disparoSchema = z.object({
  contatos: z.array(z.object({
    nome: z.string(),
    numero: z.string(),
  })),
  templateName: z.string(),
  configuracoes: z.object({
    variaveis: z.array(z.string()).optional(),
  }),
  couponCode: z.string().optional(),
});

//
// ——— 2. Helpers genéricos de template —————————————————————————————————————————————————————————————————————————————————
//
// formata para E.164 +55...
function formatE164(num: string): string | null {
  const d = num.replace(/\D/g, '');
  if (!d) return null;
  return d.startsWith('55') ? d : `55${d}`;
}

// Constrói dinamicamente os componentes do template
async function sendTemplateMessage(
  toRaw: string,
  templateName: string,
  opts: SendOpts = {}
): Promise<boolean> {
  try {
    const session = await auth();
    if (!session?.user) throw new Error('Usuário não autenticado');

    const cfg = await getWhatsAppConfig(session.user.id);
    const apiUrl = getWhatsAppApiUrl(cfg);

    const tpl = await db.whatsAppTemplate.findFirst({ where: { name: templateName } });
    if (!tpl) throw new Error(`Template '${templateName}' não encontrado`);
    if (tpl.status !== 'APPROVED') throw new Error(`Template '${templateName}' com status '${tpl.status}'`);

    const to = formatE164(toRaw);
    if (!to) throw new Error('Número inválido');

    const comps: any[] = [];
    const components = tpl.components as any[];

    for (const c of components) {
      switch (c.type) {
        case 'HEADER': {
          if (c.format === 'TEXT') {
            const txt = opts.headerVar || c.text?.replace(/\{\{1\}\}/, opts.headerVar || '');
            if (!txt) throw new Error('HEADER TEXT requer headerVar');
            comps.push({ type: 'header', parameters: [{ type: 'text', text: txt }] });
          } else if (['IMAGE','VIDEO','DOCUMENT'].includes(c.format)) {
            const media = opts.headerMedia
              || c.example?.header_handle?.[0]
              || c.example?.header_url;
            if (!media) throw new Error(`HEADER ${c.format} requer headerMedia ou example`);
            const key = c.format.toLowerCase();
            comps.push({
              type: 'header',
              parameters: [{ type: key, [key]: media.startsWith('http') ? { link: media } : { id: media } }],
            });
          } else if (c.format === 'LOCATION') {
            if (!opts.headerMedia) throw new Error('HEADER LOCATION requer headerMedia JSON');
            comps.push({
              type: 'header',
              parameters: [{ type: 'location', location: JSON.parse(opts.headerMedia) }],
            });
          }
          break;
        }
        case 'BODY': {
          const placeholders = (c.text.match(/\{\{(\d+)\}\}/g) || []).length;
          if (placeholders) {
            if (!(opts.bodyVars && opts.bodyVars.length >= placeholders)) {
              throw new Error(`BODY requer ${placeholders} bodyVars, só ${opts.bodyVars?.length || 0} fornecidos`);
            }
            const params = opts.bodyVars.slice(0, placeholders).map(v => ({ type: 'text', text: String(v) }));
            comps.push({ type: 'body', parameters: params });
          } else {
            comps.push({ type: 'body' });
          }
          break;
        }
        case 'FOOTER':
          comps.push({ type: 'footer' });
          break;
        case 'BUTTONS': {
          c.buttons.forEach((btn: any, idx: number) => {
            let btnObj: any;
            switch (btn.type) {
              case 'COPY_CODE':
                btnObj = {
                  type: 'button', sub_type: 'copy_code', index: String(idx),
                  parameters: [{ type: 'coupon_code', coupon_code: opts.couponCode || btn.example?.[0] || 'CODE123' }]
                };
                break;
              case 'PHONE_NUMBER':
                btnObj = {
                  type: 'button', sub_type: 'phone_number', index: String(idx),
                  parameters: [{ type: 'payload', payload: btn.phone_number }]
                };
                break;
              case 'URL':
                btnObj = {
                  type: 'button', sub_type: 'url', index: String(idx),
                  parameters: [{ type: 'text', text: opts.buttonOverrides?.[idx] || btn.example || '' }]
                };
                break;
              case 'QUICK_REPLY':
                btnObj = {
                  type: 'button', sub_type: 'quick_reply', index: String(idx),
                  parameters: [{ type: 'payload', payload: opts.buttonOverrides?.[idx] || 'OK' }]
                };
                break;
              case 'FLOW':
                btnObj = {
                  type: 'button', sub_type: 'flow', index: String(idx),
                  parameters: [{ type: 'flow', flow: {
                    flow_id: btn.flow_id,
                    flow_action: btn.flow_action,
                    navigate_screen: btn.navigate_screen
                  }}]
                };
                break;
              default:
                throw new Error(`Botão não suportado: ${btn.type}`);
            }
            comps.push(btnObj);
          });
          break;
        }
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
        components: comps.length ? comps : undefined,
      },
    };

    await axios.post(apiUrl, payload, {
      headers: { Authorization: `Bearer ${cfg.whatsappToken}`, 'Content-Type': 'application/json' }
    });
    return true;
  } catch (e: any) {
    console.error('[sendTemplateMessage]', e.response?.data || e.message);
    return false;
  }
}

async function testWhatsAppApiConnection(config: any): Promise<{ success: boolean; message: string }> {
  try {
    const phoneId = config.phoneNumberId || config.whatsappBusinessAccountId;
    const url = `${config.fbGraphApiBase}/${phoneId}/whatsapp_business_profile`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${config.whatsappToken}`, 'Content-Type': 'application/json' }
    });
    if (res.status === 200) return { success: true, message: `Conectado OK com ID ${phoneId}` };
    return { success: false, message: `Status inesperado: ${res.status}` };
  } catch (err: any) {
    return { success: false, message: err.response?.data?.error?.message || err.message };
  }
}

function processCSV(csv: string) {
  const { data } = parse(csv, { header: true, skipEmptyLines: true });
  return data.map((r: any) => ({
    nome: r.Nome || '',
    numero: r.Numero?.replace(/\D/g, '') || ''
  })).filter((c: any) => c.numero);
}

//
// ——— 3. Handler POST —————————————————————————————————————————————————————————————————————————————————
//
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const user = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    if (user?.role !== 'ADMIN') return NextResponse.json({ error: 'Permissão negada' }, { status: 403 });

    const body = await req.json();
    const parsed = disparoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error }, { status: 400 });
    }
    const { contatos, templateName, configuracoes, couponCode } = parsed.data;

    const tpl = await db.whatsAppTemplate.findFirst({ where: { name: templateName } });
    if (!tpl) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
    if (tpl.status !== 'APPROVED') {
      return NextResponse.json({ error: `Template não aprovado (${tpl.status})` }, { status: 400 });
    }

    const cfg = await getWhatsAppConfig(session.user.id);
    const conn = await testWhatsAppApiConnection(cfg);
    if (!conn.success) {
      return NextResponse.json({ error: 'Falha conexão WhatsApp', details: conn.message }, { status: 400 });
    }

    const results: EnvioResult[] = [];
    let enviados = 0, falhas = 0;

    for (const c of contatos) {
      try {
        const to = c.numero;
        const ok = await sendTemplateMessage(to, templateName, {
          bodyVars: configuracoes.variaveis,
          couponCode,
        });
        if (ok) { enviados++; results.push({ nome: c.nome, numero: to, status: 'enviado' }); }
        else   { falhas++;  results.push({ nome: c.nome, numero: to, status: 'falha', erro: 'Envio falhou' }); }
      } catch (e: any) {
        falhas++;
        results.push({ nome: c.nome, numero: c.numero, status: 'falha', erro: e.message });
      }
    }

    return NextResponse.json({
      success: true,
      results: { total: contatos.length, enviados, falhas, detalhes: results }
    });
  } catch (e) {
    console.error('[disparo POST]', e);
    return NextResponse.json({ error: 'Erro interno no disparo' }, { status: 500 });
  }
}
