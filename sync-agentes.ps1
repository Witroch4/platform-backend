# Script PowerShell para sincronizar agentes Dialogflow da origem
# Uso: .\sync-agentes.ps1 [usuarioId]

param(
    [string]$UsuarioId = ""
)

Write-Host "🔄 Iniciando sincronização de agentes Dialogflow..." -ForegroundColor Cyan

# Verificar se o Node.js está disponível
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js não encontrado. Instale o Node.js primeiro." -ForegroundColor Red
    exit 1
}

# Verificar se o arquivo de script existe
$scriptPath = "scripts/sync-agentes-origem.ts"
if (-not (Test-Path $scriptPath)) {
    Write-Host "❌ Script não encontrado: $scriptPath" -ForegroundColor Red
    exit 1
}

# Verificar se o arquivo .env existe
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  Arquivo .env não encontrado. Certifique-se de que as variáveis de ambiente estão configuradas." -ForegroundColor Yellow
}

try {
    # Executar o script TypeScript
    if ($UsuarioId) {
        Write-Host "👤 Sincronizando para usuário específico: $UsuarioId" -ForegroundColor Yellow
        npx tsx $scriptPath $UsuarioId
    } else {
        Write-Host "👥 Sincronizando para todos os usuários..." -ForegroundColor Yellow
        npx tsx $scriptPath
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Sincronização concluída com sucesso!" -ForegroundColor Green
    } else {
        Write-Host "❌ Erro na sincronização (código: $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
} catch {
    Write-Host "❌ Erro ao executar o script: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "🎉 Script finalizado!" -ForegroundColor Cyan