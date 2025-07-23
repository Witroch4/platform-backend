import { auth } from "@/auth"; // Assumindo que este é o seu arquivo de configuração do NextAuth
import { NextResponse, NextRequest } from "next/server";

// A função `auth` já injeta o objeto `auth` no `req`.
// Não é necessário criar tipos personalizados ou fazer asserções complexas.
// O NextAuth gerencia isso automaticamente.

export async function GET(req: NextRequest) {
  // A função `auth()` retorna a sessão do lado do servidor.
  const session = await auth();

  if (session?.user) {
    // Se a sessão existir, o usuário está autenticado.
    // Você pode acessar os dados do usuário através de `session.user`.
    return NextResponse.json({ 
      message: "Usuário Autenticado", 
      userId: session.user.id 
    });
  }

  // Se não houver sessão, retorne um erro de não autorizado.
  return NextResponse.json({ message: "Não Autenticado" }, { status: 401 });
}

export const config = {
  runtime: 'nodejs',
};