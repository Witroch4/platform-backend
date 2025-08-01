import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";

// GET - Buscar detalhes de um template específico
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const resolvedParams = await params;
    const templateId = resolvedParams.id;

    // Buscar template no banco de dados
    const template = await db.template.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template não encontrado" },
        { status: 404 }
      );
    }

    const templateDetails = {
      id: template.id,
      name: template.name,
      language: template.language,
      status: template.status,
      tags: template.tags,
      text: template.simpleReplyText,
    };

    return NextResponse.json(templateDetails);
  } catch (error) {
    console.error("Erro ao buscar detalhes do template:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
