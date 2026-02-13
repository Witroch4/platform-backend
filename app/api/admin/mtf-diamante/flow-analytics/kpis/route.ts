// Flow Analytics API - KPIs Endpoint
// Executive KPI metrics endpoint with Redis caching
// Requirements: 19.1, 20.1

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getRedisInstance } from '@/lib/connections';
import {
  parseFiltersFromURL,
  validateFilters,
  calculateExecutiveKPIs,
  handleUnauthorized,
  handleValidationError,
  handleDatabaseError,
  cachedSuccessResponse,
  withErrorHandling,
} from '@/lib/flow-analytics';

/**
 * GET /api/admin/mtf-diamante/flow-analytics/kpis
 * Calculate and return executive KPI metrics
 * 
 * Query Parameters:
 * - inboxId: Filter by inbox (optional)
 * - flowId: Filter by flow (optional)
 * - startDate: Start of date range (optional)
 * - endDate: End of date range (optional)
 * - campaign: Filter by campaign (optional)
 * - channelType: Filter by channel type (optional)
 * - status: Comma-separated status values (optional)
 * 
 * Response: ExecutiveKPIs
 * Cache: 30 seconds (Redis)
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return handleUnauthorized();
    }

    // Parse filters from query parameters
    const searchParams = request.nextUrl.searchParams;
    const filters = parseFiltersFromURL(searchParams);

    // Validate filters
    const validation = validateFilters(filters);
    if (!validation.valid) {
      return handleValidationError(validation.error!);
    }

    try {
      // Generate cache key from filters
      const cacheKey = `flow-analytics:kpis:${JSON.stringify(filters)}`;
      
      // Try to get from Redis cache
      const redis = getRedisInstance();
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        console.log('[KPI API] Cache hit for filters:', filters);
        return cachedSuccessResponse(JSON.parse(cached), 30);
      }

      console.log('[KPI API] Cache miss, calculating KPIs for filters:', filters);
      
      // Calculate KPIs
      const kpis = await calculateExecutiveKPIs(filters);

      // Store in Redis cache with 30-second TTL
      await redis.setex(cacheKey, 30, JSON.stringify(kpis));

      // Return cached response (30 seconds TTL)
      return cachedSuccessResponse(kpis, 30);
    } catch (error) {
      return handleDatabaseError(error);
    }
  });
}
