// lib/instagram-auth.ts
import { getPrismaInstance } from "@/lib/connections"

/**
 * Retorna o access_token da conta do Instagram
 * com base no igUserId (ex.: "17841468190323715").
 */
export async function getInstagramUserToken(igUserId: string): Promise<string | null> {
  try {
    console.log(`[getInstagramUserToken] Buscando token para igUserId=${igUserId}`);

    if (!igUserId) {
      console.error("[getInstagramUserToken] igUserId não fornecido");
      return null;
    }

    // Busca a conta mais recente com o igUserId fornecido
    const account = await getPrismaInstance().account.findFirst({
      where: {
        provider: "instagram",
        igUserId: igUserId,
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    if (!account) {
      console.error(`[getInstagramUserToken] Nenhuma conta encontrada para igUserId=${igUserId}`);
      return null;
    }

    if (!account.access_token) {
      console.error(`[getInstagramUserToken] Token não encontrado para conta id=${account.id}`);
      return null;
    }

    console.log(`[getInstagramUserToken] Token encontrado para conta id=${account.id}`);
    return account.access_token;
  } catch (error) {
    console.error("[getInstagramUserToken] Erro:", error);
    return null;
  }
}
