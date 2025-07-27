# Script para configurar ambiente de desenvolvimento
# Uso: .\scripts\dev-setup.ps1 [local|ngrok]

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("local", "ngrok")]
    [string]$Environment = "local"
)

Write-Host "Configurando ambiente de desenvolvimento: $Environment" -ForegroundColor Green

# Verificar se Docker está rodando
try {
    docker info | Out-Null
    Write-Host "Docker esta rodando" -ForegroundColor Green
} catch {
    Write-Host "Docker nao esta rodando. Inicie o Docker Desktop primeiro." -ForegroundColor Red
    exit 1
}

# Criar rede se não existir
Write-Host "Verificando rede Docker..." -ForegroundColor Yellow
docker network ls | Select-String "minha_rede" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Criando rede 'minha_rede'..." -ForegroundColor Yellow
    docker network create minha_rede
    Write-Host "Rede criada com sucesso" -ForegroundColor Green
} else {
    Write-Host "Rede 'minha_rede' ja existe" -ForegroundColor Green
}

# Parar containers existentes
Write-Host "Parando containers existentes..." -ForegroundColor Yellow
docker-compose -f docker-compose-dev.yml down 2>$null
docker-compose -f docker-compose-dev-ngrok.yml down 2>$null

# Escolher arquivo de compose baseado no ambiente
$composeFile = if ($Environment -eq "ngrok") {
    "docker-compose-dev-ngrok.yml"
} else {
    "docker-compose-dev.yml"
}

Write-Host "Iniciando ambiente com: $composeFile" -ForegroundColor Yellow

# Construir e iniciar containers
docker-compose -f $composeFile up --build -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "Ambiente iniciado com sucesso!" -ForegroundColor Green
    
    if ($Environment -eq "ngrok") {
        Write-Host "Ngrok disponivel em: http://localhost:4040" -ForegroundColor Cyan
        Write-Host "URL publica: https://beagle-great-awfully.ngrok-free.app" -ForegroundColor Cyan
    }
    
    Write-Host "Bull Board disponivel em: http://localhost:3005" -ForegroundColor Cyan
    Write-Host "PostgreSQL disponivel em: localhost:5432" -ForegroundColor Cyan
    Write-Host "Redis disponivel em: localhost:6379" -ForegroundColor Cyan
    
    Write-Host "`nComandos uteis:" -ForegroundColor Yellow
    Write-Host "  - Ver logs: docker-compose -f $composeFile logs -f" -ForegroundColor White
    Write-Host "  - Parar: docker-compose -f $composeFile down" -ForegroundColor White
    Write-Host "  - Reiniciar: docker-compose -f $composeFile restart" -ForegroundColor White
    Write-Host "  - Executar migracoes: docker exec chatwit_dev npx prisma migrate dev" -ForegroundColor White
} else {
    Write-Host "Erro ao iniciar ambiente" -ForegroundColor Red
    exit 1
} 