#!/bin/bash

# Script para build e deploy em produção

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}===== Iniciando build e push da imagem Socialwise Chatwit =====${NC}"

# Verificar se o arquivo .env.production existe
if [ ! -f ".env.production" ]; then
  echo -e "${RED}Erro: Arquivo .env.production não encontrado!${NC}"
  echo -e "Por favor, crie o arquivo .env.production com as variáveis de ambiente necessárias."
  exit 1
fi

# Definir o nome da imagem
IMAGE_NAME="witrocha/chatwit-social:latest"

# Carregar variáveis do .env.production para o ambiente atual
echo -e "${GREEN}Carregando variáveis de ambiente do .env.production...${NC}"
export $(grep -v '^#' .env.production | xargs)

# Build da imagem Docker
echo -e "${GREEN}Construindo imagem Docker de produção...${NC}"
docker-compose build

# Verificar se o build foi bem-sucedido
if [ $? -ne 0 ]; then
  echo -e "${RED}Erro durante o build da imagem Docker!${NC}"
  exit 1
fi

# Fazer login no DockerHub
echo -e "${GREEN}Fazendo login no DockerHub...${NC}"
docker login

# Verificar se o login foi bem-sucedido
if [ $? -ne 0 ]; then
  echo -e "${RED}Falha ao fazer login no DockerHub.${NC}"
  exit 1
fi

# Push da imagem para o DockerHub
echo -e "${GREEN}Enviando imagem para o DockerHub...${NC}"
docker push $IMAGE_NAME

# Verificar se o push foi bem-sucedido
if [ $? -ne 0 ]; then
  echo -e "${RED}Erro ao enviar imagem para o DockerHub!${NC}"
  exit 1
fi

echo -e "${GREEN}===== Imagem enviada com sucesso para o DockerHub! =====${NC}"
echo -e "Imagem: ${YELLOW}${IMAGE_NAME}${NC}"
echo -e "${YELLOW}Para implantar em produção, use:${NC}"
echo -e "docker pull ${IMAGE_NAME}"
echo -e "docker-compose up -d" 