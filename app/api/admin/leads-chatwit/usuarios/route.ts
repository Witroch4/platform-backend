import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";

const prisma = new PrismaClient();

/**
 * GET - Lista usuários do Chatwit (filtrados por role e token de acesso)
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const url = new URL(request.url);
    const searchTerm = url.searchParams.get("search");
    const page = Number.parseInt(url.searchParams.get("page") || "1");
    const limit = Number.parseInt(url.searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    // Buscar informações do usuário atual
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (!currentUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Buscar o usuário Chatwit
    const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
      where: { appUserId: session.user.id },
      select: { chatwitAccessToken: true }
    });

    // Construir a cláusula where baseada nos parâmetros e role
    const where: any = {};
    
    // Se não for SUPERADMIN, filtrar apenas usuários relacionados ao token do usuário atual
    if (currentUser.role !== "SUPERADMIN") {
      if (!usuarioChatwit?.chatwitAccessToken) {
        // Se o usuário ADMIN não tem token configurado, não mostrar nenhum usuário
        return NextResponse.json({
          usuarios: [],
          pagination: {
            total: 0,
            page,
            limit,
            totalPages: 0,
          },
        });
      }

      // Para usuários não-SUPERADMIN, filtrar apenas o próprio usuário do Chatwit
      where.appUserId = session.user.id;
    }
    // Se for SUPERADMIN, não adiciona filtro = mostra todos os usuários
    
    if (searchTerm) {
      where.OR = [
        { name: { contains: searchTerm, mode: "insensitive" } },
        { availableName: { contains: searchTerm, mode: "insensitive" } },
        { accountName: { contains: searchTerm, mode: "insensitive" } },
        { channel: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    // Buscar os usuários e a contagem total
    const [usuarios, total] = await Promise.all([
      prisma.usuarioChatwit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          // Contar o número de leads por usuário
          _count: {
            select: {
              leads: true,
            },
          },
        },
      }),
      prisma.usuarioChatwit.count({ where }),
    ]);

    // Formatar os dados para a resposta
    const formattedUsuarios = usuarios.map(usuario => ({
      ...usuario,
      leadsCount: usuario._count.leads,
      _count: undefined, // Remove o campo _count
    }));

    return NextResponse.json({
      usuarios: formattedUsuarios,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[API Usuarios] Erro ao listar usuários:", error);
    return NextResponse.json(
      { error: "Erro interno ao listar usuários" },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove um usuário e todos os seus leads (apenas para SUPERADMIN)
 */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    // Buscar informações do usuário atual
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });
    if (!currentUser || currentUser.role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Acesso negado. Apenas SUPERADMIN pode remover usuários." },
        { status: 403 }
      );
    }
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "ID do usuário é obrigatório" },
        { status: 400 }
      );
    }
    // Remover o usuário (leads e arquivos serão removidos em cascata)
    await prisma.usuarioChatwit.delete({ where: { id } });
    return NextResponse.json({
      success: true,
      message: "Usuário e todos os seus dados removidos com sucesso",
    });
  } catch (error) {
    console.error("[API Usuarios] Erro ao remover usuário:", error);
    return NextResponse.json(
      { error: "Erro interno ao remover usuário" },
      { status: 500 }
    );
  }
} 