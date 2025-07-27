# Script para configurar o PostgreSQL e executar migrações
Write-Host "Configurando PostgreSQL para desenvolvimento..." -ForegroundColor Green

# Parar e remover containers existentes
Write-Host "Parando containers existentes..." -ForegroundColor Yellow
docker stop chatwit_postgres_test 2>$null
docker rm chatwit_postgres_test 2>$null
docker stop chatwit_postgres_simple 2>$null
docker rm chatwit_postgres_simple 2>$null

# Remover volumes antigos
Write-Host "Removendo volumes antigos..." -ForegroundColor Yellow
docker volume rm chatwit-social-dev_postgres_data 2>$null

# Criar novo container PostgreSQL
Write-Host "Criando novo container PostgreSQL..." -ForegroundColor Yellow
docker run --name chatwit_postgres_dev `
    -e POSTGRES_DB=socialWise `
    -e POSTGRES_USER=postgres `
    -e POSTGRES_PASSWORD=postgres `
    -p 5432:5432 `
    -d postgres:17

# Aguardar inicialização
Write-Host "Aguardando inicialização do PostgreSQL..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Verificar se o container está rodando
$containerStatus = docker ps --filter "name=chatwit_postgres_dev" --format "table {{.Status}}"
Write-Host "Status do container: $containerStatus" -ForegroundColor Cyan

# Testar conexão interna
Write-Host "Testando conexão interna..." -ForegroundColor Yellow
docker exec chatwit_postgres_dev psql -U postgres -d socialWise -c "SELECT version();"

# Configurar autenticação para aceitar conexões externas
Write-Host "Configurando autenticação..." -ForegroundColor Yellow
docker exec chatwit_postgres_dev bash -c "echo 'host all all all trust' >> /var/lib/postgresql/data/pg_hba.conf"
docker exec chatwit_postgres_dev psql -U postgres -c "SELECT pg_reload_conf();"

# Atualizar DATABASE_URL no .env
Write-Host "Atualizando configuração do banco..." -ForegroundColor Yellow
$envContent = Get-Content .env -Raw
$envContent = $envContent -replace 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/socialWise"', 'DATABASE_URL="postgresql://postgres@localhost:5432/socialWise"'
Set-Content .env $envContent

# Executar migrações
Write-Host "Executando migrações do Prisma..." -ForegroundColor Yellow
npx prisma migrate dev

Write-Host "Configuração concluída!" -ForegroundColor Green 