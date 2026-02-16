# 🐳 Correção: config.yml ausente no Docker runtime

## 📋 Problema Identificado

O sistema em **produção (Docker)** estava enviando espelhos para o **webhook externo** mesmo com as configurações corretas no `config.yml` e variáveis de ambiente `OAB_EVAL_AGENT_LOCAL_ESPELHO=true`.

### Sintoma
```bash
[Enviar Espelho] 📤 Enviando payload para processamento externo: https://2357witflowauto.witdev.com.br/webhook/...
```

## 🔍 Root Cause Analysis

### 1. O que DEVERIA acontecer:
```typescript
// lib/config/index.ts
const yamlContent = readFileSync(this.configPath, 'utf8'); // Ler config.yml
const yamlConfig = yaml.load(yamlContent) as AppConfig;
return this.applyEnvOverrides(yamlConfig); // Aplicar overrides de ENV
```

### 2. O que ESTAVA acontecendo em produção:
```typescript
// lib/config/index.ts (linha 116-127)
catch (error) {
  configLogger.error('Failed to load config.yml, falling back to environment variables only');
  // ⚠️ Caía no FALLBACK porque config.yml NÃO EXISTIA no container
  this.config = this.createFallbackConfig();
}
```

### 3. Por que o config.yml não existia?

**Dockerfile.prod** estava copiando apenas arquivos específicos no **stage de runtime**:

```dockerfile
# ❌ ANTES (INCORRETO)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/node_modules ./node_modules
# ⚠️ config.yml NÃO ERA COPIADO!
COPY --from=builder /app/.next ./.next
```

### 4. O fallback NÃO incluía agentelocal_espelho:

```typescript
// lib/config/index.ts (linha 277-279) - ANTES da correção
oab_eval: {
  agentelocal: process.env.OAB_EVAL_AGENT_LOCAL === 'true',
  // ❌ FALTAVA: agentelocal_espelho
  transcribe_concurrency: parseInt(process.env.OAB_EVAL_TRANSCRIBE_CONCURRENCY || '10', 10)
}
```

## ✅ Correções Aplicadas

### 1. Dockerfile.prod - Copiar config.yml para runtime

```dockerfile
# ✅ DEPOIS (CORRETO)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/node_modules ./node_modules

# ⭐ CRÍTICO: Copiar config.yml para runtime
COPY --from=builder /app/config.yml ./config.yml

COPY --from=builder /app/.next ./.next
```

### 2. lib/config/index.ts - Corrigir fallback e overrides

```typescript
// ✅ Aplicar override para agentelocal_espelho
if (process.env.OAB_EVAL_AGENT_LOCAL_ESPELHO !== undefined) {
  config.oab_eval.agentelocal_espelho = process.env.OAB_EVAL_AGENT_LOCAL_ESPELHO === "true";
}

// ✅ Fallback corrigido
oab_eval: {
  agentelocal: process.env.OAB_EVAL_AGENT_LOCAL === 'true',
  agentelocal_espelho: process.env.OAB_EVAL_AGENT_LOCAL_ESPELHO === 'true',
  transcribe_concurrency: parseInt(process.env.OAB_EVAL_TRANSCRIBE_CONCURRENCY || '10', 10),
  mirror_concurrency: parseInt(process.env.OAB_EVAL_MIRROR_CONCURRENCY || '5', 10)
}
```

### 3. .env.production - Adicionar variáveis

```bash
# OAB Evaluation Pipeline - Agentes Locais
OAB_EVAL_AGENT_LOCAL=true
OAB_EVAL_AGENT_LOCAL_ESPELHO=true
OAB_EVAL_TRANSCRIBE_CONCURRENCY=10
OAB_EVAL_MIRROR_CONCURRENCY=5
```

## 📊 Fluxo Corrigido

### Ordem de Prioridade (após correções):

1. **Variável de Ambiente** (maior prioridade)
   - `OAB_EVAL_AGENT_LOCAL_ESPELHO=true` no `.env.production`
   
2. **config.yml** (prioridade média)
   - `oab_eval.agentelocal_espelho: true`
   
3. **Fallback** (menor prioridade)
   - Agora também respeita ENVs no fallback

## 🚀 Como Aplicar em Produção

### 1. Rebuild da imagem Docker:
```bash
# Build sem cache para garantir que config.yml seja incluído
docker compose build --no-cache

# Ou se usar docker build direto:
docker build --no-cache -f Dockerfile.prod -t witrocha/socialwise:latest .
```

### 2. Push da nova imagem:
```bash
docker push witrocha/socialwise:latest
```

### 3. Deploy em produção:
```bash
# No servidor de produção
docker compose -f docker-compose-produção.yaml pull
docker compose -f docker-compose-produção.yaml down
docker compose -f docker-compose-produção.yaml up -d
```

### 4. Verificar logs:
```bash
docker compose -f docker-compose-produção.yaml logs -f chatwit_app

# Deve aparecer:
[Config] INFO: Configuration loaded successfully {
  source: 'config.yml',
  overrides: [
    'OAB_EVAL_AGENT_LOCAL',
    'OAB_EVAL_AGENT_LOCAL_ESPELHO',
    ...
  ]
}
```

### 5. Testar processamento de espelho:
```bash
# Logs corretos (agente local):
[Enviar Espelho][Queue] Enfileirando geração de espelho de X imagens...
[MirrorWorker] 🔄 Iniciando processamento do job...
[MirrorGenerator] 🚀 Iniciando geração de espelho...

# ❌ Se ainda aparecer isso, algo está errado:
[Enviar Espelho] 📤 Enviando payload para processamento externo...
```

## 🎯 Verificação Final

### Checklist pré-deploy:

- [x] `config.yml` existe no repositório
- [x] `Dockerfile.prod` copia `config.yml` para runtime
- [x] `.env.production` tem variáveis `OAB_EVAL_AGENT_LOCAL*=true`
- [x] `lib/config/index.ts` aplica overrides corretamente
- [x] `lib/config/index.ts` tem fallback com agentelocal_espelho
- [x] Build sem cache executado
- [x] Imagem pushed para registry
- [x] Deploy em produção

### Teste de sanidade:

```bash
# Dentro do container em produção:
docker exec -it <container-id> sh

# Verificar se config.yml existe:
ls -la /app/config.yml
# Deve retornar: -rw-r--r--  1 root  root  XXXX  ...  config.yml

# Verificar conteúdo:
cat /app/config.yml | grep -A 5 "oab_eval"
# Deve mostrar:
#   oab_eval:
#     agentelocal: true
#     agentelocal_espelho: true
#     ...
```

## 📚 Referências

- Commit da correção do Dockerfile: `efcf322`
- Commit da correção do config/index.ts: `6c193fc`
- Documentação do bug original: `AGENTE_LOCAL_ESPELHO_FIX.md`

## 🎓 Lições Aprendidas

1. **Multi-stage Docker builds** devem copiar TODOS os arquivos de configuração necessários
2. **Fallback configs** devem ser consistentes com o YAML principal
3. **Variáveis de ambiente** devem ter overrides explícitos no código
4. **Logs de configuração** são essenciais para debugging
5. **Testes em container** antes de deploy (exec + verificação de arquivos)

## ⚠️ Prevenção Futura

### Adicionar teste no CI/CD:
```bash
# scripts/test-docker-config.sh
#!/bin/bash
docker build -f Dockerfile.prod -t test-config .
docker run --rm test-config ls -la /app/config.yml || exit 1
echo "✅ config.yml presente na imagem Docker"
```

### Adicionar log de startup:
```typescript
// lib/config/index.ts
if (this.config) {
  configLogger.info('✅ config.yml carregado com sucesso', {
    path: this.configPath,
    exists: existsSync(this.configPath)
  });
} else {
  configLogger.warn('⚠️ config.yml não encontrado, usando fallback', {
    path: this.configPath
  });
}
```
