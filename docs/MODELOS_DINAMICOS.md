# Modelos Dinâmicos - Refatoração

## Problema Identificado

O código anterior mantinha uma lista estática de modelos GPT no tipo `GPTModel`:

```typescript
export type GPTModel =
  | "gpt-4o-latest"
  | "chatgpt-4o-latest"
  | "gpt-3.5-turbo"
  | "gpt-3.5-turbo-16k"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4"
  | "gpt-4-turbo"
  | "gpt-5"
  | "gpt-5-mini"
  | "gpt-5-nano"
  | "o1"
  | "o1-mini"
  | "o1-preview";
```

**Problemas desta abordagem:**
- Lista desatualizada rapidamente
- Não reflete os modelos reais disponíveis na API
- Requer manutenção manual constante
- Limita a flexibilidade do sistema

## Solução Implementada

### 1. Tipo Dinâmico
```typescript
// 🔧 REFATORAÇÃO: Removida lista estática - modelos são obtidos dinamicamente via API
export type GPTModel = string; // Aceita qualquer string, já que os modelos são dinâmicos
```

### 2. Constantes Padrão Configuráveis
```typescript
export const DEFAULT_MODELS = {
  // Modelos padrão que serão substituídos dinamicamente quando possível
  CHAT: process.env.DEFAULT_CHAT_MODEL || "gpt-4o-latest",
  CHAT_ADVANCED: process.env.DEFAULT_CHAT_ADVANCED_MODEL || "gpt-5-chat-latest", 
  CHAT_FAST: process.env.DEFAULT_CHAT_FAST_MODEL || "gpt-4.1-mini",
  CHAT_NANO: process.env.DEFAULT_CHAT_NANO_MODEL || "gpt-4.1-nano",
  IMAGE: process.env.DEFAULT_IMAGE_MODEL || "gpt-image-1",
  EMBEDDING: process.env.DEFAULT_EMBEDDING_MODEL || "text-embedding-3-small",
  AUDIO: process.env.DEFAULT_AUDIO_MODEL || "whisper-1",
} as const;
```

### 3. Carregamento Dinâmico de Modelos

O sistema agora carrega modelos dinamicamente via API:

```typescript
// Em app/api/chatwitia/route.ts
const modelsList = await openai.models.list();

// Categorização dinâmica — reconhece gpt-5, gpt-6… automaticamente
const buildDynamicCategories = (list: any[]) => {
  const cats: Record<string, any[]> = {
    gpt4o: [],
    oSeries: [],
    embedding: [],
    audio: [],
    image: [],
    other: []
  };
  
  for (const m of list) {
    const id: string = m.id || '';
    if (/^o\d/.test(id)) { cats.oSeries.push(m); continue; }
    if (/embedding/.test(id)) { cats.embedding.push(m); continue; }
    if (/whisper/.test(id)) { cats.audio.push(m); continue; }
    if (/dall-e|^image-/.test(id)) { cats.image.push(m); continue; }
    if (/^gpt-4o/.test(id)) { cats.gpt4o.push(m); continue; }
    
    // gpt-N (pega 5,6,7…); mantém buckets separados: gpt5, gpt6, etc.
    const gptMajor = id.match(/^gpt-(\d)(?:[.-]|$)/);
    if (gptMajor) {
      const key = `gpt${gptMajor[1]}`;
      (cats as any)[key] ||= [];
      (cats as any)[key].push(m);
      continue;
    }
    cats.other.push(m);
  }
  return cats;
};
```

## Benefícios da Refatoração

### ✅ Flexibilidade
- Aceita qualquer modelo disponível na API
- Não precisa atualizar código quando novos modelos são lançados
- Suporte automático a GPT-5, GPT-6, etc.

### ✅ Manutenibilidade
- Menos código para manter
- Não há risco de lista desatualizada
- Configuração via variáveis de ambiente

### ✅ Performance
- Cache inteligente de modelos (TTL 10 min)
- Resolução automática de "*-latest" para versões específicas
- Carregamento sob demanda

### ✅ Experiência do Usuário
- Interface sempre atualizada com modelos disponíveis
- Fallback para modelos padrão se API falhar
- Seleção dinâmica em componentes de teste

## Arquivos Modificados

1. **`services/openai.ts`**
   - Removida lista estática de modelos
   - Adicionadas constantes padrão configuráveis
   - Refatorados valores hardcoded

2. **`app/test-responses/page.tsx`**
   - Carregamento dinâmico de modelos da API
   - Interface atualizada automaticamente
   - Fallback para modelos padrão

3. **`hooks/useImageGeneration.ts`**
   - Uso das constantes padrão
   - Remoção de valores hardcoded

4. **`app/components/ChatwitIA/ChatwithIA.tsx`**
   - Modelo padrão mais conservador

5. **`app/admin/capitao/[id]/page.tsx`**
   - Modelo padrão mais conservador

## Configuração via Variáveis de Ambiente

```bash
# .env.local
DEFAULT_CHAT_MODEL=gpt-4o-latest
DEFAULT_CHAT_ADVANCED_MODEL=gpt-5-chat-latest
DEFAULT_CHAT_FAST_MODEL=gpt-4.1-mini
DEFAULT_CHAT_NANO_MODEL=gpt-4.1-nano
DEFAULT_IMAGE_MODEL=gpt-image-1
DEFAULT_EMBEDDING_MODEL=text-embedding-3-small
DEFAULT_AUDIO_MODEL=whisper-1
```

## Próximos Passos

1. **Monitoramento**: Implementar logs para detectar modelos não suportados
2. **Validação**: Adicionar validação de modelos antes do uso
3. **Cache**: Melhorar sistema de cache com invalidação inteligente
4. **UI**: Criar componente reutilizável para seleção de modelos
5. **Testes**: Adicionar testes para carregamento dinâmico de modelos

## Conclusão

Esta refatoração torna o sistema muito mais robusto e flexível, eliminando a necessidade de manutenção manual de listas de modelos e garantindo que sempre esteja atualizado com os modelos mais recentes da OpenAI.
