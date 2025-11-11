#!/bin/bash
# Script para rodar Prisma Studio com DATABASE_URL local

# Verifica se PostgreSQL está rodando e exposto
if ! nc -z localhost 5432 2>/dev/null; then
  echo "❌ PostgreSQL não está acessível em localhost:5432"
  echo ""
  echo "Opções:"
  echo "1. Expor porta do Docker: docker compose up -d postgres"
  echo "2. Rodar Prisma Studio no Docker: docker compose exec app npx prisma studio"
  exit 1
fi

# Pega DATABASE_URL atual e substitui 'postgres' por 'localhost'
ORIGINAL_URL=$(grep "^DATABASE_URL=" .env | cut -d '=' -f2-)
LOCAL_URL=$(echo "$ORIGINAL_URL" | sed 's/@postgres:/@localhost:/g' | tr -d '"')

echo "🚀 Iniciando Prisma Studio com conexão local..."
echo "📍 URL: ${LOCAL_URL}"
echo ""

DATABASE_URL="$LOCAL_URL" npx prisma studio
