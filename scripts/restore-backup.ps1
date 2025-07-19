# Script para restaurar backup do Chatwit Social
param(
    [Parameter(Mandatory=$false)]
    [string]$BackupFile
)

Write-Host "🔄 Script de Restauração de Backup - Chatwit Social" -ForegroundColor Cyan
Write-Host ""

# Verificar se o arquivo foi especificado
if (-not $BackupFile) {
    Write-Host "📋 Backups disponíveis:" -ForegroundColor Yellow
    Write-Host ""
    
    $backupFiles = Get-ChildItem -Path "backups" -Filter "*.json" | Sort-Object LastWriteTime -Descending
    
    for ($i = 0; $i -lt $backupFiles.Count; $i++) {
        $file = $backupFiles[$i]
        $date = $file.LastWriteTime.ToString("dd/MM/yyyy HH:mm")
        $size = [math]::Round($file.Length / 1MB, 2)
        Write-Host "  $($i + 1). $($file.Name)" -ForegroundColor White
        Write-Host "     📅 $date | 📦 $size MB" -ForegroundColor Gray
    }
    
    Write-Host ""
    $choice = Read-Host "Escolha o número do backup para restaurar (ou 'q' para sair)"
    
    if ($choice -eq 'q') {
        Write-Host "❌ Operação cancelada." -ForegroundColor Red
        exit
    }
    
    $index = [int]$choice - 1
    if ($index -ge 0 -and $index -lt $backupFiles.Count) {
        $BackupFile = $backupFiles[$index].Name
    } else {
        Write-Host "❌ Opção inválida!" -ForegroundColor Red
        exit
    }
}

# Verificar se o arquivo existe
$backupPath = "backups\$BackupFile"
if (-not (Test-Path $backupPath)) {
    Write-Host "❌ Arquivo de backup não encontrado: $backupPath" -ForegroundColor Red
    exit
}

Write-Host "📁 Backup selecionado: $BackupFile" -ForegroundColor Green
Write-Host ""

# Confirmação final
Write-Host "⚠️  ATENÇÃO: Esta operação irá substituir todos os dados atuais do banco!" -ForegroundColor Red
Write-Host "📋 Certifique-se de que você tem um backup atual antes de continuar." -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "Digite 'CONFIRMAR' para prosseguir com a restauração"
if ($confirm -ne "CONFIRMAR") {
    Write-Host "❌ Restauração cancelada." -ForegroundColor Red
    exit
}

Write-Host ""
Write-Host "🔄 Iniciando restauração..." -ForegroundColor Yellow

try {
    # Executar o script de restauração
    $result = & tsx scripts/restore-backup.ts $BackupFile 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Restauração concluída com sucesso!" -ForegroundColor Green
        Write-Host "🔄 Reinicie a aplicação para aplicar as mudanças." -ForegroundColor Yellow
    } else {
        Write-Host ""
        Write-Host "❌ Erro durante a restauração!" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
    }
} catch {
    Write-Host ""
    Write-Host "❌ Erro ao executar o script de restauração:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "Pressione qualquer tecla para sair..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") 