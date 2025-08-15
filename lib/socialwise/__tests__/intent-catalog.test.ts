/**
 * Unit tests for SocialWise intent catalog validation utilities
 */

import {
  extractIntentSlug,
  checkIntentExists,
  validateIntentPayloads,
  clearIntentCache,
  getIntentCacheStats
} from '../intent-catalog';

// Mock the database connection
jest.mock('@/lib/connections', () => ({
  prisma: {}
}));

describe('extractIntentSlug', () => {
  test('should extract slug from valid payload', () => {
    expect(extractIntentSlug('@valid_intent')).toBe('valid_intent');
    expect(extractIntentSlug('@simple')).toBe('simple');
    expect(extractIntentSlug('@intent_123')).toBe('intent_123');
    expect(extractIntentSlug('@test_intent_with_underscores')).toBe('test_intent_with_underscores');
  });

  test('should handle payload without @ prefix', () => {
    expect(extractIntentSlug('valid_intent')).toBe('valid_intent');
    expect(extractIntentSlug('simple')).toBe('simple');
  });

  test('should return null for invalid formats', () => {
    expect(extractIntentSlug('')).toBeNull();
    expect(extractIntentSlug('@Invalid')).toBeNull(); // Uppercase
    expect(extractIntentSlug('@invalid-intent')).toBeNull(); // Hyphen
    expect(extractIntentSlug('@invalid intent')).toBeNull(); // Space
    expect(extractIntentSlug('@invalid.intent')).toBeNull(); // Dot
    expect(extractIntentSlug('@@invalid')).toBeNull(); // Double @
    expect(extractIntentSlug(null as any)).toBeNull();
    expect(extractIntentSlug(undefined as any)).toBeNull();
  });

  test('should handle special characters correctly', () => {
    expect(extractIntentSlug('@intent!')).toBeNull();
    expect(extractIntentSlug('@intent@')).toBeNull();
    expect(extractIntentSlug('@intent#')).toBeNull();
    expect(extractIntentSlug('@intent$')).toBeNull();
  });
});

describe('checkIntentExists', () => {
  beforeEach(() => {
    clearIntentCache();
  });

  test('should return false for empty slug', async () => {
    expect(await checkIntentExists('')).toBe(false);
    expect(await checkIntentExists(null as any)).toBe(false);
    expect(await checkIntentExists(undefined as any)).toBe(false);
  });

  test('should return true for common legal intents', async () => {
    expect(await checkIntentExists('mandado_seguranca')).toBe(true);
    expect(await checkIntentExists('recurso_multa_transito')).toBe(true);
    expect(await checkIntentExists('acao_trabalhista')).toBe(true);
    expect(await checkIntentExists('divorcio_consensual')).toBe(true);
    expect(await checkIntentExists('direito_consumidor')).toBe(true);
  });

  test('should return true for valid intent patterns', async () => {
    expect(await checkIntentExists('acao_nova_categoria')).toBe(true);
    expect(await checkIntentExists('recurso_novo_tipo')).toBe(true);
    expect(await checkIntentExists('consulta_especializada')).toBe(true);
    expect(await checkIntentExists('agendamento_consulta')).toBe(true);
    expect(await checkIntentExists('informacao_processo')).toBe(true);
    expect(await checkIntentExists('direito_digital')).toBe(true);
    expect(await checkIntentExists('servico_juridico')).toBe(true);
  });

  test('should return false for invalid patterns', async () => {
    expect(await checkIntentExists('invalid_pattern')).toBe(false);
    expect(await checkIntentExists('random_intent')).toBe(false);
    expect(await checkIntentExists('not_legal_related')).toBe(false);
  });

  test('should use cache for repeated queries', async () => {
    // First call
    const result1 = await checkIntentExists('mandado_seguranca');
    expect(result1).toBe(true);

    // Second call should use cache
    const result2 = await checkIntentExists('mandado_seguranca');
    expect(result2).toBe(true);

    // Cache should have entries
    const stats = getIntentCacheStats();
    expect(stats.size).toBeGreaterThan(0);
  });

  test('should handle different agent/inbox contexts', async () => {
    const result1 = await checkIntentExists('mandado_seguranca', 'agent1', 'inbox1');
    const result2 = await checkIntentExists('mandado_seguranca', 'agent2', 'inbox2');
    
    expect(result1).toBe(true);
    expect(result2).toBe(true);

    // Should create separate cache entries
    const stats = getIntentCacheStats();
    expect(stats.size).toBeGreaterThanOrEqual(2);
  });
});

describe('validateIntentPayloads', () => {
  beforeEach(() => {
    clearIntentCache();
  });

  test('should validate multiple valid payloads', async () => {
    const payloads = [
      '@mandado_seguranca',
      '@recurso_multa_transito',
      '@acao_trabalhista'
    ];

    const result = await validateIntentPayloads(payloads);

    expect(result.valid).toHaveLength(3);
    expect(result.invalid).toHaveLength(0);
    expect(result.details['@mandado_seguranca'].exists).toBe(true);
    expect(result.details['@mandado_seguranca'].validFormat).toBe(true);
  });

  test('should identify invalid formats', async () => {
    const payloads = [
      '@mandado_seguranca', // Valid intent that exists
      '@Invalid',
      'no_at_prefix',
      '@invalid-format'
    ];

    const result = await validateIntentPayloads(payloads);

    expect(result.valid).toContain('@mandado_seguranca');
    expect(result.invalid).toContain('@Invalid');
    expect(result.invalid).toContain('@invalid-format');
    
    expect(result.details['@Invalid'].validFormat).toBe(false);
    expect(result.details['@invalid-format'].validFormat).toBe(false);
  });

  test('should identify non-existent intents', async () => {
    const payloads = [
      '@mandado_seguranca', // Exists
      '@nonexistent_intent' // Doesn't exist
    ];

    const result = await validateIntentPayloads(payloads);

    expect(result.valid).toContain('@mandado_seguranca');
    expect(result.invalid).toContain('@nonexistent_intent');
    
    expect(result.details['@mandado_seguranca'].exists).toBe(true);
    expect(result.details['@nonexistent_intent'].exists).toBe(false);
  });

  test('should handle mixed valid and invalid payloads', async () => {
    const payloads = [
      '@mandado_seguranca',  // Valid
      '@Invalid',            // Invalid format
      '@nonexistent_intent', // Valid format but doesn't exist
      '@acao_trabalhista'    // Valid
    ];

    const result = await validateIntentPayloads(payloads);

    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(2);
    expect(result.valid).toContain('@mandado_seguranca');
    expect(result.valid).toContain('@acao_trabalhista');
  });

  test('should handle empty payload list', async () => {
    const result = await validateIntentPayloads([]);

    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(0);
    expect(Object.keys(result.details)).toHaveLength(0);
  });
});

describe('clearIntentCache', () => {
  test('should clear the cache', async () => {
    // Populate cache
    await checkIntentExists('mandado_seguranca');
    
    let stats = getIntentCacheStats();
    expect(stats.size).toBeGreaterThan(0);

    // Clear cache
    clearIntentCache();

    stats = getIntentCacheStats();
    expect(stats.size).toBe(0);
  });
});

describe('getIntentCacheStats', () => {
  beforeEach(() => {
    clearIntentCache();
  });

  test('should return correct stats for empty cache', () => {
    const stats = getIntentCacheStats();
    
    expect(stats.size).toBe(0);
    expect(stats.hitRate).toBe(0);
    expect(stats.oldestEntry).toBe(0);
  });

  test('should return correct stats for populated cache', async () => {
    await checkIntentExists('mandado_seguranca');
    await checkIntentExists('acao_trabalhista');

    const stats = getIntentCacheStats();
    
    expect(stats.size).toBe(2);
    // oldestEntry should be greater than 0 if there are entries
    if (stats.size > 0) {
      expect(stats.oldestEntry).toBeGreaterThanOrEqual(0);
    }
  });
});