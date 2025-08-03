#!/bin/bash

# Script de inicialização para worker de webhook
set -e

echo "🔗 Iniciando worker de webhook..."

# Verificar se estamos no diretório correto
if [ ! -d "/app" ]; then
    echo "❌ Diretório /app não encontrado"
    exit 1
fi

# Verificar se o script init-db.js existe
if [ ! -f "/app/scripts/init-db.js" ]; then
    echo "❌ Arquivo /app/scripts/init-db.js não encontrado"
    exit 1
fi

# Verificar se o worker existe
if [ ! -f "/app/dist/worker/webhook.worker.js" ]; then
    echo "❌ Arquivo /app/dist/worker/webhook.worker.js não encontrado"
    exit 1
fi

echo "✅ Arquivos encontrados"

# Executar inicialização do banco
echo "🗄️ Inicializando banco de dados..."
node /app/scripts/init-db.js

# Executar worker
echo "⚙️ Iniciando worker de webhook..."
node /app/dist/worker/webhook.worker.js 