// app/api/instagram/webhook/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { instagramWebhookQueue } from "@/lib/queue/instagram-webhook.queue";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const VERIFY_TOKEN =
  process.env.IG_VERIFY_TOKEN ||
  "EAAIaqbt2rHgBO92NRTO2oMot3I8VPQGkJdnIMGVekpa5ebrdpSHfhqPytX0uih1kXLD5EZB0yHUHV5jHa1hryqrZAt8vWpZBpZCMnaLzuqGCjlKfX3mNoUSYbcnClC45md4NF5ZBKrkyZCiYLNtyeg9UgHZA7s4gafEWZCxZC0P9k4MY4Wh0jSiKpFuwVQy9crIZCW";

const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log(
      JSON.stringify({
        event: "verification_success",
        component: "Instagram Webhook",
        message: "Verificação bem-sucedida.",
      })
    );
    return new Response(challenge || "", { status: 200 });
  } else {
    console.warn(
      JSON.stringify({
        event: "verification_failure",
        component: "Instagram Webhook",
        message: "Falha na verificação do webhook.",
      })
    );
    return new NextResponse("Erro de verificação.", { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-hub-signature-256") || "";

    if (!verifySignature(body, signature)) {
      console.warn(
        JSON.stringify({
          event: "invalid_signature",
          component: "Instagram Webhook",
          message: "Assinatura inválida.",
        })
      );
      return new NextResponse("Assinatura inválida.", { status: 403 });
    }

    console.log(
      JSON.stringify({
        event: "webhook_received",
        component: "Instagram Webhook",
        dataType: "raw_body",
        body: body,
      })
    );

    const jsonBody = JSON.parse(body);

    console.log(
      JSON.stringify(
        {
          event: "webhook_received",
          component: "Instagram Webhook",
          dataType: "json_body",
          body: jsonBody,
        },
        null,
        2
      )
    );

    await instagramWebhookQueue.add("instagram-event", jsonBody, {
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error(
      JSON.stringify({
        event: "post_error",
        component: "Instagram Webhook",
        error: error.message,
      })
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function verifySignature(body: string, signature: string): boolean {
  if (!signature.startsWith("sha256=")) {
    return false;
  }

  const hash = crypto
    .createHmac("sha256", INSTAGRAM_APP_SECRET)
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(signature.slice(7))
  );
}
