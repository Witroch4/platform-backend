import { NextResponse } from 'next/server';
import { getPrismaInstance } from '@/lib/connections';
const prisma = getPrismaInstance();
import { auth } from '@/auth';
import type { EspecialidadeJuridica } from '@prisma/client';

/**
 * GET - Buscar todos os espelhos padrão
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const especialidadeParam = searchParams.get('especialidade');

    // Buscar espelhos padrão (com filtro opcional por especialidade)
    const espelhosPadrao = await prisma.espelhoPadrao.findMany({
      where: {
        isAtivo: true,
        ...(especialidadeParam && { especialidade: especialidadeParam as EspecialidadeJuridica }),
      },
      select: {
        id: true,
        nome: true,
        especialidade: true,
        descricao: true,
        updatedAt: true,
        atualizadoPor: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    return NextResponse.json({
      success: true,
      espelhos: espelhosPadrao
    });
  } catch (error: any) {
    console.error("[API Espelhos Padrão GET] Erro:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

/**
 * POST - Criar novo espelho padrão ou fazer upload
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // 🔧 NOVO: Verificar autenticação
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const data = await request.json();
    const { especialidade, nome, descricao, usuarioId, espelhoCorrecao, tipoProcessamento } = data;

    if (!especialidade || !nome) {
      return NextResponse.json(
        { error: "Especialidade e nome são obrigatórios" },
        { status: 400 }
      );
    }

    // 🔧 NOVO: Verificar se o usuário existe na tabela UsuarioChatwit
    let usuarioValido = null;
    
    if (usuarioId && usuarioId !== 'global') {
      // Tentar usar o usuarioId fornecido
      usuarioValido = await prisma.usuarioChatwit.findUnique({
        where: { id: usuarioId },
        select: { id: true, name: true }
      });
    }
    
    if (!usuarioValido) {
      // Se não encontrou, tentar buscar o primeiro usuário disponível ou usar o ID da sessão
      // Como não temos email na tabela UsuarioChatwit, vamos buscar um usuário válido
      usuarioValido = await prisma.usuarioChatwit.findFirst({
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' }
      });
    }
    
    if (!usuarioValido) {
      return NextResponse.json(
        { error: "Nenhum usuário encontrado no sistema Chatwit" },
        { status: 404 }
      );
    }

    // Verificar se já existe um espelho padrão para essa especialidade
    const espelhoExistente = await prisma.espelhoPadrao.findUnique({
      where: { especialidade }
    });

    if (espelhoExistente) {
      // Atualizar o existente
      const espelhoAtualizado = await prisma.espelhoPadrao.update({
        where: { especialidade },
        data: {
          nome,
          descricao,
          espelhoCorrecao,
          atualizadoPorId: usuarioValido.id,
          updatedAt: new Date()
        },
        include: {
          atualizadoPor: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      return NextResponse.json({
        success: true,
        espelhoPadrao: espelhoAtualizado,
        message: "Espelho padrão atualizado com sucesso"
      });
    } else {
      // Criar novo
      const novoEspelhoPadrao = await prisma.espelhoPadrao.create({
        data: {
          especialidade,
          nome,
          descricao,
          espelhoCorrecao,
          atualizadoPorId: usuarioValido.id
        },
        include: {
          atualizadoPor: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      return NextResponse.json({
        success: true,
        espelhoPadrao: novoEspelhoPadrao,
        message: "Espelho padrão criado com sucesso"
      });
    }
  } catch (error: any) {
    console.error("[API Espelhos Padrão POST] Erro:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

/**
 * PUT - Atualizar espelho padrão
 */
export async function PUT(request: Request): Promise<Response> {
  try {
    const data = await request.json();
    const { id, textoMarkdown, processado, aguardandoProcessamento } = data;

    if (!id) {
      return NextResponse.json(
        { error: "ID é obrigatório" },
        { status: 400 }
      );
    }

    const espelhoAtualizado = await prisma.espelhoPadrao.update({
      where: { id },
      data: {
        ...(textoMarkdown !== undefined && { textoMarkdown }),
        ...(processado !== undefined && { processado }),
        ...(aguardandoProcessamento !== undefined && { aguardandoProcessamento }),
        updatedAt: new Date()
      },
      include: {
        atualizadoPor: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      espelhoPadrao: espelhoAtualizado,
      message: "Espelho padrão atualizado com sucesso"
    });
  } catch (error: any) {
    console.error("[API Espelhos Padrão PUT] Erro:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; 