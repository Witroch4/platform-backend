# Scripts de Backup e Restauração

Este diretório contém scripts para gerenciar backups e restaurações do banco de dados usando TypeScript.

## 📁 Scripts Disponíveis

### 🔄 Restauração de Backups SQL (.sql.gz)

#### `restore-sql-backup.ts`
Script TypeScript para restaurar backups no formato `.sql.gz` (formato do FaceApp).

**Funcionalidades:**
- Detecta automaticamente o backup mais recente no padrão `faceApp_backup_YYYY-MM-DD_HH_MM_SS_XMB.sql.gz`
- Descompacta arquivos `.gz`
- Executa SQL via Prisma ou conexão direta
- Limpa arquivos temporários automaticamente

**Uso:**
```bash
# Restaurar backup mais recente
npx tsx scripts/restore-sql-backup.ts

# Restaurar backup específico
npx tsx scripts/restore-sql-backup.ts "faceApp_backup_2025-07-28_00_00_01_1MB.sql.gz"
```

### 📋 Listagem de Backups

#### `list-backups.ts`
Script TypeScript para listar todos os backups disponíveis.

**Uso:**
```bash
npx tsx scripts/list-backups.ts
```

**Saída:**
```
📊 Backups encontrados (3 arquivos):

[1] faceApp_backup_2025-07-28_00_00_01_1MB.sql.gz (MAIS RECENTE)
    📅 Data: 28/07/2025 00:00:01
    📏 Tamanho: 1.2 MB

[2] faceApp_backup_2025-07-27_23_59_59_1MB.sql.gz
    📅 Data: 27/07/2025 23:59:59
    📏 Tamanho: 1.1 MB
```

### 🔄 Restauração de Backups JSON (Legado)

#### `restore-chatwit-all.ts`
Script TypeScript para restaurar backups no formato JSON (formato antigo).

**Funcionalidades:**
- Restaura dados específicos do Chatwit (usuários, leads, arquivos, espelhos)
- Cria usuários administradores se necessário
- Suporta formato antigo e novo de backup

**Uso:**
```bash
# Restaurar backup mais recente
npx tsx scripts/restore-chatwit-all.ts

# Restaurar backup específico
npx tsx scripts/restore-chatwit-all.ts "backup_simple_2025-07-12_18-25-34.json"
```

## 🚀 Fluxo de Trabalho Recomendado

### 1. Listar Backups Disponíveis
```bash
npx tsx scripts/list-backups.ts
```

### 2. Restaurar Backup Mais Recente
```bash
npx tsx scripts/restore-sql-backup.ts
```

### 3. Verificar Restauração
```bash
npx prisma studio
```

## ⚠️ Importante

- **Backups SQL (.sql.gz)**: Contêm dump completo do banco de dados
- **Backups JSON**: Contêm apenas dados específicos do Chatwit
- Sempre faça backup antes de restaurar
- Verifique se o banco de dados está acessível antes da restauração

## 🔧 Solução de Problemas

### Erro: "Node.js não encontrado"
```bash
# Instalar Node.js
winget install OpenJS.NodeJS
```

### Erro: "tsx não encontrado"
```bash
# Instalar tsx globalmente
npm install -g tsx
```

### Erro: "Arquivo de backup não encontrado"
- Verifique se o arquivo existe na pasta `backups/`
- Use `npx tsx scripts/list-backups.ts` para ver backups disponíveis

### Erro durante restauração SQL
- O script tentará método alternativo automaticamente
- Verifique logs para detalhes do erro
- Certifique-se de que o banco de dados está acessível

## 📝 Logs

Os scripts geram logs detalhados durante a execução:
- ✅ Sucesso
- ❌ Erro
- ⚠️ Aviso
- 📊 Progresso
- 🔧 Comandos executados