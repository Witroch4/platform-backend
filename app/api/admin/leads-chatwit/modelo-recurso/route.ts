import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";

const prisma = new PrismaClient();

// GET - Buscar modelo de recurso
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Buscar modelo de recurso global
    const modeloRecurso = await prisma.modeloRecurso.findFirst({
      where: {
        isGlobal: true
      }
    });

    return NextResponse.json({ 
      modelo: modeloRecurso?.texto || "" 
    });
  } catch (error) {
    console.error("Erro ao buscar modelo de recurso:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// POST - Salvar modelo de recurso
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { modelo } = await request.json();

    if (!modelo || typeof modelo !== 'string') {
      return NextResponse.json({ error: "Modelo de recurso é obrigatório" }, { status: 400 });
    }

    // Salvar ou atualizar modelo de recurso global
    const modeloRecurso = await prisma.modeloRecurso.upsert({
      where: {
        id: "global_modelo_recurso"
      },
      update: {
        texto: modelo,
        updatedAt: new Date()
      },
      create: {
        id: "global_modelo_recurso",
        texto: modelo,
        isGlobal: true
      }
    });

    return NextResponse.json({ 
      success: true,
      modelo: modeloRecurso 
    });
  } catch (error) {
    console.error("Erro ao salvar modelo de recurso:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
} 