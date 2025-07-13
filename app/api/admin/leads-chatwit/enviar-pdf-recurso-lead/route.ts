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
  const filename    = decodeURIComponent(new URL(fileUrl).pathname.split('/').pop()!);
  return { buffer: Buffer.from(res.data), mime: contentType, filename };
}

// ---- Handler ----------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  try {
    // Extrair os parâmetros da URL
    const url = new URL(request.url);
    const sourceId = url.searchParams.get('sourceId');
    const message = url.searchParams.get('message') || 'Segue o nosso Recurso, qualquer dúvida estamos à disposição.';
    // Extrair accessToken personalizado se fornecido via URL
    let accessToken = url.searchParams.get('accessToken') || null;

    if (!sourceId) {
      return NextResponse.json({ error: 'sourceId obrigatório' }, { status: 400 });
    }

    // 1) Busca o lead + arquivos + usuário Chatwit
    const lead = await prisma.leadChatwit.findUnique({
      where: { sourceId },
      include: { 
        arquivos: true,
        usuario: {
          select: {
            chatwitAccountId: true
          }
        }
      }
    });
    
    if (!lead || !lead.leadUrl) {
      throw new Error('Lead não encontrado ou sem leadUrl');
    }

    // 2) Buscar o usuário Chatwit para obter token e accountId
    const usuarioChatwit = await prisma.usuarioChatwit.findFirst({
      where: { 
        leads: {
          some: { sourceId }
        }
      },
      select: { 
        chatwitAccountId: true
      }
    });
    
    if (!usuarioChatwit?.chatwitAccountId) {
      return NextResponse.json({ error: 'Usuário Chatwit não configurado' }, { status: 400 });
    }

    // 3) Obter token de acesso
    if (!accessToken) {
      // Buscar token do usuário Chatwit
      const usuarioComToken = await prisma.usuarioChatwit.findFirst({
        where: { 
          leads: {
            some: { sourceId }
          }
        },
        select: { 
          chatwitAccountId: true
        }
      });
      
      if (usuarioComToken) {
        console.log('Usando configuração do usuário Chatwit');
      }
    }
    
    // Se ainda não tiver, usa o token padrão do ambiente
    if (!accessToken) {
      accessToken = CHATWOOT_ACCESS_TOKEN || null;
      console.log('Usando token de acesso padrão do ambiente');
    }

    // Verificar se tem token de acesso
    if (!accessToken) {
      return NextResponse.json({ error: 'Token de acesso não configurado' }, { status: 500 });
    }

    // 4) Seleciona a URL do PDF (prioriza recursoUrl → pdfUnificado → primeiro arquivo pdf)
    const pdfUrl =
      lead.recursoUrl ||
      lead.pdfUnificado ||
      lead.arquivos.find((a: { id: string; dataUrl: string; fileType: string }) => a.fileType === 'pdf')?.dataUrl;

    if (!pdfUrl) {
      throw new Error('Nenhum PDF de recurso disponível para este lead');
    }

    // 5) Extrai conversationId da URL (accountId já temos do banco)
    const { conversationId } = extractIds(lead.leadUrl);
    const accountId = usuarioChatwit.chatwitAccountId; // Usar o ID do banco

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
        api_access_token: accessToken
      },
      maxBodyLength: Infinity // garante upload de PDFs grandes
    });

    // 9) Atualizar o campo anotacoes do lead com a mensagem enviada
    const updateData: any = { 
      anotacoes: message
    };
    
    // Se tiver um accessToken personalizado na URL que não é o do ambiente, salva no usuário Chatwit
    const urlAccessToken = url.searchParams.get('accessToken');
    if (urlAccessToken && urlAccessToken !== CHATWOOT_ACCESS_TOKEN) {
      // Buscar o usuário Chatwit associado ao lead
      const usuarioChatwit = await prisma.usuarioChatwit.findFirst({
        where: { 
          leads: {
            some: { sourceId }
          }
        }
      });
      
      if (usuarioChatwit) {
        // Atualizar apenas se o campo existir no modelo
        await prisma.usuarioChatwit.update({
          where: { id: usuarioChatwit.id },
          data: { 
            // Removido chatwitAccessToken pois não existe mais no modelo
          }
        });
      }
    }
    
    await prisma.leadChatwit.update({
      where: { sourceId },
      data: updateData
    });

    return NextResponse.json({ ok: true, chatwoot: cwRes.data });
  } catch (err: any) {
    console.error('[sendPdfRecursoAttachment] erro:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; 