# Script para preparar testes de webhook infinito
# Uso: .\scripts\test-webhook-infinito.ps1

param(
    [string]$BaseUrl = "http://localhost:3000",
    [switch]$ClearCache,
    [switch]$DisableIdempotency,
    [switch]$MonitorLogs,
    [int]$IdempotencyDuration = 300,
    [switch]$All
)

Write-Host "🚀 Preparando ambiente para testes de webhook infinito..." -ForegroundColor Cyan

# Função para limpar cache
function Clear-WebhookCache {
    Write-Host "🧹 Limpando cache de webhook..." -ForegroundColor Yellow
    
    try {
        $url = "$BaseUrl/api/admin/webhook-test/clear-cache"
        $response = Invoke-RestMethod -Uri $url -Method POST -ContentType "application/json" -TimeoutSec 30
        
        if ($response.success) {
            Write-Host "✅ Cache limpo com sucesso!" -ForegroundColor Green
            Write-Host "🗑️  Chaves removidas: $($response.keysCleared)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ Erro ao limpar cache: $($response.error)" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "❌ Erro na limpeza de cache: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Função para desabilitar idempotência
function Disable-Idempotency {
    Write-Host "🛡️  Desabilitando detecção de duplicatas..." -ForegroundColor Yellow
    
    try {
        $url = "$BaseUrl/api/admin/webhook-test/disable-idempotency"
        $body = @{
            disable = $true
            duration = $IdempotencyDuration
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri $url -Method POST -ContentType "application/json" -Body $body -TimeoutSec 30
        
        if ($response.success) {
            Write-Host "✅ Idempotência desabilitada!" -ForegroundColor Green
            Write-Host "⏰ Expira em: $($response.expiresAt)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ Erro ao desabilitar idempotência: $($response.error)" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "❌ Erro ao desabilitar idempotência: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Função para monitorar logs
function Start-LogMonitoring {
    Write-Host "📊 Iniciando monitoramento de logs..." -ForegroundColor Yellow
    Write-Host "🔍 Pressione Ctrl+C para parar o monitoramento" -ForegroundColor Cyan
    
    try {
        $logCommand = "docker logs -f --tail 50 chatwit_dev | Select-String -Pattern 'webhook|Webhook|socialwise|Socialwise|cache|Cache|duplicate|Duplicate' -Context 2"
        Invoke-Expression $logCommand
    } catch {
        Write-Host "❌ Erro no monitoramento de logs: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Executar ações baseadas nos parâmetros
$success = $true

if ($All -or $ClearCache) {
    $success = $success -and (Clear-WebhookCache)
}

if ($All -or $DisableIdempotency) {
    $success = $success -and (Disable-Idempotency)
}

if ($success) {
    Write-Host "🎉 Ambiente preparado com sucesso!" -ForegroundColor Green
    Write-Host "💡 Agora você pode:" -ForegroundColor Cyan
    Write-Host "   1. Acessar: $BaseUrl/admin/webhook-test" -ForegroundColor White
    Write-Host "   2. Ativar o modo de teste infinito" -ForegroundColor White
    Write-Host "   3. Configurar o intervalo desejado" -ForegroundColor White
    Write-Host "   4. Iniciar os testes" -ForegroundColor White
    
    if ($MonitorLogs) {
        Write-Host "📊 Iniciando monitoramento de logs..." -ForegroundColor Yellow
        Start-LogMonitoring
    }
} else {
    Write-Host "❌ Falha na preparação do ambiente" -ForegroundColor Red
    exit 1
}
