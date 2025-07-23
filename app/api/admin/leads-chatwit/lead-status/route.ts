// app/api/admin/leads-chatwit/lead-status/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(req: NextRequest) {
  try {
    /* 1 ─ Sessão */
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    /* 2 ─ Verifica role no banco */
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (user?.role !== 'ADMIN' && user?.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Permissão negada' }, { status: 403 });
    }

    /* 3 ─ Param id */
    const url    = new URL(req.url);
    const leadId = url.searchParams.get('id');
    if (!leadId) {
      return NextResponse.json({ error: 'ID do lead não fornecido' }, { status: 400 });
    }

    /* 4 ─ Busca lead */
    const lead = await db.leadChatwit.findUnique({
      where:  { id: leadId },
      select: {
        id: true,
        aguardandoManuscrito: true,
        manuscritoProcessado: true,
        provaManuscrita: true,
      },
    });
    if (!lead) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
    }

    /* 5 ─ Sucesso */
    return NextResponse.json(lead);
  } catch (error: any) {
    console.error('[Lead-Status]', error);
    return NextResponse.json(
      { error: 'Erro interno', details: error.message },
      { status: 500 },
    );
  }
}
