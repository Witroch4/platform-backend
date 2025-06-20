# Macro WIT - Instruções de Instalação

## Como configurar a macro "wit" no PowerShell

### Opção 1: Uso direto (mais simples)

1. No seu terminal PowerShell, navegue até a pasta do projeto
2. Execute o comando:
```powershell
. .\wit.ps1
```
3. Agora você pode usar o comando `wit` diretamente

### Opção 2: Instalação permanente

1. Primeiro, encontre o caminho do seu perfil do PowerShell:
```powershell
$PROFILE
```

2. Se o arquivo não existir, crie-o:
```powershell
New-Item -Path $PROFILE -Type File -Force
```

3. Abra o arquivo de perfil:
```powershell
notepad $PROFILE
```

4. Adicione estas linhas no arquivo:
```powershell
# Carregar macro WIT
. "D:\nextjs\Chatwit-Social-dev\wit.ps1"
```

5. Salve e feche o arquivo

6. Recarregue o perfil:
```powershell
. $PROFILE
```

## Como usar a macro

Depois de configurada, simplesmente digite:
```powershell
wit
```

## O que a macro faz:

1. **git status** - Mostra o status atual
2. **git add .** - Adiciona todos os arquivos
3. **Pergunta a mensagem do commit** - Valor padrão: "melhorias nos lead e ESPELHO v2"
4. **git commit** - Faz o commit com a mensagem
5. **git push origin master** - Envia para o repositório
6. **Pergunta sobre build** - Se responder "s" ou "sim", executa `docker compose build`

## Exemplo de uso:

```
PS D:\nextjs\Chatwit-Social-dev> wit
=== WIT - Macro de Deploy ===

Verificando status do git...
On branch master
Changes not staged for commit:
...

Adicionando arquivos...
Arquivos adicionados!

Digite a mensagem do commit (pressione Enter para usar: 'melhorias nos lead e ESPELHO v2'):
> nova funcionalidade de leads

Fazendo commit...
Commit realizado!

Enviando para o repositório...
Push realizado!

Deseja fazer build para produção? (s/sim para confirmar): s
Iniciando build para produção...
Build concluído!

=== WIT - Processo Concluído === 