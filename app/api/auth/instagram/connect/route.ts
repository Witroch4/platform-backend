// app/api/auth/instagram/connect/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections"

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Obter o código de autorização do corpo da requisição
    const body = await request.json().catch(() => ({}));
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: "Código de autorização não fornecido" },
        { status: 400 }
      );
    }

    // Definir as variáveis de ambiente
    const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
    const clientSecret = process.env.INSTAGRAM_APP_SECRET;
    const redirectUri = process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI;
    
    // Logs para depuração
    console.log("=== VARIÁVEIS DE AMBIENTE DEBUG (connect) ===");
    console.log(`NEXT_PUBLIC_INSTAGRAM_APP_ID: ${clientId}`);
    console.log(`INSTAGRAM_APP_SECRET: ${clientSecret ? "Configurado (valor oculto)" : "Não configurado"}`);
    console.log(`NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI: ${redirectUri}`);
    console.log("==========================================");

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        { error: "Configuração do Instagram incompleta" },
        { status: 500 }
      );
    }

    // Trocar o código de autorização por um token de acesso curto prazo
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
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Erro ao obter token do Instagram:", errorData);
      return NextResponse.json(
        { error: "Falha ao obter token de acesso do Instagram" },
        { status: 400 }
      );
    }

    const tokenRespText = await tokenResponse.text();
    // Corrige a resposta para que user_id seja uma string
    const fixedRespText = tokenRespText.replace(
      /"user_id":\s*(\d+)/,
      '"user_id":"$1"'
    );

    const tokenData = JSON.parse(fixedRespText) as {
      access_token: string;
      user_id: string;
    };

    if (!tokenData.access_token || !tokenData.user_id) {
      return NextResponse.json(
        { error: "Resposta de token inválida do Instagram" },
        { status: 400 }
      );
    }

    // Trocar por token de longa duração
    const exchangeUrl = new URL('https://graph.instagram.com/access_token');
    exchangeUrl.search = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: clientSecret,
      access_token: tokenData.access_token,
    }).toString();

    const longTokenResp = await fetch(exchangeUrl.toString());
    
    if (!longTokenResp.ok) {
      const errorText = await longTokenResp.text();
      console.error('Erro ao obter token longo prazo:', errorText);
      return NextResponse.json(
        { error: "Falha ao obter token de longa duração" },
        { status: 400 }
      );
    }
    
    const longTokenText = await longTokenResp.text();
    const longTokenData = JSON.parse(longTokenText) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };
    
    const longLivedToken = longTokenData.access_token;
    const expiresAt = Math.floor(Date.now() / 1000) + longTokenData.expires_in;

    // Obter informações do usuário do Instagram
    const userResponse = await fetch(
      `https://graph.instagram.com/me?fields=id,username,account_type,user_id&access_token=${longLivedToken}`
    );

    if (!userResponse.ok) {
      console.error("Erro ao obter informações do usuário do Instagram");
      return NextResponse.json(
        { error: "Falha ao obter informações do usuário do Instagram" },
        { status: 400 }
      );
    }

    const userData = await userResponse.json() as {
      id: string;
      username: string;
      account_type?: string;
      user_id?: string;
    };
    
    const { username } = userData;
    const igBusinessId = userData.user_id || null;

    // Verificar se já existe uma conta com este providerAccountId
    const existingAccount = await getPrismaInstance().account.findFirst({
      where: {
        provider: "instagram",
        providerAccountId: tokenData.user_id,
      },
    });

    let account;

    if (existingAccount) {
      // Verificar se pertence ao usuário atual
      if (existingAccount.userId !== session.user.id) {
        return NextResponse.json(
          { error: "Esta conta do Instagram já está conectada a outro usuário" },
          { status: 400 }
        );
      }
      
      // Atualizar a conta existente
      account = await getPrismaInstance().account.update({
        where: {
          id: existingAccount.id,
        },
        data: {
          access_token: longLivedToken,
          expires_at: expiresAt,
          token_type: longTokenData.token_type,
          igUsername: username,
          igUserId: igBusinessId,
          scope: "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish",
        },
      });
    } else {
      // Verificar se já existe alguma conta do Instagram para este usuário
      const existingAccounts = await getPrismaInstance().account.findMany({
        where: {
          userId: session.user.id,
          provider: "instagram",
        },
      });

      // Criar uma nova conta
      account = await getPrismaInstance().account.create({
        data: {
          userId: session.user.id,
          type: "oauth",
          provider: "instagram",
          providerAccountId: tokenData.user_id,
          access_token: longLivedToken,
          token_type: longTokenData.token_type,
          expires_at: expiresAt,
          igUsername: username,
          igUserId: igBusinessId,
          scope: "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish",
          isMain: existingAccounts.length === 0, // Primeira conta será a principal
        },
      });
    }

    return NextResponse.json({
      success: true,
      username: username,
      accountId: account.id,
      providerAccountId: tokenData.user_id,
    });
  } catch (error) {
    console.error("Erro ao conectar conta do Instagram:", error);
    return NextResponse.json(
      { error: "Ocorreu um erro ao conectar a conta do Instagram" },
      { status: 500 }
    );
  }
}
