# Script de monitoramento da arquitetura unificada de workers
# PowerShell script para Windows

param(
    [switch]$Logs,
    [switch]$Status,
    [switch]$Health,
    [switch]$All
)

function Show-Help {
    Write-Host "🔧 Script de Monitoramento - Arquitetura Unificada de Workers" -ForegroundColor Green
    Write-Host ""
    Write-Host "Uso:" -ForegroundColor Yellow
    Write-Host "  .\monitor-workers.ps1 -Logs     # Mostrar logs em tempo real"
    Write-Host "  .\monitor-workers.ps1 -Status   # Mostrar status dos containers"
    Write-Host "  .\monitor-workers.ps1 -Health   # Verificar saúde dos workers"
    Write-Host "  .\monitor-workers.ps1 -All      # Executar todas as verificações"
    Write-Host ""
}

function Show-Status {
    Write-Host "📊 Status dos Containers:" -ForegroundColor Cyan
    docker compose -f docker-compose-produção.yaml ps
    Write-Host ""
}

function Show-Logs {
    Write-Host "📋 Logs do Worker Unificado (Ctrl+C para sair):" -ForegroundColor Cyan
    docker compose -f docker-compose-produção.yaml logs -f worker
}

function Show-Health {
    Write-Host "🏥 Verificação de Saúde dos Workers:" -ForegroundColor Cyan
    
    # Verificar se o container worker está rodando
    $workerStatus = docker compose -f docker-compose-produção.yaml ps worker --format "{{.State}}"
    
    if ($workerStatus -eq "running") {
        Write-Host "✅ Container 'worker' está rodando" -ForegroundColor Green
        
        # Verificar logs recentes para sinais de saúde
        Write-Host "📋 Últimas 20 linhas dos logs:" -ForegroundColor Yellow
        docker compose -f docker-compose-produção.yaml logs --tail=20 worker
        
        Write-Host ""
        Write-Host "💾 Uso de memória e CPU:" -ForegroundColor Yellow
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" $(docker compose -f docker-compose-produção.yaml ps -q worker)
        
    } else {
        Write-Host "❌ Container 'worker' não está rodando! Status: $workerStatus" -ForegroundColor Red
        
        Write-Host "📋 Últimos logs para diagnóstico:" -ForegroundColor Yellow
        docker compose -f docker-compose-produção.yaml logs --tail=50 worker
    }
    
    Write-Host ""
}

function Show-All {
    Show-Status
    Show-Health
    
    Write-Host "👀 Deseja ver os logs em tempo real? (y/N): " -ForegroundColor Yellow -NoNewline
    $response = Read-Host
    if ($response -eq "y" -or $response -eq "Y") {
        Show-Logs
    }
}

# Verificar se estamos no diretório correto
if (!(Test-Path "docker-compose-produção.yaml")) {
    Write-Error "❌ Execute este script no diretório raiz do projeto!"
    exit 1
}

# Executar ação baseada nos parâmetros
if ($Logs) {
    Show-Logs
} elseif ($Status) {
    Show-Status
} elseif ($Health) {
    Show-Health
} elseif ($All) {
    Show-All
} else {
    Show-Help
}
