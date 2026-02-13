// app/api/payment/webhook/route.ts

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance(); // Certifique-se de que essa importação esteja correta
import { cookies } from "next/headers";

// Usa uma chave dummy se STRIPE_SECRET_KEY não estiver definida
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "dummy_stripe_secret";
if (stripeSecretKey === "dummy_stripe_secret") {
  console.warn("WARNING: Using dummy Stripe secret key. Make sure to set STRIPE_SECRET_KEY in production!");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-02-24.acacia",
});

// Next.js 16: use exports individuais
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    // Obtém o corpo bruto da requisição
    const rawBody = await request.text();
    const sig = request.headers.get("stripe-signature");

    // Log para debug
    console.log("Webhook recebido - Headers:", JSON.stringify(Object.fromEntries(request.headers.entries())));
    console.log("Webhook signature:", sig);

    // Verifica se a variável de ambiente do webhook está definida
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("Missing STRIPE_WEBHOOK_SECRET environment variable");
      return NextResponse.json({ error: "Missing Stripe webhook secret" }, { status: 500 });
    }

    // Log para debug
    console.log("Webhook secret configurado:", webhookSecret.substring(0, 4) + "..." + webhookSecret.substring(webhookSecret.length - 4));

    if (!sig) {
      console.error("Stripe signature não encontrada no cabeçalho");
      return NextResponse.json({ error: "Stripe signature não encontrada" }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      // Tenta construir o evento com o corpo bruto e a assinatura
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error("Erro no webhook ao construir o evento:", err.message);

      // Log adicional para debug
      console.error("Detalhes do erro:", err);
      console.error("Primeiros 100 caracteres do corpo:", rawBody.substring(0, 100));

      return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    console.log("Evento recebido:", event.type);
    console.log("Dados do evento:", JSON.stringify(event.data.object));

    // Inicializa a resposta
    const response = NextResponse.json({ received: true });

    try {
      switch (event.type) {
        case "customer.subscription.created": {
          const subscription = event.data.object as Stripe.Subscription;
          console.log("Evento customer.subscription.created recebido para subscription id:", subscription.id);
          console.log("Metadata da assinatura:", subscription.metadata);

          const userId = subscription.metadata?.userId;
          if (!userId) {
            console.error("customer.subscription.created: userId not found in metadata para subscription:", subscription.id);
            break;
          }

          console.log("Criando ou atualizando assinatura para userId:", userId);
          await prisma.subscription.upsert({
            where: { stripeSubscriptionId: subscription.id },
            update: {
              status: mapStripeStatus(subscription.status),
              startDate: new Date(subscription.start_date * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
            },
            create: {
              userId,
              stripeSubscriptionId: subscription.id,
              stripeCustomerId: subscription.customer as string,
              status: mapStripeStatus(subscription.status),
              startDate: new Date(subscription.start_date * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
            },
          });
          console.log("Assinatura criada/atualizada com sucesso para subscription:", subscription.id);

          // Atualiza o cookie com base no status da assinatura
          updateSubscriptionCookie(response, mapStripeStatus(subscription.status));
          break;
        }
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          console.log("Evento customer.subscription.updated recebido para subscription id:", subscription.id);
          console.log("Metadata da assinatura:", subscription.metadata);

          const userId = subscription.metadata?.userId;
          if (!userId) {
            console.error("customer.subscription.updated: userId not found in metadata para subscription:", subscription.id);
            break;
          }

          console.log("Atualizando assinatura para userId:", userId);
          await prisma.subscription.upsert({
            where: { stripeSubscriptionId: subscription.id },
            update: {
              status: mapStripeStatus(subscription.status),
              startDate: new Date(subscription.start_date * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
            },
            create: {
              userId,
              stripeSubscriptionId: subscription.id,
              stripeCustomerId: subscription.customer as string,
              status: mapStripeStatus(subscription.status),
              startDate: new Date(subscription.start_date * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
            },
          });
          console.log("Assinatura atualizada com sucesso para subscription:", subscription.id);

          // Atualiza o cookie com base no status da assinatura
          updateSubscriptionCookie(response, mapStripeStatus(subscription.status));
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          console.log("Evento customer.subscription.deleted recebido para subscription id:", subscription.id);
          console.log("Metadata da assinatura:", subscription.metadata);

          const userId = subscription.metadata?.userId;
          if (!userId) {
            console.error("customer.subscription.deleted: userId not found in metadata para subscription:", subscription.id);
            break;
          }

          await prisma.subscription.update({
            where: { stripeSubscriptionId: subscription.id },
            data: {
              status: "CANCELED",
              canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : new Date(),
            },
          });
          console.log("Assinatura marcada como CANCELED com sucesso para subscription:", subscription.id);

          // Atualiza o cookie para indicar que a assinatura não está mais ativa
          updateSubscriptionCookie(response, "CANCELED");
          break;
        }
        case "invoice.paid": {
          const invoice = event.data.object as Stripe.Invoice;
          console.log("Evento invoice.paid recebido para invoice id:", invoice.id);
          if (!invoice.subscription) {
            console.error("invoice.paid: Nenhuma assinatura encontrada na fatura:", invoice.id);
            break;
          }
          const stripeSubscriptionId = typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription.id;
          const periodEnd = invoice.lines.data[0]?.period?.end;
          if (periodEnd) {
            console.log("Atualizando currentPeriodEnd para subscription:", stripeSubscriptionId);
            await prisma.subscription.update({
              where: { stripeSubscriptionId },
              data: {
                currentPeriodEnd: new Date(periodEnd * 1000),
                status: "ACTIVE",
              },
            });
            console.log("Subscription atualizada para ACTIVE com sucesso para subscription:", stripeSubscriptionId);

            // Atualiza o cookie para indicar que a assinatura está ativa
            updateSubscriptionCookie(response, "ACTIVE");
          }
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          console.log("Evento invoice.payment_failed recebido para invoice id:", invoice.id);
          if (!invoice.subscription) {
            console.error("invoice.payment_failed: Nenhuma assinatura encontrada na fatura:", invoice.id);
            break;
          }
          const stripeSubscriptionId = typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription.id;
          console.log("Atualizando subscription para PAST_DUE para subscription:", stripeSubscriptionId);
          await prisma.subscription.update({
            where: { stripeSubscriptionId },
            data: { status: "PAST_DUE" },
          });
          console.log("Subscription atualizada para PAST_DUE com sucesso para subscription:", stripeSubscriptionId);

          // Atualiza o cookie para indicar que a assinatura está com pagamento pendente
          updateSubscriptionCookie(response, "PAST_DUE");
          break;
        }
        default:
          console.log(`Evento não tratado: ${event.type}`);
      }
    } catch (error) {
      console.error("Erro ao processar o evento:", error);
      return NextResponse.json({ error: "Erro ao processar o evento" }, { status: 500 });
    }

    return response;
  } catch (error) {
    console.error("Erro geral no webhook:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}

// Função auxiliar para atualizar o cookie de assinatura
function updateSubscriptionCookie(
  response: NextResponse,
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" | "INCOMPLETE" | "INCOMPLETE_EXPIRED"
) {
  const hasActiveSubscription = status === "ACTIVE";

  response.cookies.set("subscription-active", hasActiveSubscription ? "true" : "false", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 horas
    path: "/",
  });

  console.log(`Cookie de assinatura atualizado: subscription-active=${hasActiveSubscription ? "true" : "false"}`);
}

function mapStripeStatus(
  status: string
): "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" | "INCOMPLETE" | "INCOMPLETE_EXPIRED" {
  switch (status) {
    case "trialing":
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    case "incomplete":
      return "INCOMPLETE";
    case "incomplete_expired":
      return "INCOMPLETE_EXPIRED";
    case "paused":
      return "CANCELED";
    default:
      return "UNPAID";
  }
}
