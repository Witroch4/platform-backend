# 🗄️ Sistema de Backup do Banco de Dados FaceApp

Sistema completo para backup e restauração do banco de dados PostgreSQL da aplicação FaceApp.

## 📋 Funcionalidades

- **Backup Completo**: Todos os dados em formato JSON e/ou SQL
- **Backup Simples**: Principais tabelas em formato JSON
- **Backup Agendado**: Automático com cron jobs
- **Compressão**: Arquivos .gz para economizar espaço
- **Restauração**: Recuperação de dados a partir de backups JSON
- **Logs**: Registro detalhado de todas as operações
- **Configuração Flexível**: Opções personalizáveis

## 🚀 Comandos Disponíveis

### Backup Manual

```bash
# Backup completo (JSON + SQL comprimidos)
npm run backup

# Backup simples (apenas JSON das tabelas principais)
npm run backup:simple

# Backup apenas em JSON
npm run backup:json

# Backup apenas em SQL
npm run backup:sql

# Ajuda
npm run backup:help
```

### Backup Agendado

```bash
# Iniciar scheduler de backup automático
npm run backup:schedule

# Executar backup manual via scheduler
npm run backup:schedule:run

# Ver configuração atual
npm run backup:schedule:config

# Habilitar/desabilitar scheduler
npm run backup:schedule:enable
npm run backup:schedule:disable
```

### Restauração

```bash
# Restaurar backup
npm run restore backups/backup_simple_2024-01-01_12-00-00.json
```

## 📁 Estrutura de Arquivos

```
backups/
├── backup_faceapp_2024-01-01_12-00-00.json.gz     # Backup completo
├── backup_faceapp_2024-01-01_12-00-00.sql.gz      # Backup SQL
├── backup_simple_2024-01-01_12-00-00.json         # Backup simples
├── daily/                                          # Backups diários
├── weekly/                                         # Backups semanais
├── monthly/                                        # Backups mensais
├── schedule-config.json                            # Configuração do scheduler
└── backup-log.txt                                  # Log de operações
```

## ⚙️ Configuração do Scheduler

### Configuração Padrão

```json
{
  "enabled": true,
  "dailyTime": "02:00",
  "weeklyDay": 0,
  "weeklyTime": "03:00", 
  "monthlyDay": 1,
  "monthlyTime": "04:00",
  "retentionDays": 30,
  "format": "json",
  "compress": true,
  "excludeLargeTables": true
}
```

### Horários de Backup

- **Diário**: 02:00 (backup simples)
- **Semanal**: Domingo 03:00 (backup completo)
- **Mensal**: Dia 1 às 04:00 (backup completo)
- **Limpeza**: 01:00 diário (remove backups antigos)

## 🔧 Uso Detalhado

### 1. Backup Completo Manual

```bash
# Executa backup completo com todas as opções
npm run backup
```

**Resultado:**
- `backup_faceapp_2024-01-01_12-00-00.json.gz`
- `backup_faceapp_2024-01-01_12-00-00.sql.gz`

### 2. Backup Simples

```bash
# Backup rápido das tabelas principais
npm run backup:simple
```

**Tabelas incluídas:**
- Users, Accounts, Automações
- Leads, Chats, Mensagens
- Configurações WhatsApp
- Espelhos Padrão
- Configurações MTF Diamante

### 3. Iniciar Scheduler

```bash
# Inicia o processo de backup automático
npm run backup:schedule
```

**Funcionalidades:**
- Execução em background
- Logs detalhados
- Configuração persistente
- Limpeza automática

### 4. Restauração

```bash
# Restaurar de um backup específico
npm run restore backups/backup_simple_2024-01-01_12-00-00.json
```

**⚠️ Atenção:** A restauração sobrescreve dados existentes!

## 🛠️ Configuração Avançada

### Excluir Tabelas Grandes

Para backups menores, você pode excluir tabelas que ocupam muito espaço:

```typescript
// Em backup-database.ts
excludeTables: [
  'chatMessage',      // Mensagens de chat
  'generatedImage',   // Imagens geradas
  'chatFile'         // Arquivos de chat
]
```

### Personalizar Horários

Edite o arquivo `backups/schedule-config.json`:

```json
{
  "enabled": true,
  "dailyTime": "03:30",
  "weeklyDay": 6,
  "weeklyTime": "04:00",
  "monthlyDay": 15,
  "monthlyTime": "05:00",
  "retentionDays": 60,
  "format": "both",
  "compress": true,
  "excludeLargeTables": false
}
```

### Configurar Banco de Dados

Certifique-se de que as variáveis de ambiente estão configuradas:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/faceapp
```

## 📊 Monitoramento

### Verificar Logs

```bash
# Ver logs do scheduler
tail -f backups/backup-log.txt

# Ver estatísticas do último backup
npm run backup:schedule:config
```

### Espaço em Disco

```bash
# Verificar tamanho dos backups
du -sh backups/

# Listar backups por data
ls -la backups/ | grep backup_
```

## 🔒 Segurança

### Recomendações

1. **Armazenamento Seguro**: Copie backups para local seguro
2. **Criptografia**: Use ferramentas como `gpg` para criptografar
3. **Acesso Restrito**: Proteja o diretório de backups
4. **Rotação**: Configure retenção adequada

### Exemplo de Criptografia

```bash
# Criptografar backup
gpg --symmetric --cipher-algo AES256 backup_faceapp_2024-01-01.json.gz

# Descriptografar
gpg --decrypt backup_faceapp_2024-01-01.json.gz.gpg > backup_restored.json
```

## 🚨 Troubleshooting

### Problemas Comuns

1. **Erro de Conexão com Banco**
   ```bash
   # Verificar DATABASE_URL
   echo $DATABASE_URL
   
   # Testar conexão
   psql $DATABASE_URL -c "SELECT 1"
   ```

2. **Falta de Espaço em Disco**
   ```bash
   # Verificar espaço disponível
   df -h
   
   # Limpar backups antigos
   find backups/ -name "*.gz" -mtime +30 -delete
   ```

3. **pg_dump não encontrado**
   ```bash
   # Instalar PostgreSQL client
   sudo apt install postgresql-client
   
   # Verificar instalação
   pg_dump --version
   ```

4. **Erro de Permissão**
   ```bash
   # Corrigir permissões
   chmod 755 scripts/backup-*.ts
   chmod 755 backups/
   ```

### Teste de Backup

```bash
# Testar backup simples
npm run backup:simple

# Verificar arquivo gerado
ls -la backups/

# Verificar conteúdo
head -20 backups/backup_simple_*.json
```

## 📈 Monitoramento de Produção

### Integração com Monitoramento

```bash
# Exemplo de webhook após backup
curl -X POST https://monitoring.example.com/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"backup_completed","timestamp":"2024-01-01T12:00:00Z"}'
```

### Alertas por Email

```bash
# Configurar alertas via cron
# Adicionar ao crontab:
0 6 * * * /usr/bin/check-backup-status.sh | mail -s "Backup Status" admin@example.com
```

## 🔄 Automação com Docker

### Dockerfile para Backup

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "backup:schedule"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  backup:
    build: .
    environment:
      - DATABASE_URL=${DATABASE_URL}
    volumes:
      - ./backups:/app/backups
    depends_on:
      - postgres
```

## 📞 Suporte

Para problemas ou dúvidas:

1. Verificar logs em `backups/backup-log.txt`
2. Consultar esta documentação
3. Testar com `npm run backup:simple` primeiro
4. Verificar configuração do banco de dados

---

**Última atualização**: Janeiro 2024
**Versão**: 1.0.0 