import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';
import { createLogger } from '@/lib/utils/logger';

const prisma = getPrismaInstance();
const logger = createLogger('AI-Assistants-Inboxes');

// GET: lista inboxes (da API existente) e marca as associadas ao assistant
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const assistantId = String(searchParams.get('assistantId') || '');
  if (!assistantId) return NextResponse.json({ error: 'assistantId obrigatório' }, { status: 400 });

  // Buscar associações atuais no banco
  const links = await (prisma as any).aiAssistantInbox?.findMany?.({
    where: { assistantId },
    include: { inbox: true },
  }) || [];

  // Buscar inboxes/caixas da rota já existente (Dialogflow) – usamos como catálogo
  // IMPORTANTE: usar caminho relativo e encaminhar cookies para manter sessão
  let externals: any[] = [];
  try {
    // Preferir as caixas salvas localmente (tabela ChatwitInbox)
    const url = new URL('/api/admin/mtf-diamante/dialogflow/caixas', (request as any).nextUrl?.origin || `http://${request.headers.get('host')}`);
    const r = await fetch(url, {
      cache: 'no-store',
      headers: {
        // Encaminha cookie de sessão para a chamada interna
        cookie: request.headers.get('cookie') || '',
      },
    });
    if (!r.ok) {
      logger.warn('Falha ao consultar caixas internas', { status: r.status });
    } else {
      const j = await r.json();
      externals = Array.isArray(j?.caixas) ? j.caixas : (Array.isArray(j) ? j : []);
      logger.info('Caixas carregadas', { total: externals.length });
    }
  } catch (err: any) {
    logger.error('Erro ao buscar caixas internas', err?.message || err);
  }

  // Mapear "anexada" por inboxId (id externo Chatwit), e usar campos das caixas locais
  const attachedSet = new Set<string>(links.map((l: any) => l?.inbox?.inboxId));
  const result = externals.map((x: any) => ({
    inboxId: String(x?.inboxId || x?.inbox_id || ''), // id externo
    name: x?.nome || x?.name || 'Inbox',
    channelType: x?.channelType || x?.channel_type || '',
    attached: attachedSet.has(String(x?.inboxId || x?.inbox_id || '')),
  }));
  logger.info('Resultado para UI de conexão', { total: result.length, attached: result.filter(r => r.attached).length });

  return NextResponse.json({ inboxes: result });
}

// POST: attach/detach uma inbox ao assistant
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const assistantId = String(body?.assistantId || '');
  const inboxId = String(body?.inboxId || '');
  const name = String(body?.name || 'Inbox');
  const channelType = String(body?.channelType || '');
  const attach = body?.attach !== false; // default: true
  if (!assistantId || !inboxId) return NextResponse.json({ error: 'assistantId e inboxId são obrigatórios' }, { status: 400 });

  // Garantir UsuarioChatwit do usuário
  const uc = await prisma.usuarioChatwit.findFirst({ where: { appUserId: session.user.id } });
  if (!uc) return NextResponse.json({ error: 'UsuarioChatwit não encontrado para este usuário' }, { status: 409 });

  // Upsert da ChatwitInbox
  const inbox = await prisma.chatwitInbox.upsert({
    where: { usuarioChatwitId_inboxId: { usuarioChatwitId: uc.id, inboxId } },
    create: { usuarioChatwitId: uc.id, inboxId, nome: name, channelType },
    update: { nome: name, channelType },
    select: { id: true },
  });

  if (attach) {
    await (prisma as any).aiAssistantInbox.create({
      data: { assistantId, inboxDbId: inbox.id },
    });
    return NextResponse.json({ ok: true, attached: true });
  } else {
    await (prisma as any).aiAssistantInbox.deleteMany({ where: { assistantId, inboxDbId: inbox.id } });
    return NextResponse.json({ ok: true, attached: false });
  }
}


