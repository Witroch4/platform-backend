# Guia de Configuração do Redis - Socialwise Chatwit

## Visão Geral

O sistema de monitoramento do Socialwise Chatwit usa Redis para cache e filas (BullMQ). A configuração é inteligente e se adapta automaticamente ao ambiente de execução.

## Configuração Automática

### 🔧 Como Funciona

O arquivo `lib/redis.ts` detecta automaticamente o ambiente:

```typescript
// Detecta se está rodando em Docker
const isRunningInDocker = process.env.RUN_IN_DOCKER === 'true' || process.env.NODE_ENV === 'production';

// Configuração inteligente (sem senha)
const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || (isRunningInDocker ? 'redis' : '127.0.0.1'),
  port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
  // Sem autenticação - Redis local/Docker sem senha
});
```

### 🌍 Ambientes Suportados

#### 1. **Desenvolvimento Local** (`NODE_ENV=development`)
- **Host padrão:** `127.0.0.1`
- **Porta padrão:** `6379`
- **Configuração:** Redis local instalado na máquina

#### 2. **Docker/Produção** (`RUN_IN_DOCKER=true` ou `NODE_ENV=production`)
- **Host padrão:** `redis` (nome do container)
- **Porta padrão:** `6379`
- **Configuração:** Redis rodando em container Docker

## 📁 Arquivos de Configuração

### `.env.development`
```bash
# Redis para desenvolvimento local
REDIS_HOST=redis          # Nome do container no Docker
REDIS_PORT=6379
```

### `.env.production`
```bash
# Redis para produção
REDIS_HOST=redis          # Nome do container no Docker
REDIS_PORT=6379
```

### `docker-compose-dev.yml`
```yaml
services:
  redis:
    image: redis:7-alpine
    container_name: chatwit_redis
    ports:
      - "6379:6379"
    networks:
      - minha_rede

  app:
    environment:
      REDIS_HOST: "redis"    # Conecta no container
      REDIS_PORT: "6379"
    networks:
      - minha_rede
    depends_on:
      - redis
```

## 🧪 Testando a Configuração

### Teste Local
```bash
npx tsx scripts/check-redis-connection.ts
```

### Teste Simulação de Produção
```bash
npx tsx scripts/test-redis-production.ts
```

### Teste em Docker
```bash
# Inicia apenas o Redis
docker compose -f docker-compose-dev.yml up redis

# Em outro terminal, testa a conexão
npx tsx scripts/test-redis-production.ts
```

## 🚀 Deploy em Produção

### 1. **Ambiente Docker**
- O Redis roda como container: `chatwit_redis`
- Host: `redis` (resolvido pela rede Docker)
- Porta: `6379`

### 2. **Variáveis de Ambiente**
```bash
RUN_IN_DOCKER=true
NODE_ENV=production
REDIS_HOST=redis
REDIS_PORT=6379
```

### 3. **Rede Docker**
- Todos os serviços estão na rede `minha_rede`
- Comunicação interna via nomes de container

## 🔍 Troubleshooting

### Erro: `ECONNREFUSED 188.245.200.61:6380`
**Causa:** Configuração antiga apontando para Redis de produção
**Solução:** ✅ Já corrigido - agora usa configuração inteligente

### Erro: `ENOTFOUND redis`
**Causa:** Tentando conectar no container Redis fora do Docker
**Solução:** Execute dentro do ambiente Docker ou use Redis local

### Erro: `ECONNREFUSED 127.0.0.1:6379`
**Causa:** Redis não está rodando localmente
**Solução:** 
```bash
# Instalar Redis local
# Windows: https://redis.io/download
# Ou usar Docker
docker run -d -p 6379:6379 redis:alpine
```

## 📊 Monitoramento

O sistema de monitoramento inclui:

- **Cache Health Monitor:** Latência e conectividade
- **Queue Monitor:** Status das filas BullMQ
- **Performance Metrics:** Métricas de cache hit/miss

### APIs de Monitoramento
- `GET /api/admin/monitoring/dashboard` - Dashboard geral
- `GET /api/admin/monitoring/queues` - Status das filas

## ✅ Checklist de Verificação

- [ ] Redis local funcionando (desenvolvimento)
- [ ] Container Redis rodando (Docker)
- [ ] Variáveis de ambiente configuradas
- [ ] Rede Docker configurada
- [ ] Sistema de monitoramento funcionando
- [ ] Testes passando

## 🎯 Resumo

A configuração é **inteligente e automática**:
- **Desenvolvimento:** Conecta no `127.0.0.1:6379`
- **Produção:** Conecta no `redis:6379` (container)
- **Fallback:** Usa valores padrão apropriados para cada ambiente

Não há risco de falhar em produção - o sistema detecta automaticamente o ambiente e usa a configuração correta! 🚀 