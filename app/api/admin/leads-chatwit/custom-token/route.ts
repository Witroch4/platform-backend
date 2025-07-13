import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET para recuperar o token personalizado
export async function GET(request: Request): Promise<Response> {
  return NextResponse.json({ error: 'Rota obsoleta. Use o token do usuário (User.chatwitAccessToken).' }, { status: 410 });
}

// POST para salvar o token personalizado
export async function POST(request: Request): Promise<Response> {
  return NextResponse.json({ error: 'Rota obsoleta. Use o token do usuário (User.chatwitAccessToken).' }, { status: 410 });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; 