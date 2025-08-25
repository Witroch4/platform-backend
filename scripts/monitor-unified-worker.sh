#!/bin/bash

# scripts/monitor-unified-worker.sh
# Script para monitorar o status do worker unificado

echo "📊 Monitor do Worker Unificado - SocialWise"
echo "🕒 $(date)"
echo "=================================="

# Verificar se o PID file existe
WORKER_PID_FILE="/tmp/unified-worker.pid"

if [ -f "$WORKER_PID_FILE" ]; then
    PID=$(cat "$WORKER_PID_FILE")
    
    if kill -0 "$PID" 2>/dev/null; then
        echo "✅ Worker unificado está rodando (PID: $PID)"
        
        # Mostrar informações do processo
        echo ""
        echo "📈 Informações do Processo:"
        ps -p "$PID" -o pid,ppid,pcpu,pmem,etime,cmd --no-headers
        
        # Mostrar uso de memória
        echo ""
        echo "🧠 Uso de Memória:"
        ps -p "$PID" -o rss --no-headers | awk '{printf "   RAM: %.2f MB\n", $1/1024}'
        
        # Verificar logs recentes
        echo ""
        echo "📋 Logs Recentes (últimas 10 linhas):"
        if [ -f "/app/logs/unified-worker.log" ]; then
            tail -10 /app/logs/unified-worker.log
        else
            echo "   Arquivo de log não encontrado"
        fi
        
    else
        echo "❌ Worker unificado não está rodando (PID file existe mas processo não)"
        rm -f "$WORKER_PID_FILE"
    fi
else
    echo "❌ Worker unificado não está rodando (PID file não encontrado)"
fi

echo ""
echo "🔍 Status das Conexões:"

# Verificar Redis
if command -v redis-cli >/dev/null 2>&1; then
    if [ -n "$REDIS_URL" ]; then
        echo -n "   Redis: "
        if redis-cli -u "$REDIS_URL" ping >/dev/null 2>&1; then
            echo "✅ Conectado"
        else
            echo "❌ Desconectado"
        fi
    else
        echo "   Redis: ⚠️ URL não configurada"
    fi
else
    echo "   Redis: ⚠️ redis-cli não disponível"
fi

# Verificar PostgreSQL (básico)
echo -n "   PostgreSQL: "
if [ -n "$DATABASE_URL" ]; then
    echo "✅ Configurado"
else
    echo "❌ URL não configurada"
fi

echo ""
echo "🏗️ Variáveis de Ambiente Relevantes:"
echo "   NODE_ENV: ${NODE_ENV:-não definido}"
echo "   LEADS_CHATWIT_CONCURRENCY: ${LEADS_CHATWIT_CONCURRENCY:-5}"
echo "   LEADS_CHATWIT_LOCK_DURATION: ${LEADS_CHATWIT_LOCK_DURATION:-60000}"
echo "   WEBHOOK_DIRECT_PROCESSING: ${WEBHOOK_DIRECT_PROCESSING:-true}"

echo ""
echo "=================================="
