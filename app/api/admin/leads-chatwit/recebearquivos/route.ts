// app/api/admin/leads-chatwit/recebearquivos/route.ts
import { NextResponse } from 'next/server';
import { addLeadJob } from '@/lib/queue/leads-chatwit.queue';
import { WebhookPayload } from '@/types/webhook';

export async function POST(request: Request): Promise<Response> {
  try {
    const payloadRaw = await request.json();

    // se vier array, pega o primeiro objeto
    const payload: WebhookPayload = Array.isArray(payloadRaw)
      ? payloadRaw[0]
      : payloadRaw;

    // validações mínimas
    if (!payload?.origemLead?.source_id) {
      return NextResponse.json(
        { success: false, error: 'source_id ausente' },
        { status: 400 }
      );
    }

    // validação do token de acesso (obrigatório) - agora busca dentro do campo usuario
    if (!payload?.usuario?.CHATWIT_ACCESS_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'CHATWIT_ACCESS_TOKEN ausente no campo usuario' },
        { status: 400 }
      );
    }

    console.log(`[Webhook] Recebido lead para token: ${payload.usuario.CHATWIT_ACCESS_TOKEN}`);

    // empurra pra fila e responde na hora
    await addLeadJob({ payload });

    return NextResponse.json(
      { success: true, queued: true },
      { status: 202 }            // Accepted – processamento assíncrono
    );
  } catch (err: any) {
    console.error('[Webhook] erro ao enfileirar:', err);
    return NextResponse.json(
      { success: false, error: 'erro interno' },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { status: 'Webhook operante e enfileirando' },
    { status: 200 }
  );
}
