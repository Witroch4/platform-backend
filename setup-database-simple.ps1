# Script simples para configurar o PostgreSQL
Write-Host "Configurando PostgreSQL (versão simples)..." -ForegroundColor Green

# Parar e remover containers existentes
Write-Host "Parando containers existentes..." -ForegroundColor Yellow
docker stop chatwit_postgres_dev 2>$null
docker rm chatwit_postgres_dev 2>$null

# Criar novo container PostgreSQL sem volumes persistentes
Write-Host "Criando novo container PostgreSQL..." -ForegroundColor Yellow
docker run --name chatwit_postgres_dev `
    -e POSTGRES_DB=socialwise `
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

# Configurar autenticação
Write-Host "Configurando autenticação..." -ForegroundColor Yellow
docker exec chatwit_postgres_dev bash -c "echo 'host all all all trust' >> /var/lib/postgresql/data/pg_hba.conf"
docker exec chatwit_postgres_dev psql -U postgres -c "SELECT pg_reload_conf();"

# Testar conexão interna
Write-Host "Testando conexão interna..." -ForegroundColor Yellow
docker exec chatwit_postgres_dev psql -U postgres -d socialwise -c "SELECT version();"

# Atualizar DATABASE_URL no .env
Write-Host "Atualizando configuração do banco..." -ForegroundColor Yellow
$envContent = Get-Content .env -Raw
$envContent = $envContent -replace 'DATABASE_URL="postgresql://postgres@localhost:5432/socialwise"', 'DATABASE_URL="postgresql://postgres@localhost:5432/socialwise"'
Set-Content .env $envContent

# Executar migrações
Write-Host "Executando migrações do Prisma..." -ForegroundColor Yellow
npx prisma migrate dev

Write-Host "Configuração concluída!" -ForegroundColor Green 