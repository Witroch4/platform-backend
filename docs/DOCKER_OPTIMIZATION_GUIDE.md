# 🐳 Guia de Otimização para Docker

## 📊 **Configurações de Pool de Conexões**

### **PostgreSQL**
```env
# Limite de conexões por container
DATABASE_CONNECTION_LIMIT=10

# Timeout do pool (ms)
DATABASE_POOL_TIMEOUT=10000

# Timeout de query (ms)
DATABASE_QUERY_TIMEOUT=30000
```

### **Redis**
```env
# Máximo de tentativas de reconexão
REDIS_MAX_RETRIES=3

# Timeout de conexão (ms)
REDIS_CONNECT_TIMEOUT=10000

# Timeout de comando (ms)
REDIS_COMMAND_TIMEOUT=5000

# Keep-alive (ms)
REDIS_KEEPALIVE=30000
```

## 🔧 **Configuração do Docker Compose**

```yaml
services:
  app:
    image: chatwit-social:latest
    environment:
      - NODE_ENV=production
      - DATABASE_CONNECTION_LIMIT=10
      - REDIS_MAX_RETRIES=3
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 1024M
        reservations:
          cpus: "0.5"
          memory: 512M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## 📈 **Monitoramento**

### **Endpoints Disponíveis**
- `/api/health` - Health check básico
- `/api/metrics` - Métricas para Prometheus

### **Logs de Monitoramento**
```bash
# Logs de saúde a cada minuto
💚 Container healthy { uptime: "3600s", memory: "256MB" }

# Logs de problemas
⚠️ Container health degraded: { status: "degraded", database: "healthy", redis: "unhealthy" }
```

## 🚀 **Otimizações por Ambiente**

### **Desenvolvimento**
- Logs: `query`, `error`, `warn`
- Pool: Pequeno (5 conexões)
- Monitoramento: Desabilitado

### **Staging**
- Logs: `error`, `warn`
- Pool: Médio (10 conexões)
- Monitoramento: Habilitado

### **Produção**
- Logs: `error` apenas
- Pool: Otimizado (10-20 conexões)
- Monitoramento: Completo

## 🔄 **Shutdown Gracioso**

O sistema automaticamente:
1. Captura sinais `SIGINT` e `SIGTERM`
2. Fecha conexões de banco e Redis
3. Aguarda requisições ativas terminarem
4. Encerra o processo limpo

```bash
🛑 SIGTERM recebido, fechando conexões...
🔌 Prisma desconectado
🔌 Redis desconectado
✅ Todas as conexões fechadas
```

## 📊 **Métricas Importantes**

### **Para Alertas**
- `container_status` < 1 (degraded/unhealthy)
- `database_response_time` > 1000ms
- `redis_response_time` > 100ms
- `container_memory_usage` > 80% do limite

### **Para Dashboards**
- Uptime do container
- Uso de memória
- Tempo de resposta dos serviços
- Status de saúde ao longo do tempo

## 🎯 **Recomendações**

### **Recursos por Réplica**
- **CPU**: 0.5-1.0 cores
- **Memória**: 512MB-1GB
- **Conexões DB**: 5-15 por container
- **Conexões Redis**: Compartilhadas

### **Escalabilidade**
- 3-5 réplicas para alta disponibilidade
- Load balancer com health checks
- Auto-scaling baseado em CPU/memória
- Circuit breaker para dependências externas

### **Troubleshooting**
```bash
# Verificar logs do container
docker logs chatwit-social-app

# Verificar saúde
curl http://localhost:3000/api/health

# Verificar métricas
curl http://localhost:3000/api/metrics

# Verificar conexões do banco
docker exec -it postgres psql -c "SELECT count(*) FROM pg_stat_activity;"
```