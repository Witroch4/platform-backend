#!/bin/bash

# Script para executar a aplicação em produção

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}===== Iniciando Socialwise Chatwit em produção =====${NC}"

# Verificar se o arquivo .env.production existe
if [ ! -f ".env.production" ]; then
  echo -e "${RED}Erro: Arquivo .env.production não encontrado!${NC}"
  echo -e "Por favor, crie o arquivo .env.production com as variáveis de ambiente necessárias."
  exit 1
fi

# Carregar variáveis do .env.production para o ambiente atual
echo -e "${GREEN}Carregando variáveis de ambiente...${NC}"
export $(grep -v '^#' .env.production | xargs)

# Definir o nome da imagem
IMAGE_NAME="witrocha/chatwit-social:latest"

# Baixar a imagem mais recente
echo -e "${GREEN}Baixando a imagem mais recente do DockerHub...${NC}"
docker pull $IMAGE_NAME

# Verificar se o download foi bem-sucedido
if [ $? -ne 0 ]; then
  echo -e "${RED}Erro ao baixar a imagem do DockerHub!${NC}"
  exit 1
fi

# Parar e remover contêineres existentes
echo -e "${GREEN}Parando contêineres existentes...${NC}"
docker-compose down

# Iniciar os novos contêineres
echo -e "${GREEN}Iniciando contêineres em produção...${NC}"
docker-compose up -d

# Verificar se os contêineres estão rodando
echo -e "${GREEN}Verificando status dos contêineres...${NC}"
docker-compose ps

echo -e "${GREEN}===== Socialwise Chatwit em produção está no ar! =====${NC}"
echo -e "Aplicação disponível em: ${YELLOW}${NEXT_PUBLIC_URL}${NC}"
echo -e "Bull Board disponível em: ${YELLOW}${NEXT_PUBLIC_URL}:${BULL_BOARD_PORT}${NC}" 