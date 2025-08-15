import { getPrismaInstance } from "@/lib/connections";
import { getRedisInstance } from "@/lib/connections";
import { Provider } from "@prisma/client";
import { createHash } from "crypto";

const prisma = getPrismaInstance();

/**
 * Interface para chave de idempotência
 */
export interface IdempotencyKey {
  externalId?: string;
  provider: Provider;
  product: string;
  unit: string;
  timestamp: Date;
  fingerprint?: string;
}

/**
 * Interface para resultado de verificação de idempotência
 */
export interface IdempotencyResult {
  isDuplicate: boolean;
  existingEventId?: string;
  reason?: "external_id" | "fingerprint" | "temporal_duplicate";
}

/**
 * Serviço de idempotência para eventos de custo
 */
export class IdempotencyService {
  private redis: any;
  private readonly CACHE_TTL = 24 * 60 * 60; // 24 horas
  private readonly TEMPORAL_WINDOW = 5 * 60 * 1000; // 5 minutos

  constructor() {
    this.redis = getRedisInstance();
  }

  /**
   * Gera fingerprint único para um evento baseado em seus dados
   */
  private generateFingerprint(eventData: any): string {
    // Remove campos que podem variar mas não afetam a unicidade
    const { ts, raw, ...coreData } = eventData;
    
    // Inclui timestamp arredondado para janela temporal
    const roundedTimestamp = Math.floor(new Date(ts).getTime() / (60 * 1000)) * 60 * 1000;
    
    const fingerprintData = {
      ...coreData,
      roundedTimestamp,
    };

    // Ordena as chaves para garantir consistência
    const sortedData = Object.keys(fingerprintData)
      .sort()
      .reduce((obj, key) => {
        obj[key] = fingerprintData[key];
        return obj;
      }, {} as any);

    return createHash('sha256')
      .update(JSON.stringify(sortedData))
      .digest('hex');
  }

  /**
   * Gera chave de cache Redis para idempotência
   */
  private getCacheKey(type: "external" | "fingerprint", value: string): string {
    return `cost:idempotency:${type}:${value}`;
  }

  /**
   * Verifica se um evento já foi processado usando múltiplas estratégias
   */
  async checkIdempotency(eventData: any): Promise<IdempotencyResult> {
    const provider = eventData.provider as Provider;
    const product = eventData.product;
    const externalId = eventData.externalId;

    // Estratégia 1: Verificação por externalId (mais confiável)
    if (externalId) {
      const existingByExternalId = await this.checkByExternalId(
        externalId,
        provider,
        product
      );
      
      if (existingByExternalId.isDuplicate) {
        return existingByExternalId;
      }
    }

    // Estratégia 2: Verificação por fingerprint (para eventos sem externalId)
    const fingerprint = this.generateFingerprint(eventData);
    const existingByFingerprint = await this.checkByFingerprint(fingerprint);
    
    if (existingByFingerprint.isDuplicate) {
      return existingByFingerprint;
    }

    // Estratégia 3: Verificação temporal (duplicatas próximas no tempo)
    const existingByTemporal = await this.checkTemporalDuplicates(eventData);
    
    if (existingByTemporal.isDuplicate) {
      return existingByTemporal;
    }

    return { isDuplicate: false };
  }

  /**
   * Verifica duplicação por externalId
   */
  private async checkByExternalId(
    externalId: string,
    provider: Provider,
    product: string
  ): Promise<IdempotencyResult> {
    try {
      // Verifica cache Redis primeiro (mais rápido)
      const cacheKey = this.getCacheKey("external", `${provider}:${product}:${externalId}`);
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        return {
          isDuplicate: true,
          existingEventId: cached,
          reason: "external_id",
        };
      }

      // Verifica no banco de dados
      const existing = await prisma.costEvent.findFirst({
        where: {
          externalId,
          provider,
          product,
        },
        select: { id: true },
      });

      if (existing) {
        // Armazena no cache para próximas verificações
        await this.redis.setex(cacheKey, this.CACHE_TTL, existing.id);
        
        return {
          isDuplicate: true,
          existingEventId: existing.id,
          reason: "external_id",
        };
      }

      return { isDuplicate: false };
    } catch (error) {
      console.error("Erro ao verificar duplicação por externalId:", error);
      // Em caso de erro, assume que não é duplicata para não bloquear processamento
      return { isDuplicate: false };
    }
  }

  /**
   * Verifica duplicação por fingerprint
   */
  private async checkByFingerprint(fingerprint: string): Promise<IdempotencyResult> {
    try {
      const cacheKey = this.getCacheKey("fingerprint", fingerprint);
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        return {
          isDuplicate: true,
          existingEventId: cached,
          reason: "fingerprint",
        };
      }

      return { isDuplicate: false };
    } catch (error) {
      console.error("Erro ao verificar duplicação por fingerprint:", error);
      return { isDuplicate: false };
    }
  }

  /**
   * Verifica duplicatas temporais (eventos muito similares em pouco tempo)
   */
  private async checkTemporalDuplicates(eventData: any): Promise<IdempotencyResult> {
    try {
      const eventTime = new Date(eventData.ts);
      const windowStart = new Date(eventTime.getTime() - this.TEMPORAL_WINDOW);
      const windowEnd = new Date(eventTime.getTime() + this.TEMPORAL_WINDOW);

      const similar = await prisma.costEvent.findFirst({
        where: {
          provider: eventData.provider,
          product: eventData.product,
          unit: eventData.unit,
          units: eventData.units,
          ts: {
            gte: windowStart,
            lte: windowEnd,
          },
          // Adiciona filtros opcionais se disponíveis
          ...(eventData.inboxId && { inboxId: eventData.inboxId }),
          ...(eventData.userId && { userId: eventData.userId }),
          ...(eventData.sessionId && { sessionId: eventData.sessionId }),
        },
        select: { id: true },
      });

      if (similar) {
        return {
          isDuplicate: true,
          existingEventId: similar.id,
          reason: "temporal_duplicate",
        };
      }

      return { isDuplicate: false };
    } catch (error) {
      console.error("Erro ao verificar duplicatas temporais:", error);
      return { isDuplicate: false };
    }
  }

  /**
   * Registra um evento como processado para futuras verificações de idempotência
   */
  async registerProcessedEvent(eventData: any, eventId: string): Promise<void> {
    try {
      const promises: Promise<any>[] = [];

      // Registra por externalId se disponível
      if (eventData.externalId) {
        const externalKey = this.getCacheKey(
          "external",
          `${eventData.provider}:${eventData.product}:${eventData.externalId}`
        );
        promises.push(this.redis.setex(externalKey, this.CACHE_TTL, eventId));
      }

      // Registra por fingerprint
      const fingerprint = this.generateFingerprint(eventData);
      const fingerprintKey = this.getCacheKey("fingerprint", fingerprint);
      promises.push(this.redis.setex(fingerprintKey, this.CACHE_TTL, eventId));

      await Promise.all(promises);
    } catch (error) {
      console.error("Erro ao registrar evento processado:", error);
      // Não falha o processamento se não conseguir registrar
    }
  }

  /**
   * Remove registros de idempotência (para testes ou correções)
   */
  async removeIdempotencyRecord(
    externalId?: string,
    fingerprint?: string
  ): Promise<void> {
    try {
      const keysToDelete: string[] = [];

      if (externalId) {
        // Precisa do provider e product para formar a chave completa
        // Esta função é mais para casos especiais/debugging
        const pattern = this.getCacheKey("external", `*:*:${externalId}`);
        const keys = await this.redis.keys(pattern);
        keysToDelete.push(...keys);
      }

      if (fingerprint) {
        keysToDelete.push(this.getCacheKey("fingerprint", fingerprint));
      }

      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
      }
    } catch (error) {
      console.error("Erro ao remover registros de idempotência:", error);
    }
  }

  /**
   * Obtém estatísticas de idempotência
   */
  async getIdempotencyStats(): Promise<{
    totalCacheEntries: number;
    externalIdEntries: number;
    fingerprintEntries: number;
    duplicatesBlocked: number;
  }> {
    try {
      const [externalKeys, fingerprintKeys] = await Promise.all([
        this.redis.keys(this.getCacheKey("external", "*")),
        this.redis.keys(this.getCacheKey("fingerprint", "*")),
      ]);

      // Obtém contador de duplicatas bloqueadas do Redis
      const duplicatesBlocked = parseInt(
        await this.redis.get("cost:idempotency:duplicates_blocked") || "0"
      );

      return {
        totalCacheEntries: externalKeys.length + fingerprintKeys.length,
        externalIdEntries: externalKeys.length,
        fingerprintEntries: fingerprintKeys.length,
        duplicatesBlocked,
      };
    } catch (error) {
      console.error("Erro ao obter estatísticas de idempotência:", error);
      return {
        totalCacheEntries: 0,
        externalIdEntries: 0,
        fingerprintEntries: 0,
        duplicatesBlocked: 0,
      };
    }
  }

  /**
   * Incrementa contador de duplicatas bloqueadas
   */
  async incrementDuplicatesBlocked(): Promise<void> {
    try {
      await this.redis.incr("cost:idempotency:duplicates_blocked");
    } catch (error) {
      console.error("Erro ao incrementar contador de duplicatas:", error);
    }
  }

  /**
   * Limpa cache de idempotência expirado
   */
  async cleanupExpiredCache(): Promise<number> {
    try {
      let cleanedCount = 0;
      
      // Limpa entradas externas expiradas
      const externalKeys = await this.redis.keys(this.getCacheKey("external", "*"));
      for (const key of externalKeys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1) { // Sem TTL definido
          await this.redis.expire(key, this.CACHE_TTL);
        } else if (ttl === -2) { // Chave expirada
          await this.redis.del(key);
          cleanedCount++;
        }
      }

      // Limpa entradas de fingerprint expiradas
      const fingerprintKeys = await this.redis.keys(this.getCacheKey("fingerprint", "*"));
      for (const key of fingerprintKeys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1) {
          await this.redis.expire(key, this.CACHE_TTL);
        } else if (ttl === -2) {
          await this.redis.del(key);
          cleanedCount++;
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error("Erro ao limpar cache de idempotência:", error);
      return 0;
    }
  }
}

/**
 * Instância singleton do serviço de idempotência
 */
export const idempotencyService = new IdempotencyService();

/**
 * Função utilitária para verificar idempotência (compatibilidade)
 */
export async function checkEventIdempotency(eventData: any): Promise<boolean> {
  const result = await idempotencyService.checkIdempotency(eventData);
  
  if (result.isDuplicate) {
    await idempotencyService.incrementDuplicatesBlocked();
    console.log(`Evento duplicado bloqueado: ${result.reason}`, {
      existingEventId: result.existingEventId,
      provider: eventData.provider,
      product: eventData.product,
      externalId: eventData.externalId,
    });
  }
  
  return result.isDuplicate;
}

/**
 * Função utilitária para registrar evento processado
 */
export async function registerProcessedEvent(eventData: any, eventId: string): Promise<void> {
  await idempotencyService.registerProcessedEvent(eventData, eventId);
}