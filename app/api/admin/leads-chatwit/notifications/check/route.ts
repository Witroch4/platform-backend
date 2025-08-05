import { type NextRequest, NextResponse } from 'next/server';
// Lazy import to avoid Edge Runtime issues
const getSseManager = () => import('@/lib/sse-manager').then(m => m.sseManager);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('leadId');
  
  if (!leadId) {
    return NextResponse.json({ error: 'leadId é obrigatório' }, { status: 400 });
  }
  
  const sseManager = await getSseManager();
  const activeConnections = sseManager.getConnectionsForLead(leadId);
  console.log(`[SSE Check] Verificação de conexões para ${leadId}: ${activeConnections} ativas`);
  
  return NextResponse.json({
    leadId,
    hasActiveConnections: activeConnections > 0,
    connectionCount: activeConnections,
    totalConnections: sseManager.getConnectionsCount()
  });
} 