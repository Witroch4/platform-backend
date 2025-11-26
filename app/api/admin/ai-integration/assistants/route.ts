import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';

const prisma = getPrismaInstance();

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

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) {
    if (!(prisma as any).aiAssistant) {
      return NextResponse.json(
        { error: 'Modelo AiAssistant indisponível. Rode as migrações (npx prisma db push).'},
        { status: 503 }
      );
    }
    const a = await prisma.aiAssistant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        productName: true,
        generateFaqs: true,
        captureMemories: true,
        proposeHumanHandoff: true,
        disableIntentSuggestion: true,
        enableAutoRemarketing: true,
        remarketingDelayMinutes: true,
        remarketingMessage: true,
        instructions: true,
        intentOutputFormat: true,
        model: true,
        // SocialWise Flow optimization settings
        embedipreview: true,
        reasoningEffort: true,
        verbosity: true,
        temperature: true,
        topP: true,
        tempSchema: true,
        tempCopy: true,
        maxOutputTokens: true,
        warmupDeadlineMs: true,
        hardDeadlineMs: true,
        softDeadlineMs: true,
        shortTitleLLM: true,
        toolChoice: true,
        userId: true,
        createdAt: true,
      },
    });
    if (!a || a.userId !== session.user.id) {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
    // não expor userId no payload
    const { userId, ...assistant } = a as any;
    return NextResponse.json({ assistant });
  }
  const assistants = await prisma.aiAssistant.findMany({
    where: { userId: session.user.id, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      productName: true,
      generateFaqs: true,
      captureMemories: true,
      model: true,
      embedipreview: true,
      reasoningEffort: true,
      verbosity: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ assistants });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  // Guard: certificar que o client foi gerado com o modelo AiAssistant
  if (!(prisma as any).aiAssistant) {
    return NextResponse.json(
      { error: 'Modelo AiAssistant indisponível. Rode as migrações/gera o client (npx prisma db push && npx prisma generate).'},
      { status: 503 }
    );
  }
  await ensureUserExists(session.user.id, (session.user as any)?.email as string, session.user.name || undefined);

  const body = await request.json().catch(() => ({}));
  const name = (body?.name || '').trim();
  const description = (body?.description || '').trim();
  const productName = (body?.productName || '').trim();
  const generateFaqs = !!body?.generateFaqs;
  const captureMemories = !!body?.captureMemories;
  if (!name) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });

  try {
    const created = await prisma.aiAssistant.create({
      data: {
        userId: session.user.id,
        name,
        description: description || null,
        productName: productName || null,
        generateFaqs,
        captureMemories,
        instructions: body?.instructions ? String(body.instructions) : null,
        intentOutputFormat: body?.intentOutputFormat === 'AT_SYMBOL' ? 'AT_SYMBOL' : 'JSON',
        model: typeof body?.model === 'string' && body.model.trim() ? String(body.model) : 'gpt-5-nano',
        // SocialWise Flow optimization settings with defaults
        embedipreview: body?.embedipreview !== undefined ? !!body.embedipreview : true,
        reasoningEffort: ['minimal', 'low', 'medium', 'high'].includes(body?.reasoningEffort) ? body.reasoningEffort : 'minimal',
        verbosity: ['low', 'medium', 'high'].includes(body?.verbosity) ? body.verbosity : 'low',
        temperature: typeof body?.temperature === 'number' && body.temperature >= 0 && body.temperature <= 2 ? body.temperature : 0.7,
        topP: typeof body?.topP === 'number' && body.topP >= 0 && body.topP <= 1 ? body.topP : 0.7,
        tempSchema: typeof body?.tempSchema === 'number' && body.tempSchema >= 0 && body.tempSchema <= 2 ? body.tempSchema : 0.1,
        tempCopy: typeof body?.tempCopy === 'number' && body.tempCopy >= 0 && body.tempCopy <= 2 ? body.tempCopy : 0.4,
        maxOutputTokens: typeof body?.maxOutputTokens === 'number' && body.maxOutputTokens >= 64 ? body.maxOutputTokens : 1380,
        warmupDeadlineMs: typeof body?.warmupDeadlineMs === 'number' && body.warmupDeadlineMs > 0 ? body.warmupDeadlineMs : 15000,
        hardDeadlineMs: typeof body?.hardDeadlineMs === 'number' && body.hardDeadlineMs > 0 ? body.hardDeadlineMs : 15000,
        softDeadlineMs: typeof body?.softDeadlineMs === 'number' && body.softDeadlineMs > 0 ? body.softDeadlineMs : 15000,
        shortTitleLLM: body?.shortTitleLLM !== undefined ? !!body.shortTitleLLM : true,
        toolChoice: ['none', 'auto'].includes(body?.toolChoice) ? body.toolChoice : 'auto',
      },
      select: {
        id: true,
        name: true,
        description: true,
        productName: true,
        generateFaqs: true,
        captureMemories: true,
        model: true,
        embedipreview: true,
        reasoningEffort: true,
        verbosity: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ assistant: created }, { status: 201 });
  } catch (e: any) {
    console.error('Erro ao criar assistente:', e);
    const hint = e?.code ? `Prisma ${e.code}` : 'unknown';
    return NextResponse.json({ error: 'Falha ao criar assistente', hint, detail: e?.message || String(e) }, { status: 500 });
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

  const assistant = await prisma.aiAssistant.findUnique({ where: { id } });
  if (!assistant || assistant.userId !== session.user.id) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }
  await prisma.aiAssistant.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || '');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const assistant = await prisma.aiAssistant.findUnique({ where: { id } });
  if (!assistant || assistant.userId !== session.user.id) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const updateData: any = {};
  if (typeof body?.name === 'string') updateData.name = String(body.name).trim();
  if (typeof body?.description === 'string') updateData.description = String(body.description).trim();
  if (typeof body?.productName === 'string') updateData.productName = String(body.productName).trim();
  if (typeof body?.generateFaqs === 'boolean') updateData.generateFaqs = body.generateFaqs;
  if (typeof body?.captureMemories === 'boolean') updateData.captureMemories = body.captureMemories;
  if (typeof body?.proposeHumanHandoff === 'boolean') updateData.proposeHumanHandoff = body.proposeHumanHandoff;
  if (typeof body?.disableIntentSuggestion === 'boolean') updateData.disableIntentSuggestion = body.disableIntentSuggestion;
  if (typeof body?.enableAutoRemarketing === 'boolean') updateData.enableAutoRemarketing = body.enableAutoRemarketing;
  if (typeof body?.remarketingDelayMinutes === 'number' && body.remarketingDelayMinutes >= 5 && body.remarketingDelayMinutes <= 1440) updateData.remarketingDelayMinutes = body.remarketingDelayMinutes;
  if (typeof body?.remarketingMessage === 'string') updateData.remarketingMessage = body.remarketingMessage || null;
  if (typeof body?.instructions === 'string') updateData.instructions = body.instructions;
  if (typeof body?.intentOutputFormat === 'string') updateData.intentOutputFormat = body.intentOutputFormat === 'AT_SYMBOL' ? 'AT_SYMBOL' : 'JSON';
  if (typeof body?.model === 'string') updateData.model = String(body.model).trim();
  
  // SocialWise Flow optimization settings
  if (typeof body?.embedipreview === 'boolean') updateData.embedipreview = body.embedipreview;
  if (['minimal', 'low', 'medium', 'high'].includes(body?.reasoningEffort)) updateData.reasoningEffort = body.reasoningEffort;
  if (['low', 'medium', 'high'].includes(body?.verbosity)) updateData.verbosity = body.verbosity;
  if (typeof body?.temperature === 'number' && body.temperature >= 0 && body.temperature <= 2) updateData.temperature = body.temperature;
  if (typeof body?.topP === 'number' && body.topP >= 0 && body.topP <= 1) updateData.topP = body.topP;
  if (typeof body?.tempSchema === 'number' && body.tempSchema >= 0 && body.tempSchema <= 2) updateData.tempSchema = body.tempSchema;
  if (typeof body?.tempCopy === 'number' && body.tempCopy >= 0 && body.tempCopy <= 2) updateData.tempCopy = body.tempCopy;
  // Max output tokens validation based on user role
  if (typeof body?.maxOutputTokens === 'number' && body.maxOutputTokens >= 64) {
    const userRole = session.user.role;
    let maxLimit = 1024; // DEFAULT users
    
    if (userRole === 'SUPERADMIN') {
      maxLimit = 48000; // SUPERADMIN can use up to 48k tokens
    } else if (userRole === 'ADMIN') {
      maxLimit = 4096; // ADMIN can use up to 4k tokens
    }
    
    if (body.maxOutputTokens <= maxLimit) {
      updateData.maxOutputTokens = body.maxOutputTokens;
    }
  }
  if (typeof body?.warmupDeadlineMs === 'number' && body.warmupDeadlineMs > 0) updateData.warmupDeadlineMs = body.warmupDeadlineMs;
  if (typeof body?.hardDeadlineMs === 'number' && body.hardDeadlineMs > 0) updateData.hardDeadlineMs = body.hardDeadlineMs;
  if (typeof body?.softDeadlineMs === 'number' && body.softDeadlineMs > 0) updateData.softDeadlineMs = body.softDeadlineMs;
  if (typeof body?.shortTitleLLM === 'boolean') updateData.shortTitleLLM = body.shortTitleLLM;
  if (['none', 'auto'].includes(body?.toolChoice)) updateData.toolChoice = body.toolChoice;

  const updated = await prisma.aiAssistant.update({ where: { id }, data: updateData, select: { id: true } });
  return NextResponse.json({ ok: true, id: updated.id });
}


