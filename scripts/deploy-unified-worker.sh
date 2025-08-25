#!/bin/bash

# scripts/deploy-unified-worker.sh
# Script para fazer deploy do worker unificado

set -e

echo "🚀 Deploy do Worker Unificado - SocialWise"
echo "🕒 $(date)"
echo "=================================="

# Verificar se estamos no diretório correto
if [ ! -f "docker-compose-produção.yaml" ]; then
    echo "❌ Erro: docker-compose-produção.yaml não encontrado!"
    echo "🔧 Execute este script no diretório raiz do projeto"
    exit 1
fi

# Verificar se Docker está rodando
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker não está rodando!"
    exit 1
fi

# Verificar se Docker Compose está disponível
if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Docker Compose não está disponível!"
    exit 1
fi

echo "🔧 Parando containers existentes..."
docker compose -f docker-compose-produção.yaml down || true

echo "🏗️ Construindo nova imagem..."
docker compose -f docker-compose-produção.yaml build --no-cache

echo "🚀 Iniciando containers..."
docker compose -f docker-compose-produção.yaml up -d

echo "⏳ Aguardando containers iniciarem..."
sleep 10

echo "📊 Status dos containers:"
docker compose -f docker-compose-produção.yaml ps

echo ""
echo "📋 Logs do worker unificado:"
docker compose -f docker-compose-produção.yaml logs worker --tail=20

echo ""
echo "✅ Deploy concluído!"
echo "🔍 Para monitorar: docker compose -f docker-compose-produção.yaml logs -f worker"
echo "🛑 Para parar: docker compose -f docker-compose-produção.yaml down"
echo "=================================="
