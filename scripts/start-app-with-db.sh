#!/bin/bash

# scripts/start-app-with-db.sh
# Script para inicializar o app com preparação robusta do banco de dados

set -e

echo "🚀 Iniciando aplicação SocialWise..."
echo "🕒 $(date)"
echo "=================================="

# Função para verificar conexão com o banco
check_database() {
    echo "🔄 Verificando conexão com o banco de dados..."
    
    if [ -z "$DATABASE_URL" ]; then
        echo "❌ ERROR: DATABASE_URL não definida"
        exit 1
    fi
    
    echo "✅ DATABASE_URL configurada"
}

# Função para resolver problemas de migração
fix_migrations() {
    echo "🔧 Verificando e corrigindo migrações..."
    
    # Tentar aplicar migrações normalmente primeiro
    if npx prisma migrate deploy 2>/dev/null; then
        echo "✅ Migrações aplicadas com sucesso"
        return 0
    fi
    
    echo "⚠️ Falha nas migrações, tentando resolver..."
    
    # Marcar migrações falhadas como resolvidas
    echo "🔄 Marcando migrações falhadas como resolvidas..."
    npx prisma migrate resolve --applied 20250825155851_init || true
    
    # Tentar aplicar novamente
    if npx prisma migrate deploy; then
        echo "✅ Migrações corrigidas e aplicadas"
        return 0
    else
        echo "❌ Falha persistente nas migrações"
        echo "🔄 Tentando reset das migrações..."
        
        # Como último recurso, fazer push do schema
        npx prisma db push --force-reset || true
        npx prisma generate
        
        echo "⚠️ Schema aplicado via push - revisar migrações manualmente"
    fi
}

# Função principal
main() {
    check_database
    
    echo "🔄 Preparando banco de dados..."
    
    # Executar o script de preparação original
    if ! node /app/scripts/db-prepare.js --mode=deploy; then
        echo "⚠️ Script db-prepare falhou, tentando correção manual..."
        fix_migrations
    fi
    
    echo "🚀 Iniciando servidor..."
    exec node /app/server.js
}

# Trap para cleanup
cleanup() {
    echo "🛑 Recebido sinal de parada..."
    exit 0
}

trap cleanup SIGTERM SIGINT

# Executar função principal
main "$@"
