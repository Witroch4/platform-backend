# Worker Unificado - SocialWise Chatwit

Este documento explica a nova arquitetura de worker unificado que consolida todos os workers em um único container.

## 📋 Visão Geral

O worker unificado (`worker/init.ts`) substitui a arquitetura anterior de múltiplos containers separados, consolidando todos os workers em um único processo para melhor eficiência de recursos e gerenciamento simplificado.

### Workers Inclusos

- **Parent Worker**: Processamento de alta e baixa prioridade
- **Instagram Automation Worker**: Automação "eu-quero" para Instagram
- **AI Integration Workers**: Processamento de mensagens AI e embeddings
- **Manuscrito Worker**: Processamento de manuscritos
- **Leads Chatwit Worker**: Processamento de leads
- **Instagram Translation Worker**: Tradução de mensagens Instagram

## 🚀 Como Executar

### Desenvolvimento (Windows)

```powershell
# Usando o script PowerShell
npm run start:unified-worker:dev

# Ou diretamente
npm run start:unified-worker
```

### Produção (Docker)

```bash
# Deploy completo
npm run deploy:unified-worker

# Ou usando Docker Compose diretamente
docker compose -f docker-compose-produção.yaml up -d
```

## 📊 Monitoramento

```bash
# Verificar status do worker
npm run monitor:unified-worker

# Logs em tempo real (Docker)
docker compose -f docker-compose-produção.yaml logs -f worker

# Status dos containers
docker compose -f docker-compose-produção.yaml ps
```

## 🔧 Configuração

### Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `LEADS_CHATWIT_CONCURRENCY` | 3 | Concorrência do worker de leads |
| `LEADS_CHATWIT_LOCK_DURATION` | 60000 | Duração do lock em ms |
| `WEBHOOK_DIRECT_PROCESSING` | true | Processamento direto de webhooks |
| `NODE_ENV` | production | Ambiente de execução |

### Recursos Docker

```yaml
resources:
  limits:
    cpus: "3.0"      # 3 cores para todos os workers
    memory: 6G       # 6GB de RAM
```

## 🏗️ Arquitetura

### Fluxo de Inicialização

1. **Redis Connection**: Aguarda conexão com Redis
2. **Parent Worker**: Inicia workers de alta/baixa prioridade
3. **Automation Worker**: Inicia processamento Instagram
4. **AI Integration**: Inicia workers de AI
5. **Legacy Workers**: Inicia workers de compatibilidade

### Estrutura de Arquivos

```
worker/
├── init.ts                      # 🆕 Worker unificado (ponto de entrada)
├── webhook.worker.ts             # Parent worker
├── automacao.worker.ts           # Instagram automation
├── ai-integration.worker.ts      # AI workers
└── WebhookWorkerTasks/          # Tasks específicas

scripts/
├── start-unified-worker.sh       # 🆕 Script Linux/produção
├── start-unified-worker.ps1      # 🆕 Script Windows/dev
├── monitor-unified-worker.sh     # 🆕 Script de monitoramento
└── deploy-unified-worker.sh      # 🆕 Script de deploy
```

## 🛠️ Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run start:unified-worker` | Inicia worker unificado (dev) |
| `npm run start:unified-worker:dev` | Inicia com script PowerShell |
| `npm run start:unified-worker:prod` | Inicia versão compilada |
| `npm run deploy:unified-worker` | Deploy completo com Docker |
| `npm run monitor:unified-worker` | Monitora status do worker |

## 🔄 Migração da Arquitetura Anterior

### Antes (2 containers)

```yaml
# docker-compose-produção.yaml (ANTERIOR)
worker_automacao:
  command: node /app/dist/worker/automacao.worker.js

worker_webhook:
  command: node /app/dist/worker/webhook.worker.js
```

### Depois (1 container)

```yaml
# docker-compose-produção.yaml (ATUAL)
worker:
  command: node /app/dist/worker/init.js  # 🆕 Worker unificado
```

### Benefícios

- ✅ **Redução de recursos**: 1 container ao invés de 2
- ✅ **Gerenciamento simplificado**: Um único processo para monitorar
- ✅ **Comunicação interna**: Workers no mesmo processo podem compartilhar recursos
- ✅ **Startup mais rápido**: Inicialização sequencial otimizada
- ✅ **Logs centralizados**: Todos os workers logam no mesmo local

## 🐛 Troubleshooting

### Worker não inicia

```bash
# Verificar logs
docker compose -f docker-compose-produção.yaml logs worker

# Verificar conexões
docker exec -it <container_id> bash
npm run monitor:unified-worker
```

### Performance

```bash
# Monitorar recursos
docker stats

# Verificar métricas do worker
docker compose -f docker-compose-produção.yaml exec worker \
  bash scripts/monitor-unified-worker.sh
```

### Rollback (se necessário)

Se precisar voltar para a arquitetura anterior:

1. Comentar o worker unificado no docker-compose
2. Descomentar os workers individuais
3. Fazer redeploy

## 📈 Próximos Passos

- [ ] Implementar métricas Prometheus no worker unificado
- [ ] Adicionar health checks específicos
- [ ] Configurar alertas automáticos
- [ ] Otimizar uso de memória compartilhada
- [ ] Implementar hot-reload para desenvolvimento

---

*Worker Unificado implementado em agosto de 2025 - SocialWise Chatwit*
