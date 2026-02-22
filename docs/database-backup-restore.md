# Database Backup & Restore — Socialwise

Guia do processo executado em 2026-02-22 para backup do banco `socialwise` de produção e restauração em desenvolvimento.

---

## O que foi feito

### 1. Dump no servidor de produção (via SSH MCP)

```bash
docker exec postgres_postgres.1.<id> \
  pg_dump -U postgres socialwise \
  | gzip > /tmp/socialwise_backup_YYYYMMDD_HHMMSS.sql.gz
```

- `pg_dump` gera um dump SQL completo (schema + dados)
- `gzip` comprime o resultado — o banco de 21MB virou um arquivo de **1.4MB**
- Salvo em `/tmp/` no servidor remoto

### 2. Transferência para máquina local (base64 via SSH MCP)

Como não há acesso `scp` direto do WSL para o servidor, o arquivo foi transferido via **base64**:

```bash
# No servidor
base64 /tmp/socialwise_backup.sql.gz
# output capturado e decodificado localmente:
jq -r '.[0].text' <tool-result-file> | base64 -d > ~/socialwise_backup_20260222.sql.gz
```

O arquivo ficou em `/home/wital/socialwise_backup_20260222.sql.gz`.

Limpeza do temporário no servidor:
```bash
rm /tmp/socialwise_backup_20260222_013605.sql.gz
```

### 3. Restauração em desenvolvimento

O banco local já existia com dados diferentes, gerando erros de FK ao tentar restaurar direto. Solução: **recriar o banco do zero**.

```bash
# Encerrar conexões ativas
psql postgresql://postgres:postgres@localhost:5432/postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'socialwise' AND pid <> pg_backend_pid();"

# Dropar e recriar
psql postgresql://postgres:postgres@localhost:5432/postgres -c "DROP DATABASE IF EXISTS socialwise;"
psql postgresql://postgres:postgres@localhost:5432/postgres -c "CREATE DATABASE socialwise OWNER postgres;"

# Restaurar
gunzip -c ~/socialwise_backup_20260222.sql.gz | psql postgresql://postgres:postgres@localhost:5432/socialwise
```

Zero erros na restauração.

---

## Resultado

| Tabela | Registros |
|---|---|
| ArquivoLeadOab | 2.326 |
| AuditLog | 1.241 |
| Lead | 344 |
| LeadOabData | 337 |
| Message | 126 |
| Template | 62 |
| _prisma_migrations | 20 |

---

## Por que não usar `scp` ou `rclone`?

| Método | Situação |
|---|---|
| `scp` do WSL | Requer acesso SSH direto da máquina local — não disponível neste setup |
| `rclone` → MinIO | Funciona bem para arquivos grandes (>10MB). O MinIO já está no servidor |
| **base64 via SSH MCP** | Ideal para arquivos pequenos (≤5MB comprimido). Zero configuração extra |

---

## Atalhos para uso futuro

### Backup rápido de produção

```bash
# Rodar via SSH no servidor
CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1)
docker exec $CONTAINER pg_dump -U postgres socialwise | gzip > /tmp/socialwise_bkp_$(date +%Y%m%d).sql.gz
```

### Restaurar em dev (banco limpo)

```bash
DB_URL="postgresql://postgres:postgres@localhost:5432"
psql $DB_URL/postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='socialwise' AND pid<>pg_backend_pid();"
psql $DB_URL/postgres -c "DROP DATABASE IF EXISTS socialwise; CREATE DATABASE socialwise OWNER postgres;"
gunzip -c ~/socialwise_backup_YYYYMMDD.sql.gz | psql $DB_URL/socialwise
```

### Para bancos maiores (>5MB comprimido) — usar rclone → MinIO

```bash
# Configurar rclone uma vez no servidor
rclone config  # tipo: s3, provider: Minio, endpoint: http://localhost:9000

# Fazer upload
rclone copy /tmp/backup.sql.gz minio:backups/

# Baixar localmente via MinIO web UI ou:
mc cp minio/backups/backup.sql.gz ~/
```

---

## Observações

- **Nunca** restaurar um dump por cima de um banco com dados — sempre dropar e recriar para evitar erros de FK e constraints duplicadas
- O dump inclui schema + dados (tipos Prisma, migrations, tudo)
- Após restaurar em dev, não é necessário rodar `prisma migrate deploy` — as migrations já estão na tabela `_prisma_migrations`
