# Script para gerenciar migracoes do banco de dados
# Uso: .\scripts\db-migrate.ps1 [dev|deploy|reset|studio]

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("dev", "deploy", "reset", "studio", "seed")]
    [string]$Action = "dev"
)

Write-Host "Gerenciando banco de dados: $Action" -ForegroundColor Green

# Verificar se o container está rodando
$containerName = "chatwit_dev"
$containerStatus = docker ps --filter "name=$containerName" --format "table {{.Names}}\t{{.Status}}" | Select-String $containerName

if (-not $containerStatus) {
    Write-Host "Container $containerName nao esta rodando. Inicie o ambiente primeiro." -ForegroundColor Red
    Write-Host "Execute: .\scripts\dev-setup.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "Container $containerName esta rodando" -ForegroundColor Green

switch ($Action) {
    "dev" {
        Write-Host "Executando migracoes de desenvolvimento..." -ForegroundColor Yellow
        docker exec $containerName pnpm exec prisma migrate dev
    }
    "deploy" {
        Write-Host "Aplicando migracoes de producao..." -ForegroundColor Yellow
        docker exec $containerName pnpm exec prisma migrate deploy
    }
    "reset" {
        Write-Host "ATENCAO: Isso ira resetar o banco de dados!" -ForegroundColor Red
        $confirmation = Read-Host "Digite 'SIM' para confirmar"
        if ($confirmation -eq "SIM") {
            Write-Host "Resetando banco de dados..." -ForegroundColor Yellow
            docker exec $containerName pnpm exec prisma migrate reset --force
        } else {
            Write-Host "Operacao cancelada" -ForegroundColor Yellow
        }
    }
    "studio" {
        Write-Host "Abrindo Prisma Studio..." -ForegroundColor Yellow
        Write-Host "Prisma Studio estara disponivel em: http://localhost:5555" -ForegroundColor Cyan
        docker exec -it $containerName pnpm exec prisma studio --hostname 0.0.0.0 --port 5555
    }
    "seed" {
        Write-Host "Executando seed do banco de dados..." -ForegroundColor Yellow
        docker exec $containerName pnpm exec prisma db seed
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "Operacao concluida com sucesso!" -ForegroundColor Green
} else {
    Write-Host "Erro na operacao" -ForegroundColor Red
} 