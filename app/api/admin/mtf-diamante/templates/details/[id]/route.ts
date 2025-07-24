import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
    const template = await prisma.whatsAppTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template não encontrado" },
        { status: 404 }
      );
    }

    // Processar componentes JSON para extrair botões
    let processedComponents: any[] = [];
    let buttons: any[] = [];

    try {
      // O campo components é JSON, não uma relação
      const componentsData = Array.isArray(template.components)
        ? template.components
        : [];

      processedComponents = componentsData.map((component: any, index: number) => ({
        type: component?.type || "UNKNOWN",
        content: component,
        order: index,
      }));

      // Extrair botões dos componentes
      const buttonComponent = processedComponents.find(
        (c) => c.type === "BUTTONS"
      );
      buttons = (buttonComponent?.content as any)?.buttons || [];
    } catch (error) {
      console.error("Erro ao processar componentes:", error);
    }

    const templateDetails = {
      id: template.id,
      name: template.name,
      category: template.category,
      language: template.language,
      status: template.status,
      components: processedComponents,
      buttons: buttons.map((btn: any, index: number) => ({
        id: `template_${templateId}_btn_${index}`,
        text: btn.text,
        type: btn.type,
        url: btn.url || null,
        phoneNumber: btn.phone_number || null,
      })),
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
