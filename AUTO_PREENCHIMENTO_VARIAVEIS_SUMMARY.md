# Implementação de Auto-Preenchimento de Variáveis

## Resumo da Funcionalidade

Foi implementado um sistema de auto-preenchimento automático de variáveis nos templates do WhatsApp usando os dados dos leads.

## Como Funciona

### 1. Prioridade de Nomes
O sistema usa a seguinte ordem de prioridade para escolher o nome do lead:
1. **nomeReal** (nome editável/real do lead)
2. **name** (nome automático cadastrado no WhatsApp)
3. **"Cliente"** (fallback padrão)

### 2. Auto-Preenchimento
- O sistema detecta automaticamente quantas variáveis `{{1}}`, `{{2}}`, etc. existem no template
- Para cada variável detectada, preenche automaticamente com o nome do lead
- Exemplo: Template "Olá {{1}}, seu pedido {{2}} está pronto" → "Olá João Silva, seu pedido João Silva está pronto"

### 3. Parâmetros Manuais (Opcional)
Se parâmetros manuais forem fornecidos, eles sobrescrevem o auto-preenchimento:
- `bodyVars: ["João", "Pedido #123"]` → "Olá João, seu pedido Pedido #123 está pronto"
- Chaves numéricas: `{"1": "Maria", "2": "Pedido #456"}` → "Olá Maria, seu pedido Pedido #456 está pronto"

## Arquivos Modificados

### 1. `app/api/admin/mtf-diamante/disparo/route.ts`
- Adicionada lógica de auto-preenchimento de variáveis
- Busca o template completo para analisar componentes
- Detecta placeholders no componente BODY
- Preenche automaticamente com dados do lead
- Suporte a parâmetros manuais que sobrescrevem o auto-preenchimento

### 2. `lib/whatsapp.ts`
- Removidos logs de debug excessivos
- Mantida a validação de variáveis obrigatórias

## Fluxo de Execução

```
1. Recebe disparo com templateId e selectedLeads
2. Busca template completo do banco
3. Para cada lead:
   a. Determina nome (nomeReal || name || "Cliente")
   b. Analisa template para detectar variáveis {{1}}, {{2}}, etc.
   c. Cria array de variáveis preenchidas com o nome
   d. Aplica parâmetros manuais se fornecidos
   e. Envia mensagem via WhatsApp
```

## Exemplos de Uso

### Template sem variáveis
```
Template: "Obrigado por entrar em contato!"
Resultado: "Obrigado por entrar em contato!" (sem alterações)
```

### Template com 1 variável
```
Template: "Olá {{1}}, tudo bem?"
Lead: { nomeReal: "João Silva", name: "João" }
Resultado: "Olá João Silva, tudo bem?"
```

### Template com múltiplas variáveis
```
Template: "Prezado(a) {{1}}, seu atendimento com {{1}} foi agendado"
Lead: { nomeReal: "Maria Santos", name: "Maria" }
Resultado: "Prezado(a) Maria Santos, seu atendimento com Maria Santos foi agendado"
```

### Com parâmetros manuais
```
Template: "Olá {{1}}, seu pedido {{2}} está pronto"
Parameters: { bodyVars: ["João", "Pedido #123"] }
Resultado: "Olá João, seu pedido Pedido #123 está pronto"
```

## Logs de Debug

O sistema gera logs informativos:
```
[Disparo] Auto-preenchendo 2 variáveis com: "João Silva"
[Disparo] Usando parâmetros manuais: [João, Pedido #123]
```

## Benefícios

1. **Personalização Automática**: Mensagens sempre personalizadas com o nome do lead
2. **Flexibilidade**: Suporte a parâmetros manuais quando necessário
3. **Fallback Seguro**: Sempre usa "Cliente" se não houver nome disponível
4. **Compatibilidade**: Funciona com templates existentes sem modificações
5. **Priorização Inteligente**: Usa nomeReal (editável) antes do name (automático)

## Testes Realizados

- ✅ Templates sem variáveis
- ✅ Templates com 1 variável
- ✅ Templates com múltiplas variáveis
- ✅ Leads com nomeReal e name
- ✅ Leads apenas com name
- ✅ Leads sem nome (fallback "Cliente")
- ✅ Parâmetros manuais sobrescrevendo auto-preenchimento
- ✅ Diferentes formatos de parâmetros (bodyVars, chaves numéricas)