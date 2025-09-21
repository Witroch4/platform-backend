/**
 * Script para limpar mensagens duplicadas no ambiente de teste
 * Este script ajuda a resolver o problema de detecção de duplicatas
 * removendo as chaves de idempotência do Redis
 */

import { getRedisInstance } from '@/lib/connections';
import { SocialWiseIdempotencyService } from '@/lib/socialwise-flow/services/idempotency';

interface ClearDuplicatesOptions {
  sessionId?: string;
  accountId?: string;
  inboxId?: string;
  wamid?: string;
  dryRun?: boolean;
  maxAge?: number; // em horas
}

class DuplicateMessageCleaner {
  private redis: any;
  private idempotencyService: SocialWiseIdempotencyService;

  constructor() {
    this.redis = getRedisInstance();
    this.idempotencyService = new SocialWiseIdempotencyService();
  }

  /**
   * Lista todas as chaves de idempotência que correspondem aos filtros
   */
  async listIdempotencyKeys(options: ClearDuplicatesOptions = {}): Promise<string[]> {
    try {
      let pattern = 'sw:idem:';
      
      if (options.accountId) {
        pattern += `${options.accountId}:`;
      } else {
        pattern += '*:';
      }
      
      if (options.inboxId) {
        pattern += `${options.inboxId}:`;
      } else {
        pattern += '*:';
      }
      
      pattern += '*';
      
      const keys = await this.redis.keys(pattern);
      
      // Filtrar por idade se especificado
      if (options.maxAge) {
        const maxAgeSeconds = options.maxAge * 3600;
        const filteredKeys = [];
        
        for (const key of keys) {
          const ttl = await this.redis.ttl(key);
          const age = 86400 - ttl; // TTL padrão é 24h (86400s)
          
          if (age <= maxAgeSeconds) {
            filteredKeys.push(key);
          }
        }
        
        return filteredKeys;
      }
      
      return keys;
    } catch (error) {
      console.error('Erro ao listar chaves de idempotência:', error);
      return [];
    }
  }

  /**
   * Remove chaves de idempotência específicas
   */
  async clearSpecificKey(options: {
    sessionId: string;
    accountId: string;
    inboxId: string;
    wamid?: string;
    messageId?: string;
  }): Promise<boolean> {
    try {
      const key = {
        sessionId: options.sessionId,
        accountId: options.accountId,
        inboxId: options.inboxId,
        wamid: options.wamid,
        messageId: options.messageId
      };
      
      await this.idempotencyService.removeKey(key);
      console.log(`✅ Chave removida para sessionId: ${options.sessionId}, accountId: ${options.accountId}, inboxId: ${options.inboxId}`);
      return true;
    } catch (error) {
      console.error('Erro ao remover chave específica:', error);
      return false;
    }
  }

  /**
   * Remove todas as chaves que correspondem aos filtros
   */
  async clearKeys(options: ClearDuplicatesOptions = {}): Promise<number> {
    try {
      const keys = await this.listIdempotencyKeys(options);
      
      if (keys.length === 0) {
        console.log('🔍 Nenhuma chave encontrada com os filtros especificados.');
        return 0;
      }
      
      console.log(`📋 Encontradas ${keys.length} chaves:`);
      keys.forEach(key => console.log(`  - ${key}`));
      
      if (options.dryRun) {
        console.log('🧪 Modo dry-run: nenhuma chave foi removida.');
        return keys.length;
      }
      
      // Remover as chaves
      const pipeline = this.redis.pipeline();
      keys.forEach(key => pipeline.del(key));
      await pipeline.exec();
      
      console.log(`✅ ${keys.length} chaves removidas com sucesso!`);
      return keys.length;
    } catch (error) {
      console.error('Erro ao limpar chaves:', error);
      return 0;
    }
  }

  /**
   * Limpa todas as chaves de idempotência (cuidado!)
   */
  async clearAllIdempotencyKeys(confirm: boolean = false): Promise<number> {
    if (!confirm) {
      console.log('⚠️  Para limpar TODAS as chaves, chame clearAllIdempotencyKeys(true)');
      return 0;
    }
    
    return this.clearKeys();
  }

  /**
   * Mostra estatísticas das chaves de idempotência
   */
  async showStats(): Promise<void> {
    try {
      const allKeys = await this.listIdempotencyKeys();
      console.log(`📊 Total de chaves de idempotência: ${allKeys.length}`);
      
      // Agrupar por account e inbox
      const stats: { [key: string]: number } = {};
      
      for (const key of allKeys) {
        const parts = key.split(':');
        if (parts.length >= 4) {
          const accountId = parts[2];
          const inboxId = parts[3];
          const groupKey = `account:${accountId}, inbox:${inboxId}`;
          stats[groupKey] = (stats[groupKey] || 0) + 1;
        }
      }
      
      console.log('\n📈 Distribuição por account/inbox:');
      Object.entries(stats).forEach(([group, count]) => {
        console.log(`  ${group}: ${count} chaves`);
      });
    } catch (error) {
      console.error('Erro ao mostrar estatísticas:', error);
    }
  }
}

// Funções de conveniência para uso direto
export async function clearDuplicatesForSession(sessionId: string, accountId: string, inboxId: string, dryRun: boolean = true) {
  const cleaner = new DuplicateMessageCleaner();
  return cleaner.clearKeys({ sessionId, accountId, inboxId, dryRun });
}

export async function clearDuplicatesForAccount(accountId: string, dryRun: boolean = true) {
  const cleaner = new DuplicateMessageCleaner();
  return cleaner.clearKeys({ accountId, dryRun });
}

export async function clearDuplicatesForInbox(accountId: string, inboxId: string, dryRun: boolean = true) {
  const cleaner = new DuplicateMessageCleaner();
  return cleaner.clearKeys({ accountId, inboxId, dryRun });
}

export async function clearOldDuplicates(maxAgeHours: number = 1, dryRun: boolean = true) {
  const cleaner = new DuplicateMessageCleaner();
  return cleaner.clearKeys({ maxAge: maxAgeHours, dryRun });
}

export async function showDuplicateStats() {
  const cleaner = new DuplicateMessageCleaner();
  return cleaner.showStats();
}

// Exemplo de uso para o caso específico do log
export async function clearSpecificDuplicate() {
  const cleaner = new DuplicateMessageCleaner();
  
  // Baseado no log fornecido:
  // sessionId: '558597550136', accountId: '3', inboxId: '4'
  return cleaner.clearSpecificKey({
    sessionId: '558597550136',
    accountId: '3',
    inboxId: '4'
  });
}

export { DuplicateMessageCleaner };

// Se executado diretamente
if (require.main === module) {
  console.log('🧹 Script de limpeza de mensagens duplicadas');
  console.log('\nUso:');
  console.log('  pnpm exec ts-node scripts/clear-duplicate-messages.ts');
  console.log('\nOu importe as funções em outro script:');
  console.log('  import { clearDuplicatesForSession, showDuplicateStats } from "./scripts/clear-duplicate-messages";');
  console.log('\nPara o caso específico do seu log:');
  console.log('  clearSpecificDuplicate()');
}