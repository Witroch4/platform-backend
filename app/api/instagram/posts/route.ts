import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
    }

    // Pegar o providerAccountId e after (token de paginação) da URL
    const { searchParams } = new URL(request.url);
    const providerAccountId = searchParams.get("providerAccountId");
    const after = searchParams.get("after") || null;

    if (!providerAccountId) {
      return NextResponse.json(
        { error: "providerAccountId é obrigatório." },
        { status: 400 }
      );
    }

    // Buscar a conta usando o providerAccountId
    const account = await prisma.account.findFirst({
      where: {
        providerAccountId: providerAccountId,
        userId: session.user.id,
        provider: "instagram",
      },
      select: {
        id: true,
        access_token: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Conta não encontrada ou não pertence ao usuário." },
        { status: 404 }
      );
    }

    if (!account.access_token) {
      return NextResponse.json(
        { error: "Token de acesso não encontrado para esta conta." },
        { status: 400 }
      );
    }

    // Buscar dados do usuário do Instagram
    const userRes = await fetch(
      `https://graph.instagram.com/me?fields=id,username,media_count,profile_picture_url&access_token=${account.access_token}`
    );

    if (!userRes.ok) {
      const errorText = await userRes.text();
      console.error("Erro ao buscar dados do Instagram (usuário):", errorText);
      return NextResponse.json(
        { error: "Não foi possível obter os dados do Instagram do usuário." },
        { status: 500 }
      );
    }

    const userData = await userRes.json();

    // Buscar posts do Instagram com paginação
    let mediaUrl = `https://graph.instagram.com/me/media?fields=id,caption,media_url,media_type,thumbnail_url,media_product_type,like_count,comments_count&limit=25&access_token=${account.access_token}`;

    // Adicionar token de paginação se existir
    if (after) {
      mediaUrl += `&after=${after}`;
    }

    const mediaRes = await fetch(mediaUrl);

    if (!mediaRes.ok) {
      const errorText = await mediaRes.text();
      console.error("Erro ao buscar mídias do Instagram:", errorText);
      return NextResponse.json(
        { error: "Não foi possível obter as mídias do Instagram." },
        { status: 500 }
      );
    }

    const mediaData = await mediaRes.json();

    return NextResponse.json({
      user: userData,
      media: mediaData.data || [],
      paging: mediaData.paging || null
    });
  } catch (error: any) {
    console.error("[GET /api/instagram/posts] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados do Instagram." },
      { status: 500 }
    );
  }
}