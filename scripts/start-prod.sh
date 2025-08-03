#!/bin/bash

# Script de inicialização para produção
set -e

echo "🚀 Iniciando aplicação em produção..."

# Verificar se estamos no diretório correto
if [ ! -d "/app" ]; then
    echo "❌ Diretório /app não encontrado"
    exit 1
fi

echo "📁 Verificando estrutura de arquivos..."
ls -la /app/

# Verificar se o script init-db.js existe
if [ ! -f "/app/scripts/init-db.js" ]; then
    echo "❌ Arquivo /app/scripts/init-db.js não encontrado"
    echo "📂 Conteúdo da pasta scripts:"
    ls -la /app/scripts/ || echo "Pasta scripts não existe"
    exit 1
fi

echo "✅ Script init-db.js encontrado"

# Verificar se o server.js existe
if [ ! -f "/app/server.js" ]; then
    echo "❌ Arquivo /app/server.js não encontrado"
    exit 1
fi

echo "✅ Server.js encontrado"

# Executar inicialização do banco
echo "🗄️ Inicializando banco de dados..."
node /app/scripts/init-db.js

# Executar servidor
echo "🌐 Iniciando servidor..."
node /app/server.js 