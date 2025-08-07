#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Diagnóstico de filas em produção
.DESCRIPTION
    Script para diagnosticar problemas de processamento de filas BullMQ em produção
.EXAMPLE
    .\scripts\diagnose-queue-production.ps1
#>

param(
    [switch]$Detailed,
    [switch]$FixIssues
)

Write-Host "🔍 Diagnóstico de Filas em Produção" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

try {
    # Verificar se estamos em produção
    if ($env:NODE_ENV -ne "production") {
        Write-Warning "⚠️ NODE_ENV não está definido como 'production'"
        Write-Host "   Ambiente atual: $($env:NODE_ENV)" -ForegroundColor Yellow
        Write-Host ""
    }

    # Executar diagnóstico JavaScript
    Write-Host "📊 Executando diagnóstico detalhado..." -ForegroundColor Green
    node scripts/diagnose-queue-production.js

    if ($Detailed) {
        Write-Host ""
        Write-Host "📋 Informações detalhadas do Docker:" -ForegroundColor Cyan
        
        # Verificar containers em execução
        Write-Host "   🐳 Containers ativos:"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | Where-Object { $_ -match "chatwit|worker" }
        
        # Verificar recursos dos containers
        Write-Host ""
        Write-Host "   💻 Uso de recursos:"
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | Where-Object { $_ -match "chatwit|worker" }
        
        # Verificar logs recentes do worker
        Write-Host ""
        Write-Host "   📝 Logs recentes do worker (últimas 10 linhas):"
        docker logs --tail 10 $(docker ps -q --filter "name=worker_agendamento") 2>$null
    }

    if ($FixIssues) {
        Write-Host ""
        Write-Host "🔧 Aplicando correções automáticas..." -ForegroundColor Yellow
        
        # Reiniciar worker se necessário
        Write-Host "   🔄 Reiniciando worker..."
        docker restart $(docker ps -q --filter "name=worker_agendamento")
        
        # Aguardar reinicialização
        Start-Sleep -Seconds 5
        
        Write-Host "   ✅ Worker reiniciado" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "💡 Próximos passos recomendados:" -ForegroundColor Cyan
    Write-Host "   1. Se houver jobs aguardando, considere aumentar LEADS_CHATWIT_CONCURRENCY" -ForegroundColor White
    Write-Host "   2. Se houver falhas, verifique logs detalhados: docker logs worker_agendamento" -ForegroundColor White
    Write-Host "   3. Se recursos estão limitados, ajuste limits no docker-compose-prod.yml" -ForegroundColor White
    Write-Host "   4. Para diagnóstico detalhado: .\scripts\diagnose-queue-production.ps1 -Detailed" -ForegroundColor White

} catch {
    Write-Error "❌ Erro durante diagnóstico: $($_.Exception.Message)"
    exit 1
}

Write-Host ""
Write-Host "✅ Diagnóstico concluído" -ForegroundColor Green