<#
.SYNOPSIS
    Script para limpeza completa de arquivos residuais do Node.js, npm e de um projeto específico.
.DESCRIPTION
    Este script foi criado para resolver problemas de um ambiente Node.js/npm corrompido.
    Ele remove pastas de cache do npm, configurações globais e a pasta de instalação padrão do Node.js.
    Também limpa o diretório de um projeto específico (node_modules, package-lock.json).
.NOTES
    VERSÃO: 1.1 - Corrigido erro de referência de variável.
    AUTOR: Assistente AI
    ATENÇÃO: Execute este script com cautela. Ele apaga arquivos e pastas permanentemente.
#>

# --- CONFIGURAÇÃO ---
# Edite esta linha para apontar para a pasta raiz do seu projeto.
$caminhoDoProjeto = "D:\nextjs\Chatwit-Social-dev"

# --- INÍCIO DO SCRIPT ---

# Exibe um aviso para o usuário
Write-Host "===================================================================" -ForegroundColor Yellow
Write-Host "AVISO IMPORTANTE!" -ForegroundColor Yellow
Write-Host "Este script irá apagar permanentemente arquivos e pastas do Node.js e do npm." -ForegroundColor Yellow
Write-Host "Certifique-se de que você já DESINSTALOU o Node.js pelo painel de controle." -ForegroundColor Yellow
Write-Host "===================================================================" -ForegroundColor Yellow
Read-Host "Pressione ENTER para continuar ou CTRL+C para cancelar agora."

# Função para remover uma pasta ou arquivo de forma segura
function Remover-ItemSeguro {
    param(
        [string]$Caminho,
        [string]$Tipo # 'Pasta' ou 'Arquivo'
    )
    if (Test-Path $Caminho) {
        # LINHA CORRIGIDA AQUI: Usando ${} para delimitar as variáveis
        Write-Host "Removendo ${Tipo}: ${Caminho}" -ForegroundColor Cyan
        try {
            Remove-Item -Path $Caminho -Recurse -Force -ErrorAction Stop
            Write-Host "$Tipo removido com sucesso!" -ForegroundColor Green
        } catch {
            Write-Host "ERRO ao remover $Caminho. Talvez precise de permissão de Administrador." -ForegroundColor Red
        }
    } else {
        Write-Host "$Tipo não encontrado (o que é bom): $Caminho" -ForegroundColor Gray
    }
}

# --- PARTE 1: LIMPEZA DO SISTEMA ---
Write-Host "`n--- Iniciando limpeza do sistema (arquivos globais do Node/NPM)... ---"

# Caminhos comuns de arquivos residuais
$npmRoamingPath = Join-Path $env:APPDATA "npm"
$npmCacheRoamingPath = Join-Path $env:APPDATA "npm-cache"
$npmrcGlobalPath = Join-Path $env:USERPROFILE ".npmrc"
$nodeInstallPath64 = Join-Path ${env:ProgramFiles} "nodejs"
$nodeInstallPath86 = Join-Path ${env:ProgramFiles(x86)} "nodejs"

# Executa a remoção
Remover-ItemSeguro -Caminho $npmRoamingPath -Tipo "Pasta"
Remover-ItemSeguro -Caminho $npmCacheRoamingPath -Tipo "Pasta"
Remover-ItemSeguro -Caminho $nodeInstallPath64 -Tipo "Pasta"
Remover-ItemSeguro -Caminho $nodeInstallPath86 -Tipo "Pasta"
Remover-ItemSeguro -Caminho $npmrcGlobalPath -Tipo "Arquivo"

Write-Host "`n--- Limpeza do sistema concluída. Verifique a variável PATH manualmente. ---"


# --- PARTE 2: LIMPEZA DO PROJETO ---
Write-Host "`n--- Iniciando limpeza do projeto em '$caminhoDoProjeto'... ---"

if (Test-Path $caminhoDoProjeto) {
    $nodeModulesPath = Join-Path $caminhoDoProjeto "node_modules"
    $packageLockPath = Join-Path $caminhoDoProjeto "package-lock.json"
    
    Remover-ItemSeguro -Caminho $nodeModulesPath -Tipo "Pasta"
    Remover-ItemSeguro -Caminho $packageLockPath -Tipo "Arquivo"
} else {
    Write-Host "ERRO: O caminho do projeto '$caminhoDoProjeto' não foi encontrado." -ForegroundColor Red
}

Write-Host "`n--- Limpeza do projeto concluída. ---"


# --- INSTRUÇÕES FINAIS ---
Write-Host "`n===================================================================" -ForegroundColor Green
Write-Host "Limpeza finalizada com sucesso!" -ForegroundColor Green
Write-Host "PRÓXIMOS PASSOS OBRIGATÓRIOS:" -ForegroundColor Green
Write-Host "1. REINICIE o seu computador agora." -ForegroundColor Yellow
Write-Host "2. Instale a versão LTS mais recente do Node.js (baixe do site oficial)."
Write-Host "3. Após instalar, abra um novo terminal e rode 'npm install' no seu projeto."
Write-Host "===================================================================" -ForegroundColor Green