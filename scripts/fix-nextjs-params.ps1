#!/usr/bin/env pwsh

# Script para corrigir automaticamente o problema de params não aguardados no Next.js 15
# Executa: .\scripts\fix-nextjs-params.ps1

Write-Host "🔧 Corrigindo parâmetros dinâmicos para Next.js 15..." -ForegroundColor Yellow

# Função para processar um arquivo
function Fix-ParamsInFile {
    param([string]$FilePath)
    
    if (-not (Test-Path $FilePath)) {
        return
    }
    
    $content = Get-Content $FilePath -Raw
    $originalContent = $content
    
    # Padrão para encontrar funções que usam params
    $pattern = 'export async function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(\s*[^)]*,\s*\{\s*params\s*\}\s*:\s*\{[^}]*\}\s*\)\s*\{'
    
    if ($content -match $pattern) {
        Write-Host "📝 Processando: $FilePath" -ForegroundColor Cyan
        
        # Substituir a declaração da função para aguardar params
        $content = $content -replace '(\{\s*params\s*\}\s*:\s*\{[^}]*\})', '(await $1)'
        
        # Encontrar e corrigir usos de params.id, params.slug, etc.
        $content = $content -replace 'const\s+\{\s*([^}]+)\s*\}\s*=\s*params;', 'const { $1 } = await params;'
        
        # Se o conteúdo mudou, salvar o arquivo
        if ($content -ne $originalContent) {
            Set-Content -Path $FilePath -Value $content -NoNewline
            Write-Host "✅ Corrigido: $FilePath" -ForegroundColor Green
            return $true
        }
    }
    
    return $false
}

# Encontrar todos os arquivos route.ts em diretórios dinâmicos
$routeFiles = Get-ChildItem -Path "app" -Recurse -Filter "route.ts" | Where-Object {
    $_.Directory.Name -match '^\[.*\]$' -or 
    $_.Directory.Parent.Name -match '^\[.*\]$' -or
    $_.Directory.Parent.Parent.Name -match '^\[.*\]$'
}

$fixedCount = 0

foreach ($file in $routeFiles) {
    if (Fix-ParamsInFile -FilePath $file.FullName) {
        $fixedCount++
    }
}

Write-Host "`n🎉 Processo concluído!" -ForegroundColor Green
Write-Host "📊 Arquivos corrigidos: $fixedCount" -ForegroundColor Cyan

if ($fixedCount -gt 0) {
    Write-Host "`n💡 Dica: Execute 'npm run build' para verificar se todos os erros foram corrigidos." -ForegroundColor Yellow
} else {
    Write-Host "`nℹ️  Nenhum arquivo precisou ser corrigido." -ForegroundColor Blue
} 