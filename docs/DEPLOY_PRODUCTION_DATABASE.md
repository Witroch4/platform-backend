# Deploy de Banco de Dados em Produção

Este documento explica como usar o novo script otimizado para deploy em produção.

## Scripts Criados

### 1. `scripts/db-prepare-production.js`
Script Node.js otimizado exclusivamente para produção com verificações inteligentes.

### 2. `scripts/deploy-production.ps1`
Script PowerShell para facilitar o uso do script de produção.

## Principais Melhorias

### ✅ Verificações Inteligentes
- **Detecção de migrações pendentes**: Só aplica migrações se realmente houver mudanças
- **Validação de ambiente**: Confirma que está rodando em produção
- **Verificação de dados existentes**: Não apaga dados desnecessariamente

### ✅ Segurança para Produção
- **Modo deploy forçado**: NUNCA executa `migrate reset` em produção
- **Validações de URL**: Confirma que está conectando no banco correto
- **Logs detalhados**: Mostra exatamente o que está sendo executado

### ✅ Otimizações
- **Pula operações desnecessárias**: Se não há migrações, não aplica
- **Configuração Prisma atualizada**: Remove warning de deprecação
- **Melhor tratamento de erros**: Falha rápido se algo der errado

## Como Usar

### Opção 1: Script PowerShell (Recomendado)
```powershell
# Deploy básico em produção
.\scripts\deploy-production.ps1

# Deploy com seed (cuidado em produção!)
.\scripts\deploy-production.ps1 -WithSeed

# Forçar deploy mesmo se NODE_ENV != production
.\scripts\deploy-production.ps1 -Force

# Pular verificação de migrações (força aplicação)
.\scripts\deploy-production.ps1 -SkipMigrationCheck
```

### Opção 2: Script Node.js Direto
```powershell
# Deploy básico
node scripts/db-prepare-production.js

# Com argumentos
node scripts/db-prepare-production.js --force-production=true --skip-migration-check=true
```

## Variáveis de Ambiente

### Obrigatórias
- `DATABASE_URL`: URL de conexão com o banco de produção
- `NODE_ENV=production`: Confirma ambiente de produção

### Opcionais
- `PRISMA_RUN_SEED=true`: Executa seed após migrações
- `VECTOR_REQUIRED=true`: Exige extensão pgvector
- `DB_CONNECT_RETRIES=30`: Tentativas de conexão
- `RUN_DB_PREPARE=yes`: Executa preparação completa

## Fluxo de Execução

1. **Validação de Ambiente**
   - Confirma NODE_ENV=production
   - Valida DATABASE_URL
   - Verifica credenciais

2. **Conexão com Banco**
   - Conecta no banco admin (postgres)
   - Verifica/cria database alvo
   - Testa conexão com banco alvo

3. **Verificação de Migrações**
   - Executa `prisma migrate status`
   - Determina se há migrações pendentes
   - **IMPORTANTE**: Só aplica se necessário

4. **Aplicação de Mudanças**
   - Aplica migrações (se houver)
   - Configura extensão pgvector
   - Cria índices de vetor

5. **Finalização**
   - Gera Prisma Client
   - Executa seed (se solicitado)

## Diferenças do Script Original

| Aspecto | Script Original | Script Produção |
|---------|----------------|-----------------|
| **Modo** | deploy/reset | Sempre deploy |
| **Migrações** | Sempre aplica | Só se necessário |
| **Validações** | Básicas | Rigorosas |
| **Segurança** | Permissiva | Restritiva |
| **Performance** | Sempre executa tudo | Otimizada |

## Resolução de Problemas

### ❌ "Este script é exclusivo para produção!"
- Defina `NODE_ENV=production` ou use `--force-production=true`

### ❌ "Nenhuma migração pendente encontrada"
- Normal! O script está funcionando corretamente
- Use `--skip-migration-check=true` se quiser forçar

### ❌ Erro de conexão com banco
- Verifique DATABASE_URL
- Confirme credenciais e permissões
- Aumente DB_CONNECT_RETRIES se necessário

### ⚠️ Warning sobre package.json#prisma
- Já foi resolvido! A configuração foi migrada para `prisma/prisma.config.ts`

## Exemplos Práticos

### Deploy normal em produção:
```powershell
$env:NODE_ENV = "production"
$env:DATABASE_URL = "postgresql://user:pass@host:5432/dbname"
.\scripts\deploy-production.ps1
```

### Deploy com troubleshooting:
```powershell
# Se houver problemas de conexão
$env:DB_CONNECT_RETRIES = "60"
$env:DB_CONNECT_SLEEP_MS = "5000"
.\scripts\deploy-production.ps1 -Force
```

### Deploy com seed em produção (use com cuidado):
```powershell
.\scripts\deploy-production.ps1 -WithSeed -Force
```

## Monitoramento

O script produz logs detalhados para facilitar o monitoramento:
- 🔧 Comandos executados
- ✅ Operações bem-sucedidas  
- ⚠️ Avisos importantes
- ❌ Erros críticos
- 📝 Status das migrações
- 🧭 Informações do servidor

## Backup Recomendado

Antes de executar em produção, sempre faça backup:
```powershell
# Execute um dos scripts de backup existentes
.\scripts\backup-simple.ts
# ou
.\scripts\backup-chatwit-all.ts
```