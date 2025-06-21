function wit {
    Write-Host "=== WIT - Macro de Deploy ===" -ForegroundColor Cyan
    Write-Host ""
    
    # Arquivo para salvar o último commit
    $lastCommitFile = ".\wit-last-commit.txt"
    
    # Executar git status
    Write-Host "Verificando status do git..." -ForegroundColor Yellow
    git status
    Write-Host ""
    
    # Executar git add .
    Write-Host "Adicionando arquivos..." -ForegroundColor Yellow
    git add .
    Write-Host "Arquivos adicionados!" -ForegroundColor Green
    Write-Host ""
    
    # Ler o último commit usado ou usar valor padrão
    $defaultMessage = "melhorias nos lead e ESPELHO v2"
    if (Test-Path $lastCommitFile) {
        $lastCommit = Get-Content $lastCommitFile -Raw
        if (![string]::IsNullOrWhiteSpace($lastCommit)) {
            $defaultMessage = $lastCommit.Trim()
        }
    }
    
    # Pedir mensagem de commit
    Write-Host "Último commit usado: " -NoNewline -ForegroundColor Gray
    Write-Host "'$defaultMessage'" -ForegroundColor Cyan
    $commitMessage = Read-Host "Digite a mensagem do commit (pressione Enter para usar o último)"
    
    if ([string]::IsNullOrWhiteSpace($commitMessage)) {
        $commitMessage = $defaultMessage
    }
    
    # Salvar o commit atual para próxima vez
    $commitMessage | Out-File -FilePath $lastCommitFile -Encoding UTF8 -NoNewline
    
    # Executar git commit
    Write-Host "Fazendo commit..." -ForegroundColor Yellow
    git commit -m "$commitMessage"
    Write-Host "Commit realizado!" -ForegroundColor Green
    Write-Host ""
    
    # Executar git push
    Write-Host "Enviando para o repositório..." -ForegroundColor Yellow
    git push origin master
    Write-Host "Push realizado!" -ForegroundColor Green
    Write-Host ""
    
    # Perguntar sobre build para produção
    $buildResponse = Read-Host "Deseja fazer build para produção? (s/sim para confirmar)"
    
    if ($buildResponse -eq "s" -or $buildResponse -eq "sim" -or $buildResponse -eq "S" -or $buildResponse -eq "SIM") {
        Write-Host "Iniciando build para produção..." -ForegroundColor Yellow
        docker compose build
        Write-Host "Build concluído!" -ForegroundColor Green
        Write-Host ""
        
        Write-Host "Enviando imagem para o Docker Hub..." -ForegroundColor Yellow
        docker compose push
        Write-Host "Push para Docker Hub concluído!" -ForegroundColor Green
    } else {
        Write-Host "Build cancelado." -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "=== WIT - Processo Concluído ===" -ForegroundColor Cyan
}

Write-Host "Macro 'wit' carregada com sucesso!" -ForegroundColor Green 