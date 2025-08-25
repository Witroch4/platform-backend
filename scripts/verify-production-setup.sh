#!/bin/bash

# scripts/verify-production-setup.sh
# Script para verificar se a configuração de produção está correta

echo "🔍 Verificação da Configuração de Produção - SocialWise"
echo "========================================================"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

errors=0
warnings=0

echo ""
echo "📋 Verificando arquivos necessários..."

# Verificar arquivos essenciais
files_to_check=(
    "docker-compose-produção.yaml"
    "Dockerfile.prod"
    "server.js"
    "worker/init.ts"
    "dist/worker/init.js"
    "package.json"
)

for file in "${files_to_check[@]}"; do
    if [ -f "$file" ]; then
        echo -e "✅ $file ${GREEN}existe${NC}"
    else
        echo -e "❌ $file ${RED}não encontrado${NC}"
        ((errors++))
    fi
done

echo ""
echo "🔧 Verificando configurações..."

# Verificar porta no server.js
echo -n "📡 Porta do server.js: "
server_port=$(grep -o "listen(30[0-9][0-9]" server.js | grep -o "30[0-9][0-9]")
if [ "$server_port" = "3002" ]; then
    echo -e "${GREEN}3002 ✅${NC}"
else
    echo -e "${RED}$server_port (esperado: 3002) ❌${NC}"
    ((errors++))
fi

# Verificar porta no Dockerfile.prod
echo -n "🐳 Porta exposta no Dockerfile: "
docker_port=$(grep "EXPOSE" Dockerfile.prod | grep -o "[0-9]\+")
if [ "$docker_port" = "3002" ]; then
    echo -e "${GREEN}3002 ✅${NC}"
else
    echo -e "${RED}$docker_port (esperado: 3002) ❌${NC}"
    ((errors++))
fi

# Verificar porta no docker-compose-produção.yaml
echo -n "⚖️ Porta do loadbalancer: "
lb_port=$(grep "loadbalancer.server.port" docker-compose-produção.yaml | grep -o "[0-9]\+")
if [ "$lb_port" = "3002" ]; then
    echo -e "${GREEN}3002 ✅${NC}"
else
    echo -e "${RED}$lb_port (esperado: 3002) ❌${NC}"
    ((errors++))
fi

# Verificar comando do worker
echo -n "🤖 Comando do worker: "
worker_command=$(grep -A1 "# Comando para iniciar TODOS os workers" docker-compose-produção.yaml | grep "command:" | sed 's/.*command: //')
if [ "$worker_command" = "node /app/dist/worker/init.js" ]; then
    echo -e "${GREEN}node /app/dist/worker/init.js ✅${NC}"
else
    echo -e "${RED}$worker_command (esperado: node /app/dist/worker/init.js) ❌${NC}"
    ((errors++))
fi

# Verificar REDIS_URL
echo -n "🔄 REDIS_URL configurado: "
if grep -q "REDIS_URL: redis://redis:6379" docker-compose-produção.yaml; then
    echo -e "${GREEN}redis://redis:6379 ✅${NC}"
else
    echo -e "${RED}não encontrado ou incorreto ❌${NC}"
    ((errors++))
fi

# Verificar se arquivo compilado existe
echo -n "📦 Worker compilado: "
if [ -f "dist/worker/init.js" ]; then
    echo -e "${GREEN}dist/worker/init.js existe ✅${NC}"
else
    echo -e "${YELLOW}dist/worker/init.js não encontrado (execute: npm run build:workers) ⚠️${NC}"
    ((warnings++))
fi

# Verificar recursos do worker
echo -n "💾 Recursos do worker: "
worker_memory=$(grep -A10 "worker:" docker-compose-produção.yaml | grep "memory:" | sed 's/.*memory: //')
worker_cpu=$(grep -A10 "worker:" docker-compose-produção.yaml | grep "cpus:" | sed 's/.*cpus: //' | tr -d '"')
if [ "$worker_memory" = "6G" ] && [ "$worker_cpu" = "3.0" ]; then
    echo -e "${GREEN}CPU: $worker_cpu, RAM: $worker_memory ✅${NC}"
else
    echo -e "${YELLOW}CPU: $worker_cpu, RAM: $worker_memory (recomendado: 3.0 CPUs, 6G RAM) ⚠️${NC}"
    ((warnings++))
fi

# Verificar volumes
echo -n "📁 Volume configurado: "
if grep -q "chatwit_temp:/app/temp" docker-compose-produção.yaml && grep -q "external: true" docker-compose-produção.yaml; then
    echo -e "${GREEN}chatwit_temp (externo) ✅${NC}"
else
    echo -e "${RED}volume não configurado corretamente ❌${NC}"
    ((errors++))
fi

# Verificar rede
echo -n "🌐 Rede configurada: "
if grep -q "minha_rede:" docker-compose-produção.yaml && grep -q "external: true" docker-compose-produção.yaml; then
    echo -e "${GREEN}minha_rede (externa) ✅${NC}"
else
    echo -e "${RED}rede não configurada corretamente ❌${NC}"
    ((errors++))
fi

echo ""
echo "🧪 Verificando scripts do package.json..."

# Verificar scripts essenciais
scripts_to_check=(
    "build"
    "build:workers"
    "start:unified-worker:prod"
    "start"
)

for script in "${scripts_to_check[@]}"; do
    if grep -q "\"$script\":" package.json; then
        echo -e "✅ Script '$script' ${GREEN}existe${NC}"
    else
        echo -e "❌ Script '$script' ${RED}não encontrado${NC}"
        ((errors++))
    fi
done

echo ""
echo "========================================================"
echo "📊 Resumo da Verificação:"

if [ $errors -eq 0 ] && [ $warnings -eq 0 ]; then
    echo -e "${GREEN}✅ Configuração perfeita! Pronto para deploy.${NC}"
elif [ $errors -eq 0 ]; then
    echo -e "${YELLOW}⚠️ Configuração OK com $warnings aviso(s). Pode fazer deploy.${NC}"
else
    echo -e "${RED}❌ Encontrados $errors erro(s) e $warnings aviso(s). Corrija antes do deploy.${NC}"
fi

echo ""
echo "🚀 Próximos passos:"
if [ $errors -eq 0 ]; then
    echo "1. Execute: npm run build (se ainda não fez)"
    echo "2. Execute: docker compose -f docker-compose-produção.yaml up -d"
    echo "3. Monitore: docker compose -f docker-compose-produção.yaml logs -f"
else
    echo "1. Corrija os erros listados acima"
    echo "2. Execute este script novamente"
    echo "3. Faça o build quando estiver tudo correto"
fi

exit $errors
