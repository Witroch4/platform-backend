# 🔧 Guia para Corrigir Conexão Redis

## ✅ **Status Atual:**
- Dashboard funcionando ✅
- Redis container rodando ✅
- Problema: Dashboard tentando conectar em localhost em vez de redis

## 🚀 **Solução Rápida:**

### 1. **Reiniciar o servidor Next.js:**
```bash
# Parar o servidor (Ctrl+C)
# Depois reiniciar:
npm run dev
```

### 2. **Verificar se funcionou:**
- Acesse: `http://localhost:3000/admin/monitoring/dashboard`
- Verifique se o status do Cache mudou para "HEALTHY" ✅
- Os erros de Redis devem parar de aparecer

## 🔍 **Como Verificar:**

### 1. **Testar Redis manualmente:**
```bash
docker exec -it chatwit_redis redis-cli ping
# Deve retornar: PONG
```

### 2. **Verificar containers:**
```bash
docker ps
# Deve mostrar chatwit_redis rodando
```

### 3. **Verificar logs do dashboard:**
```bash
# Nos logs do Next.js, deve aparecer:
# [Dashboard] Environment: development, Docker: true
# [Dashboard] Connecting to Redis: redis://redis:6379
# [Dashboard Redis] ✅ Connected successfully
```

## 📊 **O que vai mudar no Dashboard:**

### Antes (com erro):
- Cache: ⚠️ WARNING
- Queues: ⚠️ WARNING
- Health Score: 85%
- Recomendação: "Redis Connection Issue"

### Depois (funcionando):
- Cache: ✅ HEALTHY
- Queues: ✅ HEALTHY
- Health Score: 95%
- Recomendação: "System Operating Optimally"

## 🔧 **Se ainda não funcionar:**

### 1. **Forçar uso do Redis do Docker:**
Adicione no `.env.development`:
```bash
REDIS_URL=redis://redis:6379
NODE_ENV=development
```

### 2. **Reiniciar tudo:**
```bash
docker-compose down
docker-compose up -d
npm run dev
```

### 3. **Verificar rede Docker:**
```bash
docker network ls
# Verificar se todos containers estão na mesma rede
```

## 🎯 **Resultado Esperado:**

Após reiniciar o servidor, você deve ver nos logs:
```
[Dashboard] Environment: development, Docker: true
[Dashboard] Connecting to Redis: redis://redis:6379
[Dashboard Redis] ✅ Connected successfully
```

E no dashboard:
- Todos os componentes com status ✅ HEALTHY
- Health Score: 95%
- Sem erros de Redis nos logs

## 📞 **Se precisar de ajuda:**

1. Verifique os logs do Next.js após reiniciar
2. Confirme que o Redis container está rodando
3. Teste a conexão manual com `docker exec -it chatwit_redis redis-cli ping`

**A correção principal já foi aplicada - só precisa reiniciar o servidor Next.js!** 🎉