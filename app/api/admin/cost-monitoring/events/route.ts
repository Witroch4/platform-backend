import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrismaInstance } from '@/lib/connections';

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticação e autorização
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
    }

    if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Acesso negado. Apenas administradores podem visualizar custos." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    
    // Parâmetros de paginação
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100); // Máximo 100 por página
    const skip = (page - 1) * limit;

    // Parâmetros de filtro
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const provider = searchParams.get('provider');
    const product = searchParams.get('product');
    const status = searchParams.get('status');
    const inboxId = searchParams.get('inboxId');
    const userId = searchParams.get('userId');
    const intent = searchParams.get('intent');
    const sessionId = searchParams.get('sessionId');
    const traceId = searchParams.get('traceId');
    const externalId = searchParams.get('externalId');
    
    // Parâmetros de ordenação
    const sortBy = searchParams.get('sortBy') || 'ts';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Parâmetro de export
    const exportFormat = searchParams.get('export'); // csv, excel

    const prisma = getPrismaInstance();

    // Construir filtros
    const whereClause: any = {};

    // Filtros de data
    if (startDate) {
      whereClause.ts = { ...whereClause.ts, gte: new Date(startDate) };
    }
    if (endDate) {
      whereClause.ts = { ...whereClause.ts, lte: new Date(endDate) };
    }

    // Filtros específicos
    if (provider) {
      whereClause.provider = provider;
    }
    if (product) {
      whereClause.product = product;
    }
    if (status) {
      whereClause.status = status;
    }
    if (inboxId) {
      whereClause.inboxId = inboxId;
    }
    if (userId) {
      whereClause.userId = userId;
    }
    if (intent) {
      whereClause.intent = { contains: intent, mode: 'insensitive' };
    }
    if (sessionId) {
      whereClause.sessionId = sessionId;
    }
    if (traceId) {
      whereClause.traceId = traceId;
    }
    if (externalId) {
      whereClause.externalId = externalId;
    }

    // Definir ordenação
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    // Se for export, buscar todos os dados (com limite de segurança)
    const isExport = exportFormat === 'csv' || exportFormat === 'excel';
    const queryLimit = isExport ? 10000 : limit; // Limite de 10k para exports
    const querySkip = isExport ? 0 : skip;

    // Buscar eventos e contagem total em paralelo
    const [events, totalCount] = await Promise.all([
      prisma.costEvent.findMany({
        where: whereClause,
        orderBy,
        take: queryLimit,
        skip: querySkip,
        select: {
          id: true,
          ts: true,
          traceId: true,
          externalId: true,
          provider: true,
          product: true,
          unit: true,
          units: true,
          currency: true,
          unitPrice: true,
          cost: true,
          status: true,
          sessionId: true,
          inboxId: true,
          userId: true,
          intent: true,
          raw: true
        }
      }),
      
      prisma.costEvent.count({
        where: whereClause
      })
    ]);

    // Formatar eventos
    const formattedEvents = events.map(event => ({
      id: event.id,
      timestamp: event.ts,
      traceId: event.traceId,
      externalId: event.externalId,
      provider: event.provider,
      product: event.product,
      unit: event.unit,
      units: Number(event.units),
      currency: event.currency,
      unitPrice: event.unitPrice ? Number(event.unitPrice) : null,
      cost: event.cost ? Number(event.cost) : null,
      status: event.status,
      sessionId: event.sessionId,
      inboxId: event.inboxId,
      userId: event.userId,
      intent: event.intent,
      metadata: event.raw
    }));

    // Se for export, gerar arquivo
    if (isExport) {
      if (exportFormat === 'csv') {
        return generateCSVResponse(formattedEvents);
      } else if (exportFormat === 'excel') {
        return generateExcelResponse(formattedEvents);
      }
    }

    // Calcular metadados de paginação
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Buscar estatísticas dos filtros aplicados
    const [costStats, statusBreakdown] = await Promise.all([
      prisma.costEvent.aggregate({
        where: whereClause,
        _sum: { cost: true },
        _avg: { cost: true },
        _min: { cost: true },
        _max: { cost: true },
        _count: true
      }),
      
      prisma.costEvent.groupBy({
        by: ['status'],
        where: whereClause,
        _count: true
      })
    ]);

    const response = {
      events: formattedEvents,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage,
        hasPrevPage
      },
      filters: {
        startDate,
        endDate,
        provider,
        product,
        status,
        inboxId,
        userId,
        intent,
        sessionId,
        traceId,
        externalId,
        sortBy,
        sortOrder
      },
      stats: {
        totalCost: Number(costStats._sum.cost || 0),
        averageCost: Number(costStats._avg.cost || 0),
        minCost: Number(costStats._min.cost || 0),
        maxCost: Number(costStats._max.cost || 0),
        totalEvents: costStats._count,
        statusBreakdown: statusBreakdown.map(item => ({
          status: item.status,
          count: item._count
        })),
        currency: "USD"
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        exportAvailable: true,
        supportedExports: ['csv', 'excel']
      }
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Erro ao buscar eventos de custo:', error);
    return NextResponse.json(
      { error: "Erro interno do servidor ao buscar eventos de custo." },
      { status: 500 }
    );
  }
}

// Função para gerar resposta CSV
function generateCSVResponse(events: any[]) {
  const headers = [
    'ID',
    'Timestamp',
    'Provider',
    'Product',
    'Unit',
    'Units',
    'Unit Price',
    'Cost',
    'Currency',
    'Status',
    'Inbox ID',
    'User ID',
    'Session ID',
    'Trace ID',
    'External ID',
    'Intent'
  ];

  const csvRows = [
    headers.join(','),
    ...events.map(event => [
      event.id,
      event.timestamp,
      event.provider,
      event.product,
      event.unit,
      event.units,
      event.unitPrice || '',
      event.cost || '',
      event.currency,
      event.status,
      event.inboxId || '',
      event.userId || '',
      event.sessionId || '',
      event.traceId || '',
      event.externalId || '',
      event.intent || ''
    ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
  ];

  const csvContent = csvRows.join('\n');
  const filename = `cost-events-${new Date().toISOString().split('T')[0]}.csv`;

  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache'
    }
  });
}

// Função para gerar resposta Excel (formato CSV com extensão .xlsx para simplicidade)
function generateExcelResponse(events: any[]) {
  const headers = [
    'ID',
    'Timestamp',
    'Provider',
    'Product',
    'Unit',
    'Units',
    'Unit Price',
    'Cost',
    'Currency',
    'Status',
    'Inbox ID',
    'User ID',
    'Session ID',
    'Trace ID',
    'External ID',
    'Intent'
  ];

  // Para simplicidade, vamos gerar um CSV com extensão .xlsx
  // Em uma implementação completa, usaríamos uma biblioteca como xlsx
  const csvRows = [
    headers.join('\t'), // Usar tab para melhor compatibilidade com Excel
    ...events.map(event => [
      event.id,
      event.timestamp,
      event.provider,
      event.product,
      event.unit,
      event.units,
      event.unitPrice || '',
      event.cost || '',
      event.currency,
      event.status,
      event.inboxId || '',
      event.userId || '',
      event.sessionId || '',
      event.traceId || '',
      event.externalId || '',
      event.intent || ''
    ].join('\t'))
  ];

  const content = csvRows.join('\n');
  const filename = `cost-events-${new Date().toISOString().split('T')[0]}.xlsx`;

  return new Response(content, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache'
    }
  });
}