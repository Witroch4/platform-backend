// Filter Utilities for Flow Analytics
// Shared utilities for parsing filters and building database queries

import type { DashboardFilters } from '@/types/flow-analytics';
import type { Prisma } from '@prisma/client';

/**
 * Parse filters from URL search params
 */
export function parseFiltersFromURL(searchParams: URLSearchParams): DashboardFilters {
  const filters: DashboardFilters = {};

  // Parse inboxId
  const inboxId = searchParams.get('inboxId');
  if (inboxId) {
    filters.inboxId = inboxId;
  }

  // Parse flowId
  const flowId = searchParams.get('flowId');
  if (flowId) {
    filters.flowId = flowId;
  }

  // Parse date range
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const preset = searchParams.get('preset') as 'today' | 'last_7_days' | 'last_30_days' | 'custom' | null;

  if (startDate && endDate) {
    filters.dateRange = {
      start: new Date(startDate),
      end: new Date(endDate),
      preset: preset || 'custom',
    };
  }

  // Parse campaign
  const campaign = searchParams.get('campaign');
  if (campaign) {
    filters.campaign = campaign;
  }

  // Parse channelType
  const channelType = searchParams.get('channelType');
  if (channelType && ['whatsapp', 'instagram', 'facebook'].includes(channelType)) {
    filters.channelType = channelType as 'whatsapp' | 'instagram' | 'facebook';
  }

  // Parse status (comma-separated)
  const status = searchParams.get('status');
  if (status) {
    filters.status = status.split(',').filter(Boolean);
  }

  // Parse userTag
  const userTag = searchParams.get('userTag');
  if (userTag) {
    filters.userTag = userTag;
  }

  return filters;
}

/**
 * Serialize filters to URL search params
 */
export function serializeFiltersToURL(filters: DashboardFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.inboxId) {
    params.append('inboxId', filters.inboxId);
  }

  if (filters.flowId) {
    params.append('flowId', filters.flowId);
  }

  if (filters.dateRange) {
    params.append('startDate', filters.dateRange.start.toISOString());
    params.append('endDate', filters.dateRange.end.toISOString());
    if (filters.dateRange.preset) {
      params.append('preset', filters.dateRange.preset);
    }
  }

  if (filters.campaign) {
    params.append('campaign', filters.campaign);
  }

  if (filters.channelType) {
    params.append('channelType', filters.channelType);
  }

  if (filters.status && filters.status.length > 0) {
    params.append('status', filters.status.join(','));
  }

  if (filters.userTag) {
    params.append('userTag', filters.userTag);
  }

  return params;
}

/**
 * Build Prisma where clause from dashboard filters
 */
export function buildWhereClause(filters: DashboardFilters): any {
  const where: any = {};

  // Filter by inboxId
  if (filters.inboxId) {
    where.inboxId = filters.inboxId;
  }

  // Filter by flowId
  if (filters.flowId) {
    where.flowId = filters.flowId;
  }

  // Filter by date range
  if (filters.dateRange) {
    where.createdAt = {
      gte: filters.dateRange.start,
      lte: filters.dateRange.end,
    };
  }

  // Filter by status
  if (filters.status && filters.status.length > 0) {
    where.status = {
      in: filters.status,
    };
  }

  // Note: campaign, channelType, and userTag would require additional
  // fields in the FlowSession model or joins with other tables
  // For now, we'll skip these filters in the where clause

  return where;
}

/**
 * Validate dashboard filters
 */
export function validateFilters(filters: DashboardFilters): { valid: boolean; error?: string } {
  // Validate date range
  if (filters.dateRange) {
    const { start, end } = filters.dateRange;

    // Check if dates are valid
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { valid: false, error: 'Datas inválidas fornecidas' };
    }

    // Check if start is before end
    if (start > end) {
      return { valid: false, error: 'Data inicial deve ser anterior à data final' };
    }

    // Check if dates are not in the future
    const now = new Date();
    if (start > now || end > now) {
      return { valid: false, error: 'Datas não podem estar no futuro' };
    }

    // Check if date range is not too large (e.g., max 1 year)
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > oneYear) {
      return { valid: false, error: 'Período máximo permitido é de 1 ano' };
    }
  }

  // Validate status values
  if (filters.status && filters.status.length > 0) {
    const validStatuses = ['ACTIVE', 'WAITING_INPUT', 'COMPLETED', 'ERROR'];
    const invalidStatuses = filters.status.filter(s => !validStatuses.includes(s));
    if (invalidStatuses.length > 0) {
      return { valid: false, error: `Status inválidos: ${invalidStatuses.join(', ')}` };
    }
  }

  return { valid: true };
}

/**
 * Get default date range (last 7 days)
 */
export function getDefaultDateRange(): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);

  return { start, end };
}

/**
 * Get date range from preset
 */
export function getDateRangeFromPreset(preset: 'today' | 'last_7_days' | 'last_30_days'): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'last_7_days':
      start.setDate(start.getDate() - 7);
      break;
    case 'last_30_days':
      start.setDate(start.getDate() - 30);
      break;
  }

  return { start, end };
}
