//app\auth\instagram\connect\route.ts
import { type NextRequest, NextResponse } from "next/server";
import { auth, update } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json(
        { error: "Não autorizado. Faça login para continuar." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: "Código de autorização não fornecido" },
        { status: 400 }
      );
    }

    // Variáveis de ambiente
    const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID!;
    const clientSecret = process.env.INSTAGRAM_APP_SECRET!;
    const redirectUri = process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI!;

    // Troca o código de autorização por um token de acesso
    const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("Erro ao obter token do Instagram:", errorData);
      return NextResponse.json(
        { error: "Falha ao obter token de acesso do Instagram" },
        { status: 400 }
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, user_id } = tokenData;

    // Obter informações do usuário do Instagram
    const userResponse = await fetch(
      `https://graph.instagram.com/me?fields=id,username&access_token=${access_token}`
    );

    if (!userResponse.ok) {
      console.error("Erro ao obter informações do usuário do Instagram");
      return NextResponse.json(
        { error: "Falha ao obter informações do usuário do Instagram" },
        { status: 400 }
      );
    }

    const userData = await userResponse.json();
    const { username } = userData;

    // Verificar se já existe uma conta com este providerAccountId
    const existingAccount = await prisma.account.findFirst({
      where: {
        provider: "instagram",
        providerAccountId: user_id.toString(),
      },
    });

    // Verificar se o usuário já tem outras contas do Instagram
    const userInstagramAccounts = await prisma.account.findMany({
      where: {
        userId: session.user.id,
        provider: "instagram",
      },
    });

    // Determinar se esta será a conta principal (primeira conta ou não)
    const isFirstAccount = userInstagramAccounts.length === 0;

    let accountId;

    if (existingAccount) {
      // Se a conta já existe e pertence a outro usuário, retornar erro
      if (existingAccount.userId !== session.user.id) {
        return NextResponse.json(
          { error: "Esta conta do Instagram já está conectada a outro usuário" },
          { status: 400 }
        );
      }

      // Atualizar a conta existente
      const updatedAccount = await prisma.account.update({
        where: {
          id: existingAccount.id,
        },
        data: {
          access_token,
          igUsername: username,
          igUserId: user_id.toString(),
          // Manter o status isMain se já estiver definido
          isMain: existingAccount.isMain !== undefined ? existingAccount.isMain : isFirstAccount
        },
      });

      accountId = updatedAccount.id;
    } else {
      // Criar uma nova conta
      const newAccount = await prisma.account.create({
        data: {
          userId: session.user.id,
          type: "oauth",
          provider: "instagram",
          providerAccountId: user_id.toString(),
          access_token,
          igUsername: username,
          igUserId: user_id.toString(),
          isMain: isFirstAccount // Definir como principal se for a primeira conta
        },
      });

      accountId = newAccount.id;
    }

    // Se for a primeira conta, atualizar a sessão com o token do Instagram
    if (isFirstAccount) {
      await update({
        user: {
          instagramAccessToken: access_token,
          providerAccountId: user_id.toString(),
        }
      });
    }

    // Buscar a conta recém-criada ou atualizada para retornar informações completas
    const account = await prisma.account.findUnique({
      where: {
        id: accountId,
      },
      select: {
        id: true,
        igUsername: true,
        isMain: true
      }
    });

    return NextResponse.json({
      success: true,
      username,
      accountId: account?.id,
      isMain: account?.isMain || false
    });
  } catch (error) {
    console.error("Erro ao conectar conta do Instagram:", error);
    return NextResponse.json(
      { error: "Ocorreu um erro ao conectar a conta do Instagram" },
      { status: 500 }
    );
  }
}