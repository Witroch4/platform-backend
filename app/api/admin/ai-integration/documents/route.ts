import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';

const prisma = getPrismaInstance();

async function ensureUserExists(userId: string, email?: string | null, name?: string | null) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (u) return u;
  return prisma.user.create({ data: { id: userId, email: email || `${userId}@local.invalid`, name: name || undefined } });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const assistantId = searchParams.get('assistantId') || undefined;
  const docs = await prisma.aiDocument.findMany({
    where: { userId: session.user.id, isActive: true, assistantId: assistantId || undefined },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, sourceUrl: true, assistantId: true, createdAt: true },
  });
  return NextResponse.json({ documents: docs });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  await ensureUserExists(session.user.id, (session.user as any)?.email as string, session.user.name || undefined);
  const body = await request.json().catch(() => ({}));
  const title = (body?.title || '').trim();
  const sourceUrl = (body?.sourceUrl || '').trim();
  const contentText = (body?.contentText || '').trim();
  const assistantId = body?.assistantId ? String(body.assistantId) : undefined;
  if (!title) return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 });
  const created = await prisma.aiDocument.create({
    data: {
      userId: session.user.id,
      assistantId,
      title,
      sourceUrl: sourceUrl || null,
      contentText: contentText || null,
    },
    select: { id: true, title: true, sourceUrl: true, assistantId: true, createdAt: true },
  });
  return NextResponse.json({ document: created }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  const doc = await prisma.aiDocument.findUnique({ where: { id } });
  if (!doc || doc.userId !== session.user.id) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  await prisma.aiDocument.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}


