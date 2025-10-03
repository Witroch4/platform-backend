# 🚀 Quick Start - Sistema de Transcrição com Fila

**TL;DR:** Sistema de digitação de manuscritos com fila BullMQ, progresso em tempo real via SSE e UI não-invasiva.

---

## ⚡ Como Usar (Para Desenvolvedores)

### 1. Iniciar Worker

```bash
# Terminal 1 - Worker
pnpm run worker

# Aguardar logs:
# [Worker] ✅ SSE Redis conectado
# [Worker] ✅ Worker de Transcrição OAB inicializado
```

### 2. Iniciar App

```bash
# Terminal 2 - Next.js
pnpm run dev

# Acesse: http://localhost:3002/admin/leads-chatwit
```

### 3. Enviar para Digitação

1. Selecione um lead
2. Adicione imagens do manuscrito
3. Clique "Enviar para Digitação"
4. ✅ Botão libera imediatamente
5. Toast: "Prova adicionada à fila de digitação"
6. Painel flutuante aparece no canto inferior direito

### 4. Acompanhar Progresso

- **Badge no lead:** "Digitando... 30%"
- **Painel flutuante:** Barra de progresso + tempo restante
- **DevTools Network:** Ver eventos SSE em tempo real

### 5. Quando Concluir

- Toast: "Digitação concluída! 10 páginas processadas em 28.5s"
- Lead atualizado automaticamente
- Manuscrito disponível para visualização

---

## 📂 Arquivos Importantes

| Arquivo | O que faz |
|---------|-----------|
| [lib/oab-eval/transcription-queue.ts](../lib/oab-eval/transcription-queue.ts) | Fila BullMQ + Worker |
| [lib/oab-eval/transcription-agent.ts](../lib/oab-eval/transcription-agent.ts) | Agente LangGraph |
| [app/admin/leads-chatwit/hooks/useTranscriptionProgress.ts](../app/admin/leads-chatwit/hooks/useTranscriptionProgress.ts) | Hook React |
| [app/admin/leads-chatwit/components/transcription-panel.tsx](../app/admin/leads-chatwit/components/transcription-panel.tsx) | Painel flutuante |
| [config.yml](../config.yml) | Configurações |

---

## 🔧 Configurar

### config.yml

```yaml
oab_eval:
  agentelocal: true              # Usar agente local
  transcribe_concurrency: 10     # 10 páginas em paralelo

  queue:
    max_concurrent_jobs: 3       # Máx. 3 digitações simultâneas
    job_timeout: 300000          # 5 min timeout
    retry_attempts: 2            # 2 tentativas

  debug:
    enabled: true                # Logs detalhados
    log_prompts: true            # Mostra prompt do blueprint
```

### Variáveis de Ambiente (sobrescrevem config.yml)

```bash
# .env
OAB_EVAL_AGENT_LOCAL=true
OAB_EVAL_TRANSCRIBE_CONCURRENCY=10
OAB_EVAL_MAX_CONCURRENT_JOBS=3
OAB_EVAL_DEBUG_ENABLED=true
```

---

## 🐛 Debug

### Ver Logs do Worker

```bash
# Terminal do worker
[TranscriptionQueue] 🎯 Processando job 123 - Lead: xxx, Páginas: 10
[TranscriptionAgent] 🖼️ Processando página 3/10
[TranscriptionAgent] ✅ Página 3/10 concluída em 2.8s
[SSE Redis] ✅ Notificação publicada com sucesso
```

### Ver Eventos SSE (DevTools)

1. Abrir DevTools (F12)
2. Aba "Network"
3. Filtrar por "sse"
4. Ver eventos em tempo real

### Verificar Fila (Bull Board)

```bash
# Acesse (se disponível):
http://localhost:3005
```

---

## ❓ FAQ

### Por que o botão libera antes de concluir?
**R:** A digitação é assíncrona (fila). O botão confirma que foi enfileirado, não que concluiu.

### Como sei quando terminou?
**R:** Toast de conclusão + badge do lead atualiza + SSE notifica.

### Posso enviar múltiplas provas ao mesmo tempo?
**R:** Sim! Máximo de 3 digitações simultâneas (configurável).

### O que acontece se der erro?
**R:** Worker tenta 2x automaticamente. Se falhar, exibe erro no painel.

### Como cancelar uma digitação?
**R:** Clique "Ver detalhes" no painel → Botão "Cancelar Digitação" (apenas se processando).

---

## 🎯 Fluxo Simplificado

```
1. User: Clica "Enviar para Digitação"
2. Frontend: POST /enviar-manuscrito
3. API: Enfileira job → 202 Accepted
4. Frontend: Libera botão + Toast ✅
5. Worker: Pega job da fila
6. Worker: SSE "started"
7. Worker: Processa páginas (1/10, 2/10, ...)
8. Worker: SSE "page-complete" para cada página
9. Frontend: Atualiza badge + painel
10. Worker: SSE "completed"
11. Worker: Atualiza banco de dados
12. Frontend: Toast "Digitação concluída!" ✅
```

---

## 📊 Métricas (Em Desenvolvimento)

```bash
# Ver métricas da fila (TODO)
curl http://localhost:3002/api/admin/oab/transcription/metrics

# Ver status de um job (TODO)
curl http://localhost:3002/api/admin/oab/transcription/status/:leadId

# Cancelar job (TODO)
curl -X DELETE http://localhost:3002/api/admin/oab/transcription/:leadId
```

---

## 🆘 Troubleshooting

### Worker não inicia
```bash
# Verificar se Redis está rodando
docker ps | grep redis

# Se não estiver:
docker compose up -d redis
```

### SSE não conecta
```bash
# Verificar logs do worker
# Deve ter: [SSE Redis] ✅ Publisher conectado

# Se não tiver, reiniciar worker:
pnpm run worker
```

### Progresso não atualiza
```bash
# 1. Verificar conexão SSE no DevTools (Network → sse)
# 2. Verificar logs do worker (deve ter eventos SSE)
# 3. Verificar se leadId está correto
```

---

## 📚 Documentação Completa

- [Guia de Integração Frontend](./transcription-integration-guide.md)
- [Resumo da Implementação](./transcription-implementation-summary.md)

---

**Status:** ✅ Pronto para uso
**Última atualização:** 2025-10-02

---

_Dúvidas? Ver logs do worker ou DevTools Network (SSE)_
