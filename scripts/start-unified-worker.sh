#!/bin/bash

# scripts/start-unified-worker.sh
# Script para iniciar o worker unificado em produção

echo "🚀 Iniciando Worker Unificado do SocialWise..."
echo "🕒 $(date)"
echo "🏗️ Ambiente: ${NODE_ENV:-production}"
echo "📂 Diretório: $(pwd)"

# Verificar se o arquivo compilado existe
if [ ! -f "/app/dist/worker/init.js" ]; then
    echo "❌ Erro: Arquivo dist/worker/init.js não encontrado!"
    echo "🔧 Certifique-se de que o build foi executado corretamente"
    exit 1
fi

# Configurar variáveis de ambiente específicas do worker
export WORKER_TYPE="unified"
export WORKER_NAME="socialwise-unified-worker"
export WORKER_PID_FILE="/tmp/unified-worker.pid"

# Verificar conexão com Redis
echo "🔄 Verificando conexão com Redis..."
if [ -n "$REDIS_URL" ]; then
    echo "✅ Redis configurado: $REDIS_URL"
else
    echo "⚠️ REDIS_URL não configurado"
fi

# Verificar conexão com PostgreSQL
echo "🔄 Verificando conexão com PostgreSQL..."
if [ -n "$DATABASE_URL" ]; then
    echo "✅ PostgreSQL configurado"
else
    echo "❌ DATABASE_URL não configurado"
    exit 1
fi

# Criar diretório para logs se não existir
mkdir -p /app/logs

# Função de cleanup para shutdown graceful
cleanup() {
    echo "🛑 Recebido sinal de parada, encerrando worker unificado..."
    if [ -f "$WORKER_PID_FILE" ]; then
        PID=$(cat "$WORKER_PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "⏹️ Enviando SIGTERM para PID $PID..."
            kill -TERM "$PID"
            
            # Aguardar até 30 segundos para shutdown graceful
            for i in {1..30}; do
                if ! kill -0 "$PID" 2>/dev/null; then
                    echo "✅ Worker encerrado gracefully"
                    break
                fi
                echo "⏳ Aguardando shutdown... ($i/30)"
                sleep 1
            done
            
            # Forçar encerramento se necessário
            if kill -0 "$PID" 2>/dev/null; then
                echo "⚠️ Forçando encerramento do worker..."
                kill -KILL "$PID"
            fi
        fi
        rm -f "$WORKER_PID_FILE"
    fi
    exit 0
}

# Registrar handlers para sinais
trap cleanup SIGTERM SIGINT SIGQUIT

echo "🎯 Iniciando worker unificado..."
echo "📊 Concorrência configurada:"
echo "   - LEADS_CHATWIT_CONCURRENCY: ${LEADS_CHATWIT_CONCURRENCY:-5}"
echo "   - LEADS_CHATWIT_LOCK_DURATION: ${LEADS_CHATWIT_LOCK_DURATION:-60000}"
echo "   - WEBHOOK_DIRECT_PROCESSING: ${WEBHOOK_DIRECT_PROCESSING:-true}"

# Iniciar o worker e capturar PID
node /app/dist/worker/init.js &
WORKER_PID=$!

# Salvar PID
echo $WORKER_PID > "$WORKER_PID_FILE"

echo "✅ Worker unificado iniciado com PID: $WORKER_PID"
echo "📋 Workers inclusos:"
echo "   - Parent Worker (High & Low Priority)"
echo "   - Instagram Automation Worker"
echo "   - AI Integration Workers"
echo "   - Manuscrito Worker"
echo "   - Leads Chatwit Worker"
echo "   - Instagram Translation Worker"

# Aguardar o processo
wait $WORKER_PID
EXIT_CODE=$?

echo "🏁 Worker unificado encerrado com código: $EXIT_CODE"

# Cleanup
rm -f "$WORKER_PID_FILE"

exit $EXIT_CODE
