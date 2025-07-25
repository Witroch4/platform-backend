"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInstagramUserToken = getInstagramUserToken;
// lib/instagram-auth.ts
const prisma_1 = require("../lib/prisma");
/**
 * Retorna o access_token da conta do Instagram
 * com base no igUserId (ex.: "17841468190323715").
 */
async function getInstagramUserToken(igUserId) {
    try {
        console.log(`[getInstagramUserToken] Buscando token para igUserId=${igUserId}`);
        if (!igUserId) {
            console.error("[getInstagramUserToken] igUserId não fornecido");
            return null;
        }
        // Busca a conta mais recente com o igUserId fornecido
        const account = await prisma_1.prisma.account.findFirst({
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
    }
    catch (error) {
        console.error("[getInstagramUserToken] Erro:", error);
        return null;
    }
}
