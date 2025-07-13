import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";

const prisma = new PrismaClient();

/**
 * GET - Lista todos os leads ou filtra por parâmetros
 */
export async function GET(request: Request): Promise<Response> {
  try {
    // Verificar autenticação
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const url = new URL(request.url);
    const leadId = url.searchParams.get("id");
    const usuarioId = url.searchParams.get("usuarioId");
    const searchTerm = url.searchParams.get("search");
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    // Se um ID específico foi fornecido, buscar apenas esse lead
    if (leadId) {
      const lead = await prisma.leadChatwit.findUnique({
        where: { id: leadId },
        include: {
          usuario: true,
          arquivos: {
            select: {
              id: true,
              fileType: true,
              dataUrl: true,
              pdfConvertido: true,
              createdAt: true,
            },
          },
        },
      });

      if (!lead) {
        return NextResponse.json(
          { error: "Lead não encontrado" },
          { status: 404 }
        );
      }

      return NextResponse.json(lead);
    }

    // Construir a cláusula where baseada nos parâmetros
    const where: any = {};
    
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

    // Controle de acesso baseado em role
    if (currentUser!.role !== "SUPERADMIN") {
      if (usuarioChatwit?.chatwitAccessToken) {
        // Para usuários não-SUPERADMIN, filtrar apenas leads do próprio usuário
        where.usuario = {
          appUserId: session.user.id
        };
      } else {
        // Se o usuário não tem token, não pode ver nenhum lead
        return NextResponse.json({
          leads: [],
          pagination: {
            total: 0,
            page,
            limit,
            totalPages: 0,
          },
        });
      }
    }
    // Se for SUPERADMIN, o where continua vazio = mostra todos os leads
    
    if (usuarioId) {
      where.usuarioId = usuarioId;
    }
    
    if (searchTerm) {
      where.OR = [
        { name: { contains: searchTerm, mode: "insensitive" } },
        { nomeReal: { contains: searchTerm, mode: "insensitive" } },
        { phoneNumber: { contains: searchTerm, mode: "insensitive" } },
        { email: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    // Buscar os leads e a contagem total
    const [leads, total] = await Promise.all([
      prisma.leadChatwit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          usuario: true,
          arquivos: {
            select: {
              id: true,
              fileType: true,
              dataUrl: true,
              pdfConvertido: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.leadChatwit.count({ where }),
    ]);

    return NextResponse.json({
      leads,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[API Leads] Erro ao listar leads:", error);
    return NextResponse.json(
      { error: "Erro interno ao listar leads" },
      { status: 500 }
    );
  }
}

/**
 * POST - Atualiza os dados de um lead
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });
    const { 
      id, 
      nomeReal, 
      email, 
      anotacoes, 
      concluido, 
      fezRecurso, 
      datasRecurso, 
      textoDOEspelho, 
      espelhoCorrecao,
      // Campos de processamento
      pdfUnificado,
      imagensConvertidas,
      // Campos relacionados à análise
      analiseUrl,
      analiseProcessada,
      aguardandoAnalise,
      analisePreliminar,
      analiseValidada,
      consultoriaFase2,
      // Campos relacionados ao manuscrito
      aguardandoManuscrito,
      manuscritoProcessado,
      provaManuscrita,
      // Campos relacionados ao espelho
      aguardandoEspelho,
      espelhoProcessado
    } = await request.json();
    
    // Valide os dados recebidos
    if (!id) {
      return NextResponse.json(
        { error: "ID do lead é obrigatório" },
        { status: 400 }
      );
    }

    console.log("[API Leads] Atualizando lead:", id, {
      ...(pdfUnificado !== undefined && { pdfUnificado }),
      ...(imagensConvertidas !== undefined && { imagensConvertidas: typeof imagensConvertidas === 'string' ? "[" + JSON.parse(imagensConvertidas).length + " imagens]" : "[array de imagens]" }),
      ...(aguardandoAnalise !== undefined && { aguardandoAnalise }),
      ...(analiseProcessada !== undefined && { analiseProcessada }),
      ...(analiseUrl !== undefined && { analiseUrl }),
      ...(analisePreliminar !== undefined && { analisePreliminar: "Presente" }),
      ...(analiseValidada !== undefined && { analiseValidada }),
      ...(consultoriaFase2 !== undefined && { consultoriaFase2 }),
      ...(aguardandoManuscrito !== undefined && { aguardandoManuscrito }),
      ...(manuscritoProcessado !== undefined && { manuscritoProcessado }),
      ...(provaManuscrita !== undefined && { provaManuscrita: "Presente" }),
      ...(aguardandoEspelho !== undefined && { aguardandoEspelho }),      
      ...(espelhoProcessado !== undefined && { espelhoProcessado }),
    });

    // Verificar quais campos foram enviados e montar o objeto de update
    const updateData: any = {};
    
    if (nomeReal !== undefined) updateData.nomeReal = nomeReal;
    if (email !== undefined) updateData.email = email;
    if (anotacoes !== undefined) updateData.anotacoes = anotacoes;
    if (concluido !== undefined) updateData.concluido = concluido;
    if (fezRecurso !== undefined) updateData.fezRecurso = fezRecurso;
    if (datasRecurso !== undefined) updateData.datasRecurso = datasRecurso;
    if (textoDOEspelho !== undefined) updateData.textoDOEspelho = textoDOEspelho;
    if (espelhoCorrecao !== undefined) updateData.espelhoCorrecao = espelhoCorrecao;
    if (pdfUnificado !== undefined) updateData.pdfUnificado = pdfUnificado;
    if (imagensConvertidas !== undefined) updateData.imagensConvertidas = imagensConvertidas;
    if (analiseUrl !== undefined) updateData.analiseUrl = analiseUrl;
    if (analiseProcessada !== undefined) updateData.analiseProcessada = analiseProcessada;
    if (aguardandoAnalise !== undefined) updateData.aguardandoAnalise = aguardandoAnalise;
    if (analisePreliminar !== undefined) updateData.analisePreliminar = analisePreliminar;
    if (analiseValidada !== undefined) updateData.analiseValidada = analiseValidada;
    if (consultoriaFase2 !== undefined) updateData.consultoriaFase2 = consultoriaFase2;
    if (aguardandoManuscrito !== undefined) updateData.aguardandoManuscrito = aguardandoManuscrito;
    if (manuscritoProcessado !== undefined) updateData.manuscritoProcessado = manuscritoProcessado;
    if (provaManuscrita !== undefined) updateData.provaManuscrita = provaManuscrita;
    if (aguardandoEspelho !== undefined) updateData.aguardandoEspelho = aguardandoEspelho;
    if (espelhoProcessado !== undefined) updateData.espelhoProcessado = espelhoProcessado;

    // Verificação de ownership
    let whereClause: any = { id };
    if (currentUser!.role !== "SUPERADMIN") {
      whereClause.usuario = { appUserId: session.user.id };
    }
    // Atualize o lead
    const lead = await prisma.leadChatwit.update({
      where: whereClause,
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      lead,
    });
  } catch (error) {
    console.error("[API Leads] Erro ao atualizar lead:", error);
    return NextResponse.json(
      { error: "Erro interno ao atualizar lead" },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove um lead e todos os seus arquivos
 */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID do lead é obrigatório" },
        { status: 400 }
      );
    }

    // Verificação de ownership
    let whereClause: any = { id };
    if (currentUser!.role !== "SUPERADMIN") {
      whereClause.usuario = { appUserId: session.user.id };
    }
    // Verifica se o lead existe e pertence ao usuário
    const leadToDelete = await prisma.leadChatwit.findFirst({ where: whereClause });
    if (!leadToDelete) {
      return NextResponse.json({ error: "Lead não encontrado ou acesso negado" }, { status: 404 });
    }

    // Remova o lead (arquivos serão removidos em cascata)
    await prisma.leadChatwit.delete({ where: { id: leadToDelete.id } });

    return NextResponse.json({
      success: true,
      message: "Lead removido com sucesso",
    });
  } catch (error) {
    console.error("[API Leads] Erro ao remover lead:", error);
    return NextResponse.json(
      { error: "Erro interno ao remover lead" },
      { status: 500 }
    );
  }
} 