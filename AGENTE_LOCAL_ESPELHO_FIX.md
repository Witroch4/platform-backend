# 🔧 Correção: Agente Local de Espelho não estava sendo usado

## 📋 Problema Identificado

O sistema estava **enviando espelhos para processamento externo** (N8N webhook) mesmo com `agentelocal_espelho: true` no `config.yml`.

### Log do Problema
```
[Enviar Espelho] 📤 Enviando payload para processamento externo: https://2357witflowauto.witdev.com.br/webhook/...
```

## 🔍 Root Cause

O arquivo `lib/config/index.ts` **não estava aplicando o override da variável de ambiente `OAB_EVAL_AGENT_LOCAL_ESPELHO`**, causando o fallback para o webhook externo.

### Código Problemático (antes)
```typescript
// ❌ Aplicava override apenas para agentelocal (manuscrito)
if (process.env.OAB_EVAL_AGENT_LOCAL !== undefined) {
  config.oab_eval.agentelocal = process.env.OAB_EVAL_AGENT_LOCAL === "true";
}
// ⚠️ FALTAVA: Override para agentelocal_espelho
```

## ✅ Correção Aplicada

### 1. Override de ENV adicionado
```typescript
// ✅ Aplicar override para agentelocal_espelho
if (process.env.OAB_EVAL_AGENT_LOCAL_ESPELHO !== undefined) {
  config.oab_eval.agentelocal_espelho = process.env.OAB_EVAL_AGENT_LOCAL_ESPELHO === "true";
}

// ✅ Aplicar override para mirror_concurrency
if (process.env.OAB_EVAL_MIRROR_CONCURRENCY) {
  const n = parseInt(process.env.OAB_EVAL_MIRROR_CONCURRENCY, 10);
  if (!Number.isNaN(n) && n > 0) config.oab_eval.mirror_concurrency = n;
}
```

### 2. Fallback Config atualizado
```typescript
oab_eval: {
  agentelocal: process.env.OAB_EVAL_AGENT_LOCAL === 'true',
  agentelocal_espelho: process.env.OAB_EVAL_AGENT_LOCAL_ESPELHO === 'true', // ⭐ NOVO
  transcribe_concurrency: parseInt(process.env.OAB_EVAL_TRANSCRIBE_CONCURRENCY || '10', 10),
  mirror_concurrency: parseInt(process.env.OAB_EVAL_MIRROR_CONCURRENCY || '5', 10) // ⭐ NOVO
}
```

### 3. Lista de variáveis monitoradas atualizada
```typescript
const envVars = [
  // ... outras variáveis
  'OAB_EVAL_AGENT_LOCAL',
  'OAB_EVAL_AGENT_LOCAL_ESPELHO',        // ⭐ NOVO
  'OAB_EVAL_TRANSCRIBE_CONCURRENCY',
  'OAB_EVAL_MIRROR_CONCURRENCY'           // ⭐ NOVO
];
```

## 🎯 Variáveis de Ambiente Necessárias

Para **garantir o uso do agente local**, adicione aos seus arquivos `.env`:

```bash
# ══════════════════════════════════════════════════════════════
# OAB Evaluation Pipeline - Agente Local
# ══════════════════════════════════════════════════════════════

# Agente Local - Manuscrito (digitação de manuscritos)
# Quando true: usa LangGraph local para digitação
# Quando false: usa webhook externo (N8N)
OAB_EVAL_AGENT_LOCAL=true

# Agente Local - Espelho (geração de espelho de correção)
# Quando true: usa LangGraph local para espelho
# Quando false: usa webhook externo (N8N)
OAB_EVAL_AGENT_LOCAL_ESPELHO=true

# Concorrência - Transcrição de Manuscritos
# Número de páginas processadas em paralelo
OAB_EVAL_TRANSCRIBE_CONCURRENCY=10

# Concorrência - Geração de Espelhos
# Número de espelhos processados em paralelo
OAB_EVAL_MIRROR_CONCURRENCY=5
```

## 📊 Como o Sistema Decide Qual Agente Usar

### Fluxo de Decisão (route.ts)

```typescript
// 1️⃣ Carrega configuração (YAML + ENV overrides)
const { 
  agentelocal: USE_LOCAL_TRANSCRIBER, 
  agentelocal_espelho: USE_LOCAL_MIRROR_AGENT 
} = getOabEvalConfig();

// 2️⃣ Decide qual agente usar para MANUSCRITO
const shouldUseLocalManuscritoAgent =
  USE_LOCAL_TRANSCRIBER && isManuscrito && !isEspelho && !isProva;

// 3️⃣ Decide qual agente usar para ESPELHO
const shouldUseLocalMirrorAgent =
  USE_LOCAL_MIRROR_AGENT && isEspelho && !isManuscrito && !isProva;

// 4️⃣ Executa o agente apropriado
if (shouldUseLocalManuscritoAgent) {
  // ✅ Enfileira na transcription queue (local)
  await enqueueTranscription({...});
} else if (shouldUseLocalMirrorAgent) {
  // ✅ Enfileira na mirror queue (local)
  await enqueueMirrorGeneration({...});
} else {
  // ⚠️ Fallback: webhook externo (N8N)
  fetch(process.env.WEBHOOK_URL, {...});
}
```

## 🔄 Prioridade de Configuração

O sistema usa a seguinte ordem de prioridade:

1. **Variável de Ambiente** (maior prioridade)
   - `OAB_EVAL_AGENT_LOCAL_ESPELHO=true` no `.env`
   
2. **config.yml** (prioridade média)
   - `oab_eval.agentelocal_espelho: true`
   
3. **Fallback Padrão** (menor prioridade)
   - `false` (usa webhook externo)

## ✅ Como Verificar se Está Funcionando

### 1. Verificar Logs de Inicialização
```bash
[Config] Configuration loaded successfully
  source: 'config.yml'
  overrides: ['OAB_EVAL_AGENT_LOCAL_ESPELHO', ...]
```

### 2. Verificar Logs de Processamento

**✅ Agente Local (correto):**
```bash
[Enviar Espelho][Queue] Enfileirando geração de espelho de 5 imagens (lead cmhth..., especialidade: DIREITO DO TRABALHO)
[Enviar Espelho][Queue] Job 123 enfileirado com sucesso
```

**❌ Webhook Externo (incorreto):**
```bash
[Enviar Espelho] 📤 Enviando payload para processamento externo: https://2357witflowauto.witdev.com.br/webhook/...
```

## 📁 Arquivos Modificados

- ✅ `lib/config/index.ts` - Correções de override e fallback
- 📝 `AGENTE_LOCAL_ESPELHO_FIX.md` - Esta documentação

## 🚀 Deploy

### Após aplicar a correção:

1. **Adicionar variáveis de ambiente** nos arquivos `.env`:
   ```bash
   OAB_EVAL_AGENT_LOCAL=true
   OAB_EVAL_AGENT_LOCAL_ESPELHO=true
   ```

2. **Rebuild da aplicação**:
   ```bash
   npm run build
   ```

3. **Restart dos serviços**:
   ```bash
   # Docker
   docker compose restart
   
   # PM2
   pm2 restart all
   ```

4. **Verificar logs** para confirmar uso do agente local

## 🎓 Lições Aprendidas

1. **Sempre aplicar overrides de ENV para TODAS as configurações YAML**
2. **Documentar variáveis de ambiente no código e no README**
3. **Logs devem indicar claramente qual caminho está sendo usado**
4. **Testar com e sem variáveis de ambiente para validar fallbacks**

## 📚 Referências

- `app/api/admin/leads-chatwit/enviar-manuscrito/route.ts` - Lógica de decisão
- `lib/config/index.ts` - Sistema de configuração
- `config.yml` - Configurações padrão
- `.env.example` - Template de variáveis de ambiente
