// Lazy import to avoid Edge Runtime issues
const getSseManager = () => import('@/lib/sse-manager').then(m => m.sseManager);
import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('leadId');
  const action = searchParams.get('action');
  
  // Endpoint para verificar status das conexões (retorna JSON)
  if (action === 'status') {
    const sseManager = await getSseManager();
    const status = sseManager.getStatus();
    console.log(`[SSE API] 📊 Status solicitado:`, status);
    
    return NextResponse.json(status);
  }
  
  // Endpoint para verificar conexões ativas de um lead específico (retorna JSON)
  if (action === 'check' && leadId) {
    const sseManager = await getSseManager();
    const activeConnections = sseManager.getConnectionsForLead(leadId);
    console.log(`[SSE API] 🔍 Verificação de conexões para ${leadId}: ${activeConnections} ativas`);
    
    return NextResponse.json({
      leadId,
      hasActiveConnections: activeConnections > 0,
      connectionCount: activeConnections,
      totalConnections: sseManager.getConnectionsCount()
    });
  }

  // Para SSE, sempre retornar stream mesmo se leadId estiver ausente
  console.log(`[SSE API] 🌊 Iniciando stream SSE para leadId: ${leadId || 'undefined'}`);

  let connectionId: string = '';

  const stream = new ReadableStream({
    async start(controller) {
      if (!leadId) {
        // Enviar erro via SSE em vez de retornar JSON
        console.log(`[SSE API] ❌ leadId não fornecido, enviando erro via SSE`);
        controller.enqueue(`data: ${JSON.stringify({
          type: 'error',
          message: 'leadId é obrigatório',
          timestamp: new Date().toISOString()
        })}\n\n`);
        controller.close();
        return;
      }

      // Adicionar conexão ao manager
      const sseManager = await getSseManager();
      connectionId = await Promise.resolve(sseManager.addConnection(leadId, controller));
      
      console.log(`[SSE API] ✅ Stream iniciado para leadId: ${leadId}, connectionId: ${connectionId}`);
      
      // Enviar evento inicial de conexão
      controller.enqueue(`data: ${JSON.stringify({
        type: 'connected',
        message: 'Conexão SSE estabelecida com sucesso',
        leadId: leadId,
        connectionId: connectionId,
        timestamp: new Date().toISOString()
      })}\n\n`);
    },
    async cancel() {
      console.log(`[SSE API] 🔌 Stream cancelado pelo cliente para leadId: ${leadId}, connectionId: ${connectionId}`);
      
      // Remover conexão do manager usando a nova assinatura
      if (leadId && connectionId) {
        const sseManager = await getSseManager();
        sseManager.removeConnection(leadId, connectionId);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// Endpoint POST para enviar notificações via HTTP
export async function POST(request: NextRequest) {
  try {
    const { leadId, data } = await request.json();
    
    if (!leadId || !data) {
      return NextResponse.json({ error: 'leadId e data são obrigatórios' }, { status: 400 });
    }
    
    console.log(`[SSE API] 📤 Enviando notificação via HTTP para ${leadId}:`, data);
    
    const sseManager = await getSseManager();
    const sent = await sseManager.sendNotification(leadId, data);
    
    return NextResponse.json({
      success: sent,
      leadId,
      notificationsSent: sent ? 1 : 0,
      message: sent ? 'Notificação enviada com sucesso' : 'Erro ao enviar notificação ou nenhuma conexão ativa'
    });
    
  } catch (error: any) {
    console.error('[SSE API] ❌ Erro ao enviar notificação via HTTP:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 