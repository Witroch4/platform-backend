# Script para diagnosticar e resolver problema de polling excessivo
# Autor: Assistente IA
# Data: $(Get-Date)

Write-Host "[DEBUG] Iniciando diagnostico de polling excessivo..." -ForegroundColor Yellow

# 1. Verificar processos Node.js ativos
Write-Host "`n[DEBUG] Verificando processos Node.js ativos..." -ForegroundColor Cyan
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "Encontrados $($nodeProcesses.Count) processos Node.js:" -ForegroundColor Green
    $nodeProcesses | ForEach-Object {
        Write-Host "  - PID: $($_.Id), CPU: $([math]::Round($_.CPU, 2))s, Memoria: $([math]::Round($_.WorkingSet64 / 1MB, 2))MB" -ForegroundColor White
    }
} else {
    Write-Host "Nenhum processo Node.js encontrado." -ForegroundColor Red
}

# 2. Verificar conexoes de rede ativas
Write-Host "`n[DEBUG] Verificando conexoes de rede ativas..." -ForegroundColor Cyan
$connections = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Where-Object { $_.RemotePort -eq 3000 -or $_.LocalPort -eq 3000 }
if ($connections) {
    Write-Host "Encontradas $($connections.Count) conexoes ativas na porta 3000:" -ForegroundColor Green
    $connections | ForEach-Object {
        Write-Host "  - Local: $($_.LocalAddress):$($_.LocalPort) -> Remote: $($_.RemoteAddress):$($_.RemotePort)" -ForegroundColor White
    }
} else {
    Write-Host "Nenhuma conexao ativa encontrada na porta 3000." -ForegroundColor Yellow
}

# 3. Verificar logs do Docker (se estiver usando)
Write-Host "`n[DEBUG] Verificando containers Docker..." -ForegroundColor Cyan
try {
    $containers = docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>$null
    if ($containers) {
        Write-Host "Containers Docker ativos:" -ForegroundColor Green
        Write-Host $containers -ForegroundColor White
    } else {
        Write-Host "Nenhum container Docker ativo encontrado." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Docker nao esta disponivel ou nao ha containers ativos." -ForegroundColor Yellow
}

# 4. Verificar uso de memoria e CPU
Write-Host "`n[DEBUG] Verificando uso de recursos do sistema..." -ForegroundColor Cyan
$cpuUsage = Get-Counter "\Processor(_Total)\% Processor Time" -SampleInterval 1 -MaxSamples 1
$memoryUsage = Get-Counter "\Memory\Available MBytes" -SampleInterval 1 -MaxSamples 1
Write-Host "CPU: $([math]::Round($cpuUsage.CounterSamples[0].CookedValue, 2))%" -ForegroundColor White
Write-Host "Memoria disponivel: $([math]::Round($memoryUsage.CounterSamples[0].CookedValue, 2))MB" -ForegroundColor White

# 5. Sugestoes de resolucao
Write-Host "`n[DEBUG] Sugestoes de resolucao:" -ForegroundColor Yellow
Write-Host "1. Reiniciar o servidor de desenvolvimento:" -ForegroundColor White
Write-Host "   - Pressione Ctrl+C para parar o servidor atual" -ForegroundColor Gray
Write-Host "   - Execute: npm run dev" -ForegroundColor Gray

Write-Host "`n2. Limpar cache do Next.js:" -ForegroundColor White
Write-Host "   - Delete a pasta .next" -ForegroundColor Gray
Write-Host "   - Execute: npm run dev" -ForegroundColor Gray

Write-Host "`n3. Verificar logs do console para identificar loops infinitos:" -ForegroundColor White
Write-Host "   - Abra o DevTools (F12)" -ForegroundColor Gray
Write-Host "   - Verifique a aba Console" -ForegroundColor Gray

Write-Host "`n4. Se o problema persistir, reinicie o Docker:" -ForegroundColor White
Write-Host "   - docker-compose down" -ForegroundColor Gray
Write-Host "   - docker-compose up -d" -ForegroundColor Gray

Write-Host "`n[DEBUG] Diagnostico concluido!" -ForegroundColor Green 