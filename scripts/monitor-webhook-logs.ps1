# Script para monitorar logs de webhook em tempo real
# Uso: .\scripts\monitor-webhook-logs.ps1

param(
    [string]$ContainerName = "chatwit_dev",
    [int]$Lines = 50,
    [switch]$Follow
)

Write-Host "📊 Monitorando logs de webhook..." -ForegroundColor Cyan
Write-Host "🐳 Container: $ContainerName" -ForegroundColor Yellow

try {
    # Comando base para logs do Docker
    $logCommand = "docker logs"
    
    if ($Follow) {
        Write-Host "🔄 Modo follow ativado - pressione Ctrl+C para parar" -ForegroundColor Green
        $logCommand += " -f"
    }
    
    $logCommand += " --tail $Lines $ContainerName"
    
    # Filtrar apenas logs relacionados a webhook
    $filterCommand = "$logCommand | Select-String -Pattern 'webhook|Webhook|socialwise|Socialwise|cache|Cache' -Context 2"
    
    Write-Host "🔍 Executando: $filterCommand" -ForegroundColor Yellow
    Write-Host "─" * 80 -ForegroundColor Gray
    
    # Executar o comando
    Invoke-Expression $filterCommand
    
} catch {
    Write-Host "❌ Erro ao monitorar logs: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Verifique se o container '$ContainerName' está rodando" -ForegroundColor Yellow
    exit 1
}

Write-Host "─" * 80 -ForegroundColor Gray
Write-Host "📊 Monitoramento finalizado" -ForegroundColor Cyan
