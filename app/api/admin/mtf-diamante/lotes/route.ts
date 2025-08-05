import { type NextRequest, NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
const prisma = getPrismaInstance();
import { auth } from '@/auth';
import type { PrismaClient } from '@prisma/client';

interface LoteOab {
  id: string;
  nome: string;
  valor: number;
  dataInicio: Date;
  dataFim: Date;
  ativo: boolean;
}

type PrismaWithLoteOab = PrismaClient & {
  loteOab: {
    findMany(args?: any): Promise<LoteOab[]>;
    create(args: { data: any }): Promise<LoteOab>;
  };
};

const prismaWithLoteOab = prisma as unknown as PrismaWithLoteOab;

// GET - Listar lotes
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    // TODO: Modelo loteOab não existe no novo schema
    // const lotesDb = await prismaWithLoteOab.loteOab.findMany({
    //   where: { usuarioChatwitId: usuarioChatwit.id },
    //   orderBy: { createdAt: 'desc' }
    // });
    const lotesDb: LoteOab[] = [];

    // Mapear para o formato esperado pelo componente
    const lotes = lotesDb.map(lote => ({
      id: lote.id,
      numero: 1, // Você pode adicionar este campo no banco se necessário
      nome: lote.nome,
      valor: `R$ ${lote.valor.toFixed(2).replace('.', ',')}`,
      dataInicio: lote.dataInicio,
      dataFim: lote.dataFim,
      isActive: lote.ativo
    }));

    return NextResponse.json({ lotes });
  } catch (error) {
    console.error('Erro ao buscar lotes:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST - Criar novo lote
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { numero, nome, valor, dataInicio, dataFim } = body;

    // Validar campos obrigatórios
    if (!numero || !nome || !valor || !dataInicio || !dataFim) {
      return NextResponse.json({ error: 'Campos obrigatórios não preenchidos' }, { status: 400 });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id }
    });

    if (!usuarioChatwit) {
      return NextResponse.json({ error: 'Usuário Chatwit não encontrado' }, { status: 404 });
    }

    // Criar lote no banco
    const lote = await prismaWithLoteOab.loteOab.create({
      data: {
        nome,
        valor: Number.parseFloat(valor.replace(/[^\d,]/g, '').replace(',', '.')), // Converter valor para decimal
        valorAnalise: 27.90, // Valor padrão da análise
        chavePix: '57944155000101', // Chave PIX padrão
        dataInicio: new Date(dataInicio),
        dataFim: new Date(dataFim),
        ativo: true, // Ativo por padrão
        usuarioChatwitId: usuarioChatwit.id
      }
    });

    return NextResponse.json({ 
      message: 'Lote criado com sucesso',
      lote: {
        id: lote.id,
        numero: numero,
        nome: lote.nome,
        valor: valor,
        dataInicio: lote.dataInicio,
        dataFim: lote.dataFim,
        isActive: lote.ativo
      }
    });
  } catch (error) {
    console.error('Erro ao criar lote:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
} 