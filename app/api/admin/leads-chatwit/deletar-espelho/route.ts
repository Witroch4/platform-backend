import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Handler da rota DELETE para excluir completamente o espelho de correção.
 */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get('leadId');

    if (!leadId) {
      return NextResponse.json(
        { error: "ID do lead é obrigatório" },
        { status: 400 }
      );
    }

    console.log(`[Excluir Espelho] Excluindo espelho do lead: ${leadId}`);

    // Resetar todos os campos relacionados ao espelho
    const updatedLead = await prisma.leadOabData.update({
      where: { id: leadId },
      data: {
        espelhoCorrecao: null,
        textoDOEspelho: Prisma.JsonNull,
        espelhoProcessado: false,
        aguardandoEspelho: false,
      },
    });

    console.log(`[Excluir Espelho] Espelho excluído com sucesso para o lead: ${leadId}`);

    return NextResponse.json({
      success: true,
      message: "Espelho excluído com sucesso",
      lead: updatedLead
    });

  } catch (error: any) {
    console.error("[Excluir Espelho] Erro:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

/**
 * Handler da rota PUT para salvar o espelho de correção.
 */
export async function PUT(request: Request): Promise<Response> {
  try {
    const { leadId, texto, imagens } = await request.json();

    if (!leadId) {
      return NextResponse.json(
        { error: "ID do lead é obrigatório" },
        { status: 400 }
      );
    }

    console.log(`[Salvar Espelho] Salvando espelho do lead: ${leadId}`);

    // Atualizar o espelho no banco de dados
    const updatedLead = await prisma.leadOabData.update({
      where: { id: leadId },
      data: {
        textoDOEspelho: texto ? texto : Prisma.JsonNull,
        espelhoCorrecao: imagens ? JSON.stringify(imagens) : null,
        espelhoProcessado: !!(texto || (imagens && imagens.length > 0)),
        aguardandoEspelho: false,
      },
    });

    console.log(`[Salvar Espelho] Espelho salvo com sucesso para o lead: ${leadId}`);

    return NextResponse.json({
      success: true,
      message: "Espelho salvo com sucesso",
      lead: updatedLead
    });

  } catch (error: any) {
    console.error("[Salvar Espelho] Erro:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
} 