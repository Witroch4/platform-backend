/**
 * Intent catalog validation utilities for SocialWise Flow
 * Validates that intent payloads reference existing intents in the system
 */

import { getPrismaInstance } from '@/lib/connections';

/**
 * Cache for intent existence checks to avoid repeated database queries
 */
const intentExistenceCache = new Map<string, { exists: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Extracts intent slug from payload format (@intent_name -> intent_name)
 */
export function extractIntentSlug(payload: string): string | null {
  if (!payload || typeof payload !== 'string') return null;
  
  // Remove @ prefix if present
  const slug = payload.startsWith('@') ? payload.slice(1) : payload;
  
  // Validate slug format (only lowercase letters, numbers, underscores)
  if (!/^[a-z0-9_]+$/.test(slug)) return null;
  
  return slug;
}

/**
 * Checks if an intent exists in the catalog for a specific agent/inbox
 * Uses caching to avoid repeated database queries
 */
export async function checkIntentExists(
  intentSlug: string,
  agentId?: string,
  inboxId?: string
): Promise<boolean> {
  if (!intentSlug) return false;
  
  // Create cache key including context
  const cacheKey = `${intentSlug}:${agentId || 'global'}:${inboxId || 'global'}`;
  
  // Check cache first
  const cached = intentExistenceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.exists;
  }
  
  try {
    // Query database for intent existence
    // This is a simplified check - in a real implementation, you'd query your intent catalog
    // For now, we'll check if it matches common legal intent patterns
    const exists = await checkIntentInDatabase(intentSlug, agentId, inboxId);
    
    // Cache the result
    intentExistenceCache.set(cacheKey, {
      exists,
      timestamp: Date.now()
    });
    
    return exists;
  } catch (error) {
    console.error('Error checking intent existence:', error);
    return false;
  }
}

/**
 * Database query to check if intent exists
 * This would be replaced with actual intent catalog queries
 */
async function checkIntentInDatabase(
  intentSlug: string,
  agentId?: string,
  inboxId?: string
): Promise<boolean> {
  // For now, we'll use a simple pattern-based validation
  // In a real implementation, this would query your intent catalog table
  // const prisma = getPrismaInstance(); // Uncomment when needed for real DB queries
  
  // Common legal intent patterns that should exist
  const commonLegalIntents = [
    'mandado_seguranca',
    'recurso_multa_transito',
    'acao_trabalhista',
    'divorcio_consensual',
    'inventario',
    'usucapiao',
    'acao_despejo',
    'revisao_beneficio_inss',
    'acao_indenizacao',
    'contratos_gerais',
    'direito_consumidor',
    'direito_familia',
    'direito_trabalhista',
    'direito_previdenciario',
    'direito_civil',
    'direito_criminal',
    'consultoria_juridica',
    'segunda_via_documentos',
    'agendamento_consulta',
    'informacoes_processo'
  ];
  
  // Check if it's a known legal intent
  if (commonLegalIntents.includes(intentSlug)) {
    return true;
  }
  
  // Check if it follows valid intent naming patterns
  const validPatterns = [
    /^acao_[a-z_]+$/,           // acao_* patterns
    /^recurso_[a-z_]+$/,        // recurso_* patterns
    /^consulta_[a-z_]+$/,       // consulta_* patterns
    /^agendamento_[a-z_]+$/,    // agendamento_* patterns
    /^informacao_[a-z_]+$/,     // informacao_* patterns
    /^direito_[a-z_]+$/,        // direito_* patterns
    /^servico_[a-z_]+$/         // servico_* patterns
  ];
  
  return validPatterns.some(pattern => pattern.test(intentSlug));
}

/**
 * Validates multiple intent payloads at once
 */
export async function validateIntentPayloads(
  payloads: string[],
  agentId?: string,
  inboxId?: string
): Promise<{
  valid: string[];
  invalid: string[];
  details: Record<string, { exists: boolean; validFormat: boolean }>;
}> {
  const valid: string[] = [];
  const invalid: string[] = [];
  const details: Record<string, { exists: boolean; validFormat: boolean }> = {};
  
  for (const payload of payloads) {
    const slug = extractIntentSlug(payload);
    const validFormat = slug !== null;
    const exists = validFormat ? await checkIntentExists(slug, agentId, inboxId) : false;
    
    details[payload] = { exists, validFormat };
    
    if (validFormat && exists) {
      valid.push(payload);
    } else {
      invalid.push(payload);
    }
  }
  
  return { valid, invalid, details };
}

/**
 * Clears the intent existence cache
 * Useful when intents are added/removed from the catalog
 */
export function clearIntentCache(): void {
  intentExistenceCache.clear();
}

/**
 * Gets cache statistics for monitoring
 */
export function getIntentCacheStats(): {
  size: number;
  hitRate: number;
  oldestEntry: number;
} {
  const now = Date.now();
  let oldestTimestamp = now;
  
  for (const [, value] of intentExistenceCache) {
    if (value.timestamp < oldestTimestamp) {
      oldestTimestamp = value.timestamp;
    }
  }
  
  return {
    size: intentExistenceCache.size,
    hitRate: 0, // Would need to track hits/misses to calculate this
    oldestEntry: now - oldestTimestamp
  };
}