// app/api/admin/leads-chatwit/enviar-pdf-recurso-lead/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import FormData from 'form-data';
import axios from 'axios';

const CHATWOOT_ACCESS_TOKEN = process.env.CHATWITACESSTOKEN; // => UXDyxpWNGhTJCGXydACZPaCZ
const CHATWOOT_BASE_URL = process.env.CHATWIT_BASE_URL ?? 'https://chatwit.witdev.com.br';
console.log('CHATWOOT_ACCESS_TOKEN', CHATWOOT_ACCESS_TOKEN);

// ---- Utilidades -------------------------------------------------------------

/**
 * Extrai accountId e conversationId de uma URL do tipo
 * https://.../accounts/3/conversations/1199
 */
function extractIds(leadUrl: string) {
  const url = new URL(leadUrl);
  const [, , account, accountId, , conversationId] = url.pathname.split('/');
  if (account !== 'accounts' || !accountId || !conversationId) {
    throw new Error(`leadUrl fora do formato esperado: ${leadUrl}`);
  }
  return { accountId, conversationId };
}

/**
 * Faz download do arquivo remoto e devolve {buffer, mime, filename}
 */
async function downloadFile(fileUrl: string) {
  const res = await axios.get<ArrayBuffer>(fileUrl, { responseType: 'arraybuffer' });
  const contentType = res.headers['content-type'] ?? 'application/octet-stream';
  const filename = decodeURIComponent(new URL(fileUrl).pathname.split('/').pop()!);
  return { buffer: Buffer.from(res.data), mime: contentType, filename };
}

// ---- Handler ----------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  try {
    // Extrair os parâmetros da URL
    const url = new URL(request.url);
    const sourceId = url.searchParams.get('sourceId');
    const message =
      url.searchParams.get('message') ||
      'Segue o nosso Recurso, qualquer dúvida estamos à disposição.';
    // Extrair accessToken personalizado se fornecido via URL
    let accessToken = url.searchParams.get('accessToken') || null;

    if (!sourceId) {
      return NextResponse.json({ error: 'sourceId obrigatório' }, { status: 400 });
    }

    // 1) Busca o lead + arquivos + usuário Chatwit (novo schema: via relação lead -> sourceIdentifier)
    const lead = await prisma.leadOabData.findFirst({
      where: { lead: { sourceIdentifier: sourceId } },
      include: {
        arquivos: true,
        usuarioChatwit: {
          select: {
            chatwitAccountId: true,
          },
        },
        lead: {
          select: { sourceIdentifier: true },
        },
      },
    });

    if (!lead || !lead.leadUrl) {
      throw new Error('Lead não encontrado ou sem leadUrl');
    }

    // 2) Buscar o usuário Chatwit para obter accountId
    const usuarioChatwit = await prisma.usuarioChatwit.findFirst({
      where: {
        leadsOabData: {
          some: { lead: { sourceIdentifier: sourceId } },
        },
      },
      select: { chatwitAccountId: true },
    });

    if (!usuarioChatwit?.chatwitAccountId) {
      return NextResponse.json(
        { error: 'Usuário Chatwit não configurado' },
        { status: 400 }
      );
    }

    // 3) Obter token de acesso (se não veio na URL, usa o do ambiente)
    if (!accessToken) {
      accessToken = CHATWOOT_ACCESS_TOKEN || null;
      console.log('Usando token de acesso padrão do ambiente');
    }
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Token de acesso não configurado' },
        { status: 500 }
      );
    }

    // 4) Seleciona a URL do PDF (prioriza recursoUrl → pdfUnificado → primeiro arquivo pdf)
    const pdfUrl =
      lead.recursoUrl ||
      lead.pdfUnificado ||
      lead.arquivos.find(
        (a: { id: string; dataUrl: string; fileType: string }) => a.fileType === 'pdf'
      )?.dataUrl;

    if (!pdfUrl) {
      throw new Error('Nenhum PDF de recurso disponível para este lead');
    }

    // 5) Extrai conversationId da URL (accountId vem do banco)
    const { conversationId } = extractIds(lead.leadUrl);
    const accountId = usuarioChatwit.chatwitAccountId;

    // 6) Baixa o PDF
    const { buffer, mime, filename } = await downloadFile(pdfUrl);

    // 7) Monta multipart/form-data
    const form = new FormData();
    form.append('content', message);
    form.append('message_type', 'outgoing');
    form.append('attachments[]', buffer, { filename, contentType: mime });

    // 8) Envia para o Chatwoot
    const chatwootUrl = `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;

    const cwRes = await axios.post(chatwootUrl, form, {
      headers: {
        ...form.getHeaders(),
        api_access_token: accessToken,
      },
      maxBodyLength: Number.POSITIVE_INFINITY, // garante upload de PDFs grandes
    });

    // 9) Atualizar o campo anotacoes do lead com a mensagem enviada
    const updateData: any = { anotacoes: message };

    await prisma.leadOabData.updateMany({
      where: { lead: { sourceIdentifier: sourceId } },
      data: updateData,
    });

    return NextResponse.json({ ok: true, chatwoot: cwRes.data });
  } catch (err: any) {
    console.error('[sendPdfRecursoAttachment] erro:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
