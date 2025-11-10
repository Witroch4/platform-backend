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

      if (!acc[metaArea]) {
        acc[metaArea] = [];
      }

      acc[metaArea].push({
        id: rubric.id,
        nome: `${rubric.exam || "Exame"} - ${metaArea}`,
        area: metaArea,
        exam: rubric.exam,
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
