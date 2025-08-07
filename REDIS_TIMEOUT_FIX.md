# Correção dos Timeouts do Redis

## Problema Identificado
Os workers estavam apresentando erros de "Command timed out" no Redis, causando falhas nos processamentos.

## Mudanças Realizadas

### 1. Configurações de Timeout no Redis (`lib/connections.ts`)
- **connectTimeout**: 10s → 20s
- **commandTimeout**: 5s → 60s
- **maxRetriesPerRequest**: mantido como null (exigência do BullMQ)
- **retryStrategy**: delay de 50ms → 100ms, max 2s → 3s
- **retryDelayOnFailover**: 100ms → 200ms
- **enableAutoPipelining**: true → false (para evitar problemas)

### 2. Configurações Base do Redis (`lib/redis-config.ts`)
- **REDIS_CONNECT_TIMEOUT**: 15s → 20s
- **REDIS_COMMAND_TIMEOUT**: 30s → 60s
- **maxLoadingTimeout**: 5s → 10s
- **retryStrategy**: delay de 100ms → 200ms, max 2s → 5s
- **enableAutoPipelining**: false (adicionado)

### 3. Redis Wrapper (`lib/redis-wrapper.ts`)
- **timeout padrão**: 25s → 45s
- **retries padrão**: 2 → 3
- **retryDelay padrão**: 1s → 2s

### 4. Worker do Instagram (`worker/config/instagram-translation-worker.config.ts`)
- **lockDuration**: 5s → 30s
- **maxProcessingTime**: 4.5s → 25s
- **warningThreshold**: 3s → 15s
- **validação lockDuration**: max 60s → 120s

### 5. Variáveis de Ambiente (`.env.development`)
- **REDIS_CONNECT_TIMEOUT**: 15000 → 20000
- **REDIS_COMMAND_TIMEOUT**: 30000 → 60000

## Como Testar
Execute o script de teste para verificar se as correções funcionaram:

```bash
npx tsx scripts/test-redis-connection.ts
```

## Benefícios das Mudanças
1. **Maior tolerância a latência**: Timeouts mais generosos permitem que operações lentas completem
2. **Melhor recuperação**: Mais tentativas de retry com delays maiores
3. **Estabilidade em containers**: Configurações otimizadas para ambiente Docker
4. **Workers mais resilientes**: Lock durations maiores evitam timeouts prematuros

## Monitoramento
- Os logs agora mostrarão latências e tentativas de reconexão
- Health checks continuam funcionando para detectar problemas
- Métricas de performance são coletadas para otimizações futuras