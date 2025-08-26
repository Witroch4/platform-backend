#!/bin/bash

# scripts/fix-prisma-migration.sh
# Script para resolver problemas de migração no Prisma

echo "🔧 Resolvendo problemas de migração do Prisma..."
echo "🕒 $(date)"
echo "=================================="

# Verificar se DATABASE_URL está configurado
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL não está configurado!"
    exit 1
fi

echo "📊 Status atual das migrações:"
npx prisma migrate status || true

echo ""
echo "🔧 Tentando resolver migração falha..."

# Opção 1: Marcar migração como aplicada (se ela já foi aplicada parcialmente)
echo "📋 Opções disponíveis:"
echo "1. Marcar migração como resolvida (se já foi aplicada)"
echo "2. Reverter e reaplicar migração"
echo "3. Reset completo do banco (CUIDADO!)"

# Por padrão, vamos tentar resolver marcando como aplicada
echo "🔄 Tentando marcar migração como resolvida..."
npx prisma migrate resolve --applied 20250825155851_init

echo ""
echo "🔄 Tentando aplicar migrações pendentes..."
npx prisma migrate deploy

echo ""
echo "📊 Status final das migrações:"
npx prisma migrate status

echo ""
echo "✅ Script de correção concluído!"
echo "=================================="
