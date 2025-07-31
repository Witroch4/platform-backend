import { NextRequest } from "next/server";

/**
 * Temporary redirect for old webhook URL
 * This endpoint was moved to /api/admin/mtf-diamante/dialogflow/webhook
 */
export async function POST(request: NextRequest) {
  console.warn(
    "[DEPRECATED] Old webhook URL accessed: /api/admin/mtf-diamante/whatsapp/webhook"
  );
  console.warn(
    "[DEPRECATED] Please update to: /api/admin/mtf-diamante/dialogflow/webhook"
  );

  // Get the request body to forward it
  const body = await request.json();

  // Forward the request to the new endpoint
  const newUrl = new URL(
    "/api/admin/mtf-diamante/dialogflow/webhook",
    request.url
  );

  const response = await fetch(newUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(request.headers.entries()),
    },
    body: JSON.stringify(body),
  });

  return response;
}

export async function GET() {
  return new Response(
    JSON.stringify({
      error: "This endpoint has been moved",
      message: "Please use /api/admin/mtf-diamante/dialogflow/webhook instead",
      deprecated: true,
    }),
    {
      status: 301,
      headers: {
        "Content-Type": "application/json",
        Location: "/api/admin/mtf-diamante/dialogflow/webhook",
      },
    }
  );
}
