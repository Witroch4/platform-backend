# Scripts de Desenvolvimento

Este diretório contém scripts PowerShell para facilitar o gerenciamento do ambiente de desenvolvimento.

## Scripts Disponíveis

### 1. `dev-setup.ps1` - Configuração do Ambiente

Configura e inicia o ambiente de desenvolvimento completo.

**Uso:**
```powershell
# Ambiente local (padrão)
.\scripts\dev-setup.ps1

# Ambiente com ngrok
.\scripts\dev-setup.ps1 ngrok
```

**O que faz:**
- Verifica se o Docker está rodando
- Cria a rede Docker `minha_rede` se necessário
- Para containers existentes
- Inicia todos os serviços (app, workers, redis, postgres, ngrok)
- Exibe informações úteis sobre URLs e comandos

### 2. `db-migrate.ps1` - Gerenciamento do Banco de Dados

Gerencia migrações e operações do banco de dados PostgreSQL.

**Uso:**
```powershell
# Executar migrações de desenvolvimento (padrão)
.\scripts\db-migrate.ps1

# Aplicar migrações de produção
.\scripts\db-migrate.ps1 deploy

# Resetar banco de dados
.\scripts\db-migrate.ps1 reset

# Abrir Prisma Studio
.\scripts\db-migrate.ps1 studio

# Executar seed
.\scripts\db-migrate.ps1 seed
```

## Ambientes Disponíveis

### Ambiente Local (`docker-compose-dev.yml`)
- **App**: http://localhost:3000
- **Bull Board**: http://localhost:3005
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### Ambiente com Ngrok (`docker-compose-dev-ngrok.yml`)
- **App**: http://localhost:3000
- **URL Pública**: https://beagle-great-awfully.ngrok-free.app
- **Ngrok Interface**: http://localhost:4040
- **Bull Board**: http://localhost:3005
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Comandos Úteis

### Gerenciamento de Containers
```powershell
# Ver logs em tempo real
docker-compose -f docker-compose-dev.yml logs -f

# Parar ambiente
docker-compose -f docker-compose-dev.yml down

# Reiniciar serviços
docker-compose -f docker-compose-dev.yml restart

# Ver status dos containers
docker ps
```

### Banco de Dados
```powershell
# Executar migrações
.\scripts\db-migrate.ps1

# Abrir Prisma Studio
.\scripts\db-migrate.ps1 studio

# Resetar banco (cuidado!)
.\scripts\db-migrate.ps1 reset
```

### Desenvolvimento
```powershell
# Executar comandos dentro do container
docker exec chatwit_dev npm run dev
docker exec chatwit_dev npx prisma generate
docker exec chatwit_dev npx prisma db push
```

## Estrutura dos Serviços

### Serviços Principais
- **app**: Aplicação Next.js (porta 3000)
- **automacao_worker**: Worker de automações
- **webhook_worker**: Worker de webhooks
- **redis**: Cache e filas (porta 6379)
- **postgres**: Banco de dados PostgreSQL (porta 5432)
- **ngrok**: Túnel público (apenas no ambiente ngrok)

### Volumes
- **node_modules**: Dependências do Node.js
- **redis_data**: Dados do Redis
- **pg_data**: Dados do PostgreSQL

### Rede
- **minha_rede**: Rede Docker personalizada para comunicação entre containers

## Troubleshooting

### Problemas Comuns

1. **Porta já em uso**
   ```powershell
   # Verificar o que está usando a porta
   netstat -ano | findstr :3000
   ```

2. **Container não inicia**
   ```powershell
   # Ver logs detalhados
   docker-compose -f docker-compose-dev.yml logs app
   ```

3. **Banco não conecta**
   ```powershell
   # Verificar se o postgres está rodando
   docker ps | findstr postgres
   ```

4. **Migrações falham**
   ```powershell
   # Resetar banco e executar migrações
   .\scripts\db-migrate.ps1 reset
   .\scripts\db-migrate.ps1
   ```

### Limpeza Completa
```powershell
# Parar e remover tudo
docker-compose -f docker-compose-dev.yml down -v
docker-compose -f docker-compose-dev-ngrok.yml down -v
docker system prune -f
``` 