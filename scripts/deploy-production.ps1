# Script PowerShell para deploy em produção
# Execute este script na pasta raiz do projeto

param(
    [switch]$Force,
    [switch]$SkipMigrationCheck,
    [switch]$WithSeed,
    [string]$Schema = "prisma/schema.prisma"
)

Write-Host "🚀 Iniciando deploy de produção..." -ForegroundColor Green

# Verificar se está na pasta raiz do projeto
if (-not (Test-Path "package.json")) {
    Write-Error "❌ Execute este script na pasta raiz do projeto!"
    exit 1
}

# Verificar se NODE_ENV está definido como production
if ($env:NODE_ENV -ne "production") {
    Write-Warning "⚠️ NODE_ENV não está definido como 'production'"
    if (-not $Force) {
        $response = Read-Host "Continuar mesmo assim? (y/N)"
        if ($response -ne "y" -and $response -ne "Y") {
            Write-Host "❌ Deploy cancelado pelo usuário."
            exit 1
        }
    }
}

# Verificar se DATABASE_URL está definida
if (-not $env:DATABASE_URL) {
    Write-Error "❌ DATABASE_URL não está definida!"
    exit 1
}

# Construir argumentos para o script
$args = @()
if ($Force) {
    $args += "--force-production=true"
}
if ($SkipMigrationCheck) {
    $args += "--skip-migration-check=true"
}
$args += "--schema=$Schema"

# Definir variáveis de ambiente para o seed
if ($WithSeed) {
    $env:PRISMA_RUN_SEED = "true"
} else {
    $env:PRISMA_RUN_SEED = "false"
}

Write-Host "🔧 Executando db-prepare-production.js..." -ForegroundColor Blue
Write-Host "📝 Argumentos: $($args -join ' ')" -ForegroundColor Gray

try {
    # Executar o script de preparação do banco
    node scripts/db-prepare-production.js @args
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Deploy de produção concluído com sucesso!" -ForegroundColor Green
    } else {
        Write-Error "❌ Falha no deploy de produção!"
        exit $LASTEXITCODE
    }
} catch {
    Write-Error "❌ Erro ao executar script: $_"
    exit 1
}

Write-Host "🎉 Processo finalizado!" -ForegroundColor Green