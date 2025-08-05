// app/api/pasta/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getPrismaInstance } from "@/lib/connections"
const prisma = getPrismaInstance();

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Usuário não autenticado" }, { status: 401 })
    }

    const pastas = await prisma.pasta.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
    })

    return NextResponse.json(pastas, { status: 200 })
  } catch (error: any) {
    console.error("[GET /api/pasta] Erro:", error)
    return NextResponse.json(
      { error: "Erro ao buscar pastas" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Usuário não autenticado" }, { status: 401 })
    }

    const { name } = await request.json() as { name: string }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Nome da pasta é obrigatório." }, { status: 400 })
    }

    const pasta = await prisma.pasta.create({
      data: {
        name: name.trim(),
        userId: session.user.id,
      },
    })

    return NextResponse.json(pasta, { status: 201 })
  } catch (error: any) {
    console.error("[POST /api/pasta] Erro:", error)
    return NextResponse.json(
      { error: "Erro ao criar pasta" },
      { status: 500 }
    )
  }
}
