import { NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export async function PUT(request: Request) {
  try {
    const { leadId, texto } = await request.json();

    if (!leadId || !texto) {
      return NextResponse.json(
        { error: "Lead ID e texto são obrigatórios" },
        { status: 400 }
      );
    }

    const lead = await prisma.leadOabData.update({
      where: { id: leadId },
      data: {
        provaManuscrita: texto,
        manuscritoProcessado: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Manuscrito atualizado com sucesso",
      lead,
    });
  } catch (error: any) {
    console.error("[API] Erro ao atualizar manuscrito:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno ao atualizar manuscrito" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const leadId = url.searchParams.get('leadId');

    if (!leadId) {
      return NextResponse.json(
        { error: "Lead ID é obrigatório" },
        { status: 400 }
      );
    }

    console.log(`[API Manuscrito] Iniciando exclusão do manuscrito para lead: ${leadId}`);

    // Resetar completamente todas as informações relacionadas ao manuscrito
    const lead = await prisma.leadOabData.update({
      where: { id: leadId },
      data: {
        // Campos específicos do manuscrito
        provaManuscrita: Prisma.JsonNull,
        manuscritoProcessado: false,
        aguardandoManuscrito: false,
        
        // Resetar campos de análise que dependem do manuscrito
        analiseUrl: null,
        analiseProcessada: false,
        aguardandoAnalise: false,
        analisePreliminar: Prisma.JsonNull,
        analiseValidada: false,
        
        // Resetar consultoria já que depende da análise
        consultoriaFase2: false,
        
        // Resetar campos de espelho que podem depender do manuscrito
        aguardandoEspelho: false,
        espelhoProcessado: false,
        
      },
    });

    console.log(`[API Manuscrito] Manuscrito e campos relacionados resetados com sucesso para lead: ${leadId}`);

    return NextResponse.json({
      success: true,
      message: "Manuscrito excluído com sucesso",
      lead,
    });
  } catch (error: any) {
    console.error("[API] Erro ao excluir manuscrito:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno ao excluir manuscrito" },
      { status: 500 }
    );
  }
} 