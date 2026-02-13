// Flow Analytics API - Base Route
// Base endpoint for flow analytics system

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { handleUnauthorized, successResponse } from '@/lib/flow-analytics';

/**
 * GET /api/admin/mtf-diamante/flow-analytics
 * Returns information about available analytics endpoints
 */
export async function GET(request: NextRequest) {
  // Check authentication
  const session = await auth();
  if (!session?.user?.id) {
    return handleUnauthorized();
  }

  const baseUrl = '/api/admin/mtf-diamante/flow-analytics';

  return successResponse({
    message: 'Flow Analytics API',
    version: '1.0.0',
    endpoints: [
      {
        path: `${baseUrl}/kpis`,
        method: 'GET',
        description: 'Executive KPI metrics',
        params: ['inboxId?', 'flowId?', 'startDate?', 'endDate?'],
      },
      {
        path: `${baseUrl}/heatmap`,
        method: 'GET',
        description: 'Node visit counts and metrics',
        params: ['flowId (required)', 'startDate?', 'endDate?'],
      },
      {
        path: `${baseUrl}/funnel`,
        method: 'GET',
        description: 'Conversion funnel data',
        params: ['flowId (required)', 'startDate?', 'endDate?'],
      },
      {
        path: `${baseUrl}/paths`,
        method: 'GET',
        description: 'Path analysis and comparison',
        params: ['flowId (required)', 'minSessions?', 'startDate?', 'endDate?'],
      },
      {
        path: `${baseUrl}/sessions/:sessionId`,
        method: 'GET',
        description: 'Session replay timeline',
        params: ['sessionId (in path)'],
      },
      {
        path: `${baseUrl}/alerts`,
        method: 'GET',
        description: 'Quality alerts',
        params: ['flowId?', 'inboxId?', 'severity?'],
      },
      {
        path: `${baseUrl}/temporal`,
        method: 'GET',
        description: 'Time-based analysis',
        params: ['dimension (required)', 'flowId?', 'inboxId?', 'startDate?', 'endDate?'],
      },
      {
        path: `${baseUrl}/node-metrics`,
        method: 'GET',
        description: 'Node type performance metrics',
        params: ['flowId (required)', 'nodeType?', 'startDate?', 'endDate?'],
      },
      {
        path: `${baseUrl}/export`,
        method: 'POST',
        description: 'Data export',
        params: ['dataType (in body)', 'format (in body)', 'filters (in body)'],
      },
    ],
  });
}
