# Script para executar testes Jest com configurações otimizadas
# Resolve o problema de "Jest did not exit one second after the test run has completed"

param(
    [string]$TestType = "all",
    [switch]$Watch,
    [switch]$Coverage,
    [switch]$Debug,
    [switch]$Verbose
)

Write-Host "🧪 Executando testes Jest com configurações otimizadas..." -ForegroundColor Green

# Configurações base do Jest
$jestArgs = @(
    "--detectOpenHandles",
    "--forceExit",
    "--maxWorkers=1"
)

# Adicionar configurações baseadas nos parâmetros
if ($Watch) {
    $jestArgs += "--watch"
}

if ($Coverage) {
    $jestArgs += "--coverage"
}

if ($Debug) {
    $jestArgs += "--verbose", "--no-cache"
}

if ($Verbose) {
    $jestArgs += "--verbose"
}

# Configurar padrões de teste baseados no tipo
switch ($TestType.ToLower()) {
    "unit" {
        $jestArgs += "--testPathPattern=__tests__/unit"
        Write-Host "📋 Executando testes unitários..." -ForegroundColor Yellow
    }
    "integration" {
        $jestArgs += "--testPathPattern=__tests__/integration"
        Write-Host "🔗 Executando testes de integração..." -ForegroundColor Yellow
    }
    "e2e" {
        $jestArgs += "--testPathPattern=__tests__/e2e", "--runInBand"
        Write-Host "🌐 Executando testes end-to-end..." -ForegroundColor Yellow
    }
    "performance" {
        $jestArgs += "--testPathPattern=__tests__/performance"
        Write-Host "⚡ Executando testes de performance..." -ForegroundColor Yellow
    }
    "api" {
        $jestArgs += "--testPathPattern=__tests__/api"
        Write-Host "🔌 Executando testes de API..." -ForegroundColor Yellow
    }
    default {
        Write-Host "🎯 Executando todos os testes..." -ForegroundColor Yellow
    }
}

# Configurar variáveis de ambiente para testes
$env:NODE_ENV = "test"
$env:JEST_DETECT_OPEN_HANDLES = "true"

Write-Host "🚀 Comando: pnpm exec jest $($jestArgs -join ' ')" -ForegroundColor Cyan

try {
    # Executar Jest com as configurações
    pnpm exec jest @jestArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Todos os testes passaram!" -ForegroundColor Green
    } else {
        Write-Host "❌ Alguns testes falharam." -ForegroundColor Red
        exit $LASTEXITCODE
    }
} catch {
    Write-Host "💥 Erro ao executar testes: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    # Limpeza final
    Write-Host "🧹 Limpando recursos..." -ForegroundColor Gray
    
    # Forçar garbage collection se disponível
    if ($env:NODE_OPTIONS -notlike "*--expose-gc*") {
        $env:NODE_OPTIONS = "--expose-gc"
    }
    
    # Aguardar um pouco para garantir que todos os processos sejam finalizados
    Start-Sleep -Seconds 2
}

Write-Host "🎉 Execução de testes concluída!" -ForegroundColor Green 