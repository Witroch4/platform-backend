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

  // Buscar associações atuais no banco com configurações SocialWise
  const links = await (prisma as any).aiAssistantInbox?.findMany?.({
    where: { assistantId },
    include: { 
      inbox: true
    },
  }) || [];

  // Buscar caixas diretamente do banco de dados
  let externals: any[] = [];
  try {
    // Buscar o usuário Chatwit para obter as caixas
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      include: {
        inboxes: {
          include: {
            agentes: {
              orderBy: { createdAt: 'desc' }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (usuarioChatwit?.inboxes) {
      externals = usuarioChatwit.inboxes.map(inbox => ({
        inboxId: inbox.inboxId,
        nome: inbox.nome,
        name: inbox.nome, // Alias for compatibility
        channelType: inbox.channelType,
        channel_type: inbox.channelType, // Alias for compatibility
        agentes: inbox.agentes
      }));
      logger.info('Caixas carregadas diretamente do banco', { total: externals.length });
    } else {
      logger.warn('Nenhuma caixa encontrada para o usuário');
    }
  } catch (err: any) {
    logger.error('Erro ao buscar caixas do banco', err?.message || err);
  }

  // Mapear "anexada" por inboxId (id externo Chatwit), e usar campos das caixas locais
  const attachedMap = new Map<string, any>(
    links.map((l: any) => [l?.inbox?.inboxId, l])
  );
  
  const result = externals.map((x: any) => {
    const inboxId = String(x?.inboxId || x?.inbox_id || '');
    const link = attachedMap.get(inboxId);
    const inbox = link?.inbox;
    
    return {
      inboxId,
      name: x?.nome || x?.name || 'Inbox',
      channelType: x?.channelType || x?.channel_type || '',
      attached: !!link,
      socialwiseConfig: inbox ? {
        inheritFromAgent: inbox.socialwiseInheritFromAgent ?? true,
        reasoningEffort: inbox.socialwiseReasoningEffort,
        verbosity: inbox.socialwiseVerbosity,
        temperature: inbox.socialwiseTemperature,
        tempSchema: inbox.socialwiseTempSchema,
        warmupDeadlineMs: inbox.socialwiseWarmupDeadlineMs,
        hardDeadlineMs: inbox.socialwiseHardDeadlineMs,
        softDeadlineMs: inbox.socialwiseSoftDeadlineMs,
        shortTitleLLM: inbox.socialwiseShortTitleLLM,
        toolChoice: inbox.socialwiseToolChoice
      } : {
        inheritFromAgent: true // Default when no config exists
      }
    };
  });
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


