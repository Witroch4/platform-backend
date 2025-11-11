import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Usuário não autenticado." },
      { status: 401 }
    );
  }

  try {
    const prisma = getPrismaInstance();

    // Buscar todas as rubricas OAB
    const rubrics = await prisma.oabRubric.findMany({
      select: {
        id: true,
        code: true,
        exam: true,
        area: true,
        version: true,
        meta: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Agrupar por área (extraída do meta.area)
    const rubricsByArea = rubrics.reduce((acc, rubric: any) => {
      const metaArea = rubric.meta?.area || rubric.area || "DESCONHECIDA";
      // Priorizar meta.exam, depois exam do campo direto
      const examInfo = rubric.meta?.exam || rubric.exam || "Exame Desconhecido";

      if (!acc[metaArea]) {
        acc[metaArea] = [];
      }

      acc[metaArea].push({
        id: rubric.id,
        nome: `${examInfo} - ${metaArea}`,
        area: metaArea,
        exam: examInfo,
        version: rubric.version,
      });

      return acc;
    }, {} as Record<string, any[]>);

    return NextResponse.json({
      success: true,
      rubrics: rubricsByArea,
      total: rubrics.length,
    });
  } catch (error) {
    console.error("[oab-rubrics] Error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar rubricas OAB" },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
