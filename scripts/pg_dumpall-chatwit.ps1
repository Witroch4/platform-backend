# Script PowerShell para fazer dump completo do banco PostgreSQL usando pg_dumpall
# Salva o arquivo na pasta backups com timestamp

# Carregar variáveis do .env.development
$envFile = ".env.development"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^(?<key>[^#=]+)=(?<value>.*)$") {
            $key = $matches['key'].Trim()
            $value = $matches['value'].Trim('"')
            [System.Environment]::SetEnvironmentVariable($key, $value)
        }
    }
}

# Extrair dados da DATABASE_URL se as variáveis não existirem
if ($env:DATABASE_URL) {
    $dbUrl = $env:DATABASE_URL.Trim('"')
    Write-Host "DATABASE_URL detectada: $dbUrl" -ForegroundColor Yellow
    # Parsing robusto usando URI
    try {
        $uri = [System.Uri]::new($dbUrl.Replace('postgresql://','http://'))
        $PGUSER = $uri.UserInfo.Split(':')[0]
        $PGPASSWORD = $uri.UserInfo.Split(':')[1]
        $PGHOST = $uri.Host
        $PGPORT = $uri.Port
    } catch {
        Write-Host "❌ Erro ao fazer parsing da DATABASE_URL." -ForegroundColor Red
    }
}

# Configurações do banco
if (-not $PGUSER) { $PGUSER = $env:POSTGRES_USER }
if (-not $PGPASSWORD) { $PGPASSWORD = $env:POSTGRES_PASSWORD }
if (-not $PGHOST) { $PGHOST = $env:POSTGRES_HOST }
if (-not $PGPORT) { $PGPORT = $env:POSTGRES_PORT }

if (-not $PGUSER -or -not $PGPASSWORD -or -not $PGHOST -or -not $PGPORT) {
    Write-Host "❌ Variáveis de ambiente do banco não encontradas. Verifique o arquivo .env.development." -ForegroundColor Red
    exit 1
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "backups"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
$backupFile = "$backupDir/pg_dumpall_chatwit_$timestamp.sql"

Write-Host "🔄 Iniciando dump completo do PostgreSQL com pg_dumpall..." -ForegroundColor Cyan

# Executar o pg_dumpall
$env:PGPASSWORD = $PGPASSWORD
$cmd = "pg_dumpall -h $PGHOST -p $PGPORT -U $PGUSER -f `"$backupFile`""

try {
    iex $cmd
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Dump completo salvo em: $backupFile" -ForegroundColor Green
    } else {
        Write-Host "❌ Erro ao executar o pg_dumpall!" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Erro ao executar o comando pg_dumpall:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
} 