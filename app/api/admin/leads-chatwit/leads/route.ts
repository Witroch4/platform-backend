import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

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
    const page = Number.parseInt(url.searchParams.get("page") || "1");
    const limit = Number.parseInt(url.searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    // Se um ID específico foi fornecido, buscar apenas esse lead
    if (leadId) {
      const lead = await prisma.leadOabData.findFirst({
        where: { 
          id: leadId
        },
        include: {
          lead: true,
          usuarioChatwit: {
            select: {
              name: true,
              channel: true,
            },
          },
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
        console.log("[API Leads] Lead não encontrado para ID:", leadId);
        return NextResponse.json(
          { error: "Lead não encontrado" },
          { status: 404 }
        );
      }

      if (!lead.lead) {
        console.log("[API Leads] Lead sem dados de relacionamento para ID:", leadId, lead);
        return NextResponse.json(
          { error: "Dados do lead inválidos" },
          { status: 404 }
        );
      }

      if (!lead.lead.name) {
        console.log("[API Leads] Lead sem nome para ID:", leadId, lead.lead);
        return NextResponse.json(
          { error: "Nome do lead não encontrado" },
          { status: 404 }
        );
      }

      console.log("[API Leads] Lead encontrado com sucesso:", lead.id, lead.lead.name);
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
        where.usuarioChatwit = {
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
      where.usuarioChatwitId = usuarioId;
    }
    
    if (searchTerm) {
      where.OR = [
        { 
          lead: { 
            name: { 
              contains: searchTerm, 
              mode: "insensitive" 
            }
          }
        },
        { 
          lead: { 
            phone: { 
              contains: searchTerm, 
              mode: "insensitive" 
            }
          }
        },
        { 
          lead: { 
            email: { 
              contains: searchTerm, 
              mode: "insensitive" 
            }
          }
        },
      ];
    }

    // Buscar os leads e a contagem total
    const [leads, total] = await Promise.all([
      prisma.leadOabData.findMany({
        where: {
          ...where
        },
        skip,
        take: limit,
        orderBy: { lead: { createdAt: "desc" } },
        include: {
          lead: true,
          usuarioChatwit: {
            select: {
              name: true,
              channel: true,
            },
          },
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
      prisma.leadOabData.count({ 
        where: {
          ...where
        } 
      }),
    ]);

    // Debug: Log dos dados dos leads
    console.log("[API Leads] Debug - Primeiros 3 leads encontrados:");
    leads.slice(0, 3).forEach((lead, index) => {
      console.log(`[API Leads] Lead ${index + 1}:`, {
        id: lead.id,
        leadId: lead.leadId,
        leadData: lead.lead ? {
          id: lead.lead.id,
          name: lead.lead.name,
          email: lead.lead.email,
          phone: lead.lead.phone
        } : 'NULL',
        nomeReal: lead.nomeReal || 'undefined'
      });
    });

    // Transformar os dados para o formato esperado pelo frontend
    const transformedLeads = leads.map(lead => {
      const leadData = lead.lead;
      
      return {
        id: lead.id,
        sourceId: lead.leadId, // ID do lead original
        name: leadData?.name || null,
        nomeReal: lead.nomeReal || null,
        phoneNumber: leadData?.phone || null,
        email: leadData?.email || null,
        thumbnail: leadData?.avatarUrl || null,
        concluido: lead.concluido || false,
        anotacoes: lead.anotacoes || null,
        pdfUnificado: lead.pdfUnificado || null,
        imagensConvertidas: lead.imagensConvertidas || null,
        leadUrl: lead.leadUrl || null,
        fezRecurso: lead.fezRecurso || false,
        datasRecurso: lead.datasRecurso || null,
        provaManuscrita: lead.provaManuscrita || null,
        manuscritoProcessado: lead.manuscritoProcessado || false,
        aguardandoManuscrito: lead.aguardandoManuscrito || false,
        espelhoCorrecao: lead.espelhoCorrecao || null,
        textoDOEspelho: lead.textoDOEspelho || null,
        analiseUrl: lead.analiseUrl || null,
        argumentacaoUrl: lead.argumentacaoUrl || null,
        analiseProcessada: lead.analiseProcessada || false,
        aguardandoAnalise: lead.aguardandoAnalise || false,
        analisePreliminar: lead.analisePreliminar || null,
        analiseValidada: lead.analiseValidada || false,
        consultoriaFase2: lead.consultoriaFase2 || false,
        seccional: lead.seccional || null,
        areaJuridica: lead.areaJuridica || null,
        notaFinal: lead.notaFinal || null,
        situacao: lead.situacao || null,
        inscricao: lead.inscricao || null,
        examesParticipados: lead.examesParticipados || null,
        createdAt: leadData?.createdAt,
        updatedAt: leadData?.updatedAt,
        usuarioId: lead.usuarioChatwitId,
        usuario: lead.usuarioChatwit ? {
          id: lead.usuarioChatwitId,
          name: lead.usuarioChatwit.name,
          email: lead.usuarioChatwit.name, // Usando name como fallback
          channel: lead.usuarioChatwit.channel
        } : null,
        arquivos: lead.arquivos || []
      };
    });

    // Filtrar leads que têm dados válidos
    const validLeads = transformedLeads.filter(lead => {
      if (!lead.name && !lead.nomeReal) {
        console.log("[API Leads] Lead sem nome:", lead.id, { name: lead.name, nomeReal: lead.nomeReal });
        return false;
      }
      return true;
    });

    console.log("[API Leads] Total de leads válidos:", validLeads.length, "de", transformedLeads.length);

    return NextResponse.json({
      leads: validLeads,
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
    const whereClause: any = { id };
    if (currentUser!.role !== "SUPERADMIN") {
      whereClause.usuarioChatwit = { appUserId: session.user.id };
    }
    // Atualize o lead
    const lead = await prisma.leadOabData.update({
      where: whereClause,
      data: updateData,
    });

    // Se houver campos para atualizar no modelo Lead, faça isso separadamente
    if (email !== undefined) {
      const leadUpdateData: any = {};
      if (email !== undefined) leadUpdateData.email = email;
      
      await prisma.lead.update({
        where: { id: lead.leadId },
        data: leadUpdateData,
      });
    }

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
    const whereClause: any = { id };
    if (currentUser!.role !== "SUPERADMIN") {
      whereClause.usuarioChatwit = { appUserId: session.user.id };
    }
    // Verifica se o lead existe e pertence ao usuário
    const leadToDelete = await prisma.leadOabData.findFirst({ where: whereClause });
    if (!leadToDelete) {
      return NextResponse.json({ error: "Lead não encontrado ou acesso negado" }, { status: 404 });
    }

    // Remova o lead (arquivos serão removidos em cascata)
    await prisma.leadOabData.delete({ where: { id: leadToDelete.id } });

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