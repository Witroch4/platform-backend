import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// GET: Busca todas as variáveis do usuário
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Busca ou cria a configuração do MTF Diamante
    let config = await db.mtfDiamanteConfig.findFirst({
      where: { userId: session.user.id },
      include: { variaveis: true }
    });

    if (!config) {
      // Cria configuração padrão com variáveis iniciais
      config = await db.mtfDiamanteConfig.create({
        data: {
          userId: session.user.id,
          variaveis: {
            create: [
              { chave: "chave_pix", valor: "57944155000101" },
              { chave: "nome_do_escritorio_rodape", valor: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™" }
            ]
          }
        },
        include: { variaveis: true }
      });
    }

    return NextResponse.json({ success: true, variaveis: config.variaveis });

  } catch (error) {
    console.error("Erro em GET /variaveis:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// POST: Cria ou atualiza variáveis
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { variaveis } = body;

    if (!Array.isArray(variaveis)) {
      return NextResponse.json({ error: "Variáveis deve ser um array" }, { status: 400 });
    }

    // Busca ou cria a configuração do MTF Diamante
    let config = await db.mtfDiamanteConfig.findFirst({
      where: { userId: session.user.id }
    });

    if (!config) {
      config = await db.mtfDiamanteConfig.create({
        data: { userId: session.user.id }
      });
    }

    // Remove todas as variáveis existentes e cria as novas
    await db.mtfDiamanteVariavel.deleteMany({
      where: { configId: config.id }
    });

    // Cria as novas variáveis
    const novasVariaveis = await db.mtfDiamanteVariavel.createMany({
      data: variaveis.map((v: any) => ({
        configId: config.id,
        chave: v.chave,
        valor: v.valor
      }))
    });

    // Busca as variáveis criadas para retornar
    const variaveisCriadas = await db.mtfDiamanteVariavel.findMany({
      where: { configId: config.id }
    });

    return NextResponse.json({ success: true, variaveis: variaveisCriadas });

  } catch (error) {
    console.error("Erro em POST /variaveis:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}