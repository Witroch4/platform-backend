import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { getPrismaInstance } from "./lib/connections.js";

// Cliente para o banco de origem (faceApp)
// Em faceApp a tabela é "Account" (singular, com A maiúsculo)
const source = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_FACEAPP } }
});

// Cliente para o banco de destino (faceAppdev)
// Aqui, o modelo Account está mapeado para "accounts"
const target = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_FACEAPPDEV } }
});

// Função para limpar os dados do banco FACEAPPDEV (ordem: Subscription -> Account -> User)
async function clearTargetDatabase() {
  await target.subscription.deleteMany();
  await target.account.deleteMany();
  await target.user.deleteMany();
  console.log("Banco FACEAPPDEV limpo com sucesso!");
}

async function copyData() {
  try {
    // Limpa o banco de destino
    await clearTargetDatabase();

    // Copiar dados da tabela User
    const users = await source.user.findMany();
    for (const user of users) {
      await target.user.create({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          role: user.role,
          password: user.password,
          isTwoFactorAuthEnabled: user.isTwoFactorAuthEnabled,
          twoFactorAuthVerified: user.twoFactorAuthVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          isNew: user.isNew,
        }
      });
    }
    console.log("Tabela User copiada com sucesso!");

    // Copiar dados da tabela Account
    // No banco de origem, a tabela se chama "Account"
    const accounts = await source.$queryRaw`SELECT * FROM "Account"`;
    for (const account of accounts) {
      await target.account.create({
        data: {
          id: account.id,
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          refresh_token: account.refresh_token,
          access_token: account.access_token,
          expires_at: account.expires_at,
          token_type: account.token_type,
          scope: account.scope,
          id_token: account.id_token,
          session_state: account.session_state,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
          igUserId: account.igUserId,
          igUsername: account.igUsername,
          isMain: account.isMain,
        }
      });
    }
    console.log("Tabela Account copiada com sucesso!");

    // Copiar dados da tabela Subscription
    const subscriptions = await source.subscription.findMany();
    for (const subscription of subscriptions) {
      await target.subscription.create({
        data: {
          id: subscription.id,
          userId: subscription.userId,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          stripeCustomerId: subscription.stripeCustomerId,
          status: subscription.status,
          startDate: subscription.startDate,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          canceledAt: subscription.canceledAt,
          createdAt: subscription.createdAt,
          updatedAt: subscription.updatedAt,
        }
      });
    }
    console.log("Tabela Subscription copiada com sucesso!");

    console.log("Dados copiados com sucesso!");
  } catch (error) {
    console.error("Erro ao copiar dados:", error);
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

copyData();
