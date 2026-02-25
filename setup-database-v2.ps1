# Script para configurar o PostgreSQL com configuração personalizada
Write-Host "Configurando PostgreSQL para desenvolvimento (v2)..." -ForegroundColor Green

# Parar e remover containers existentes
Write-Host "Parando containers existentes..." -ForegroundColor Yellow
docker stop chatwit_postgres_dev 2>$null
docker rm chatwit_postgres_dev 2>$null

# Criar diretório para configurações
Write-Host "Criando diretório para configurações..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "./postgres-config" | Out-Null

# Copiar arquivo de configuração
Write-Host "Copiando arquivo de configuração..." -ForegroundColor Yellow
Copy-Item "pg_hba.conf" "./postgres-config/"

# Criar novo container PostgreSQL com configuração personalizada
Write-Host "Criando novo container PostgreSQL..." -ForegroundColor Yellow
docker run --name chatwit_postgres_dev `
    -e POSTGRES_DB=socialwise `
    -e POSTGRES_USER=postgres `
    -e POSTGRES_PASSWORD=postgres `
    -p 5432:5432 `
    -v "${PWD}/postgres-config/pg_hba.conf:/var/lib/postgresql/data/pg_hba.conf" `
    -d postgres:17

# Aguardar inicialização
Write-Host "Aguardando inicialização do PostgreSQL..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Verificar se o container está rodando
$containerStatus = docker ps --filter "name=chatwit_postgres_dev" --format "table {{.Status}}"
Write-Host "Status do container: $containerStatus" -ForegroundColor Cyan

# Testar conexão interna
Write-Host "Testando conexão interna..." -ForegroundColor Yellow
docker exec chatwit_postgres_dev psql -U postgres -d socialwise -c "SELECT version();"

# Recarregar configuração
Write-Host "Recarregando configuração..." -ForegroundColor Yellow
docker exec chatwit_postgres_dev psql -U postgres -c "SELECT pg_reload_conf();"

# Atualizar DATABASE_URL no .env
Write-Host "Atualizando configuração do banco..." -ForegroundColor Yellow
$envContent = Get-Content .env -Raw
$envContent = $envContent -replace 'DATABASE_URL="postgresql://postgres@localhost:5432/socialwise"', 'DATABASE_URL="postgresql://postgres@localhost:5432/socialwise"'
Set-Content .env $envContent

# Executar migrações
Write-Host "Executando migrações do Prisma..." -ForegroundColor Yellow
npx prisma migrate dev

Write-Host "Configuração concluída!" -ForegroundColor Green 