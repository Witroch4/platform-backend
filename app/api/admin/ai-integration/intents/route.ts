import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';
import { createLogger } from '@/lib/utils/logger';

const prisma = getPrismaInstance();
const logger = createLogger('AI-Intents');

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

async function ensureUserExists(userId: string, fallbackEmail?: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      id: userId,
      email: fallbackEmail || `${userId}@local.invalid`,
      name: name || undefined,
    },
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const items = await prisma.intent.findMany({
    where: { createdById: session.user.id, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      similarityThreshold: true,
      actionType: true,
      templateId: true,
      createdAt: true,
      template: { select: { id: true, name: true, type: true } },
    },
  });
  return NextResponse.json({ intents: items });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  await ensureUserExists(session.user.id, (session.user as any)?.email as string, session.user.name || undefined);

  const body = await request.json().catch(() => ({}));
  const name = (body?.name || '').trim();
  const description = (body?.description || '').trim();
  const similarityThreshold = typeof body?.similarityThreshold === 'number' ? Number(body.similarityThreshold) : 0.8;
  const templateId: string | null = body?.templateId || null;
  if (!name) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });

  const slug = slugify(name);

  try {
    // Verifica se já existe para este usuário
    const existingForUser = await prisma.intent.findFirst({ where: { name, createdById: session.user.id } });
    if (existingForUser) {
      // opcional: atualizar embedding quando description mudar
      let embedding: any = existingForUser.embedding;
      const shouldReembed = (description && description !== (existingForUser.description || ''));
      if (shouldReembed && process.env.OPENAI_API_KEY) {
        try {
          logger.info('Regerando embedding para intent existente', { id: existingForUser.id, name, hasDescription: Boolean(description) });
          const r = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
            body: JSON.stringify({ model: 'text-embedding-3-small', input: `${name}\n\n${description}`.trim() })
          });
          if (r.ok) {
            const j: any = await r.json();
            embedding = j?.data?.[0]?.embedding || embedding;
            if (Array.isArray(embedding)) {
              logger.info('Embedding atualizado', { dimensions: embedding.length });
              logger.debug('Embedding preview (primeiros 8 valores)', embedding.slice(0, 8));
            } else {
              logger.warn('Resposta de embedding não retornou vetor válido');
            }
          }
          else {
            logger.error('Falha ao obter embedding (update)', { status: r.status });
          }
        } catch (err: any) {
          logger.error('Erro ao gerar embedding (update)', err?.message || err);
        }
      }
      const updated = await prisma.intent.update({
        where: { id: existingForUser.id },
        data: {
          description: description || existingForUser.description,
          similarityThreshold,
          templateId: templateId ?? existingForUser.templateId,
          actionType: templateId ? 'TEMPLATE' : 'TEXT',
          isActive: true,
          embedding,
        },
        select: { id: true, name: true, description: true, similarityThreshold: true, actionType: true, templateId: true, createdAt: true },
      });
      logger.info('Intent atualizada com embedding', { id: updated.id, hasEmbedding: Array.isArray(embedding) });
      return NextResponse.json({ intent: updated, updated: true }, { status: 200 });
    }

    // Se o nome estiver em uso por outro usuário, retorna 409
    const anyWithSameName = await prisma.intent.findUnique({ where: { name } }).catch(() => null);
    if (anyWithSameName && anyWithSameName.createdById !== session.user.id) {
      return NextResponse.json({ error: 'Já existe uma intenção global com este nome' }, { status: 409 });
    }

    // criar embedding inicial se houver descrição
    let embedding: any = null;
    if (description && process.env.OPENAI_API_KEY) {
      try {
        logger.info('Gerando embedding inicial para intent', { name, hasDescription: true });
        const r = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model: 'text-embedding-3-small', input: `${name}\n\n${description}`.trim() })
        });
        if (r.ok) {
          const j: any = await r.json();
          embedding = j?.data?.[0]?.embedding || null;
          if (Array.isArray(embedding)) {
            logger.info('Embedding criado', { dimensions: embedding.length });
            logger.debug('Embedding preview (primeiros 8 valores)', embedding.slice(0, 8));
          } else {
            logger.warn('Embedding retornou valor inválido');
          }
        }
        else {
          logger.error('Falha ao obter embedding (create)', { status: r.status });
        }
      } catch (err: any) {
        logger.error('Erro ao gerar embedding (create)', err?.message || err);
      }
    }

    const created = await prisma.intent.create({
      data: {
        name,
        slug,
        description: description || null,
        actionType: templateId ? 'TEMPLATE' : 'TEXT',
        templateId: templateId,
        similarityThreshold,
        isActive: true,
        createdById: session.user.id,
        embedding,
      },
      select: { id: true, name: true, description: true, similarityThreshold: true, actionType: true, templateId: true, createdAt: true },
    });
    logger.info('Intent criada', { id: created.id, hasEmbedding: Array.isArray(embedding) });
    return NextResponse.json({ intent: created, created: true }, { status: 201 });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Já existe uma intenção com este nome' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Falha ao criar intenção' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const intent = await prisma.intent.findUnique({ where: { id } });
  if (!intent || intent.createdById !== session.user.id) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  await prisma.intent.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as any));
  const id = String(body?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const intent = await prisma.intent.findUnique({ where: { id } });
  if (!intent || intent.createdById !== session.user.id) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  const nextNameRaw: string | undefined = typeof body?.name === 'string' ? body.name.trim() : undefined;
  const nextDescription: string | null | undefined = typeof body?.description === 'string' ? body.description.trim() : undefined;
  const nextThreshold: number | undefined = typeof body?.similarityThreshold === 'number' ? Number(body.similarityThreshold) : undefined;
  const nextTemplateId: string | null | undefined = body?.templateId === null ? null : (typeof body?.templateId === 'string' ? body.templateId : undefined);

  if (!nextNameRaw && nextDescription === undefined && nextThreshold === undefined && nextTemplateId === undefined) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });
  }

  // Enforce unique name if it changes
  if (nextNameRaw && nextNameRaw !== intent.name) {
    const conflict = await prisma.intent.findUnique({ where: { name: nextNameRaw } }).catch(() => null);
    if (conflict && conflict.id !== id) {
      return NextResponse.json({ error: 'Já existe uma intenção com este nome' }, { status: 409 });
    }
  }

  const data: any = {};
  if (nextNameRaw) {
    data.name = nextNameRaw;
    data.slug = slugify(nextNameRaw);
  }
  if (nextDescription !== undefined) data.description = nextDescription || null;
  if (nextThreshold !== undefined) data.similarityThreshold = nextThreshold;
  if (nextTemplateId !== undefined) {
    data.templateId = nextTemplateId;
    data.actionType = nextTemplateId ? 'TEMPLATE' : 'TEXT';
  }

  // Se a descrição mudou, regerar embedding
  const descriptionChanged = nextDescription !== undefined && (nextDescription || null) !== (intent.description || null);
  if (descriptionChanged && process.env.OPENAI_API_KEY) {
    try {
      const textForEmbedding = (nextDescription || '') as string;
      logger.info('Regerando embedding via PATCH', { id, hasDescription: Boolean(textForEmbedding) });
      if (textForEmbedding) {
        const r = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model: 'text-embedding-3-small', input: textForEmbedding })
        });
        if (r.ok) {
          const j: any = await r.json();
          const emb = j?.data?.[0]?.embedding || null;
          if (Array.isArray(emb)) {
            data.embedding = emb;
            logger.info('Embedding (PATCH) atualizado', { dimensions: emb.length });
            logger.debug('Embedding (PATCH) preview (primeiros 8 valores)', emb.slice(0, 8));
          } else {
            logger.warn('Embedding (PATCH) retornou valor inválido');
          }
        } else {
          logger.error('Falha ao obter embedding (PATCH)', { status: r.status });
        }
      }
    } catch (err: any) {
      logger.error('Erro ao gerar embedding (PATCH)', err?.message || err);
    }
  }

  const updated = await prisma.intent.update({
    where: { id },
    data,
    select: { id: true, name: true, description: true, similarityThreshold: true, actionType: true, templateId: true, createdAt: true },
  });

  logger.info('Intent atualizada (PATCH)', { id: updated.id, regeneratedEmbedding: Boolean(data.embedding) });
  return NextResponse.json({ intent: updated });
}