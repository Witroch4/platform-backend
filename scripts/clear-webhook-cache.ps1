# Script para limpar cache de webhook
# Uso: .\scripts\clear-webhook-cache.ps1

param(
    [string]$BaseUrl = "http://localhost:3000",
    [switch]$Force
)

Write-Host "🧹 Limpando cache de webhook..." -ForegroundColor Cyan

try {
    # URL da API de limpeza de cache
    $url = "$BaseUrl/api/admin/webhook-test/clear-cache"
    
    Write-Host "📡 Enviando requisição para: $url" -ForegroundColor Yellow
    
    # Fazer a requisição POST
    $response = Invoke-RestMethod -Uri $url -Method POST -ContentType "application/json" -TimeoutSec 30
    
    if ($response.success) {
        Write-Host "✅ Cache limpo com sucesso!" -ForegroundColor Green
        Write-Host "🗑️  Chaves removidas: $($response.keysCleared)" -ForegroundColor Green
        Write-Host "💬 Mensagem: $($response.message)" -ForegroundColor Green
    } else {
        Write-Host "❌ Erro ao limpar cache: $($response.error)" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "❌ Erro na requisição: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode
        Write-Host "📊 Status Code: $statusCode" -ForegroundColor Red
    }
    
    if (-not $Force) {
        Write-Host "💡 Dica: Use -Force para ignorar erros de autenticação" -ForegroundColor Yellow
    }
    
    exit 1
}

Write-Host "🎉 Cache limpo com sucesso! Agora você pode testar o webhook infinito." -ForegroundColor Green
