import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload, phoneNumber } = await request.json();

    if (!payload) {
      return NextResponse.json(
        { error: "Payload é obrigatório" },
        { status: 400 }
      );
    }

    console.log(`[Webhook Test] Enviando teste de webhook para ${phoneNumber}`, {
      userId: session.user.id,
      userEmail: session.user.email,
      timestamp: new Date().toISOString(),
      payloadSize: JSON.stringify(payload).length,
    });

    // Atualizar o payload com o número de telefone fornecido
    const updatedPayload = {
      ...payload,
      originalDetectIntentRequest: {
        ...payload.originalDetectIntentRequest,
        payload: {
          ...payload.originalDetectIntentRequest.payload,
          contact_phone: phoneNumber,
          contact_source: phoneNumber.replace("+", "")
        }
      },
      session: `projects/msjudicialoab-rxtd/agent/sessions/${phoneNumber.replace("+", "")}`
    };

    // Fazer a requisição para o webhook real
    const webhookUrl = `${request.headers.get('origin')}/api/admin/mtf-diamante/dialogflow/webhook`;
    
    console.log(`[Webhook Test] Enviando para: ${webhookUrl}`);
    
    const startTime = Date.now();
    
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "WebhookTest/1.0",
        "X-Test-Request": "true",
        "X-Test-User": session.user.id || "unknown",
      },
      body: JSON.stringify(updatedPayload),
    });

    const responseTime = Date.now() - startTime;
    const responseData = await webhookResponse.json();

    console.log(`[Webhook Test] Resposta recebida em ${responseTime}ms`, {
      status: webhookResponse.status,
      statusText: webhookResponse.statusText,
      responseTime,
      correlationId: responseData.correlationId,
      processingMode: responseData.processingMode,
    });

    // Extrair headers importantes
    const importantHeaders: Record<string, string> = {};
    webhookResponse.headers.forEach((value, key) => {
      if (key.startsWith('x-') || key === 'content-type') {
        importantHeaders[key] = value;
      }
    });

    return NextResponse.json({
      success: true,
      webhook: {
        status: webhookResponse.status,
        statusText: webhookResponse.statusText,
        headers: importantHeaders,
        data: responseData,
        responseTime,
      },
      test: {
        timestamp: new Date().toISOString(),
        phoneNumber,
        payloadType: payload.originalDetectIntentRequest?.payload?.interaction_type || "unknown",
        intentName: payload.queryResult?.intent?.displayName || "unknown",
        buttonId: payload.originalDetectIntentRequest?.payload?.button_id,
        userId: session.user.id,
      },
    });

  } catch (error) {
    console.error("[Webhook Test] Erro ao enviar teste:", error);
    
    return NextResponse.json(
      { 
        error: "Erro interno do servidor",
        details: error instanceof Error ? error.message : "Erro desconhecido"
      },
      { status: 500 }
    );
  }
}