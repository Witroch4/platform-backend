# Implementação de Variáveis Customizadas para Templates Oficiais

## Resumo das Funcionalidades Implementadas

### 1. Variável Especial `nome_lead`
- **Localização**: `app/admin/mtf-diamante/components/shared/VariableContextMenu.tsx`
- **Funcionalidade**: Adicionada variável especial `{{nome_lead}}` que será substituída dinamicamente pelo nome da pessoa que receberá a mensagem
- **Características**:
  - Não pode ser editada (placeholder fixo)
  - Aparece destacada em laranja na interface
  - Valor dinâmico substituído no momento do envio

### 2. Diálogo de Configuração de Variáveis
- **Arquivo**: `app/admin/mtf-diamante/components/shared/TemplateVariablesDialog.tsx`
- **Funcionalidades**:
  - Detecta automaticamente variáveis em templates oficiais do WhatsApp
  - Exibe valores de exemplo da Meta
  - Permite configurar valores customizados
  - Integração com o menu de contexto de variáveis (clique direito)
  - Suporte para variáveis em componentes BODY e HEADER

### 3. Integração no Mapeamento de Intenções
- **Arquivo**: `app/admin/mtf-diamante/components/MapeamentoTab.tsx`
- **Funcionalidades**:
  - Verifica automaticamente se template tem variáveis ao salvar mapeamento
  - Abre diálogo de configuração quando necessário
  - Salva variáveis customizadas junto com o mapeamento

### 4. Atualização do Schema do Banco
- **Arquivo**: `prisma/schema.prisma`
- **Mudança**: Adicionado campo `customVariables Json?` no modelo `MapeamentoIntencao`
- **Migração**: Criada migração `20250808112218_add_custom_variables_to_mapping`

### 5. API de Mapeamentos Atualizada
- **Arquivo**: `app/api/admin/mtf-diamante/mapeamentos/route.ts`
- **Funcionalidade**: Aceita e salva variáveis customizadas no campo `customVariables`

### 6. API de Template Info Atualizada
- **Arquivo**: `app/api/admin/mtf-diamante/template-info/route.ts`
- **Funcionalidade**: Suporte para buscar templates por `templateId` do banco local

### 7. Worker de Processamento Atualizado
- **Arquivo**: `worker/processors/intent.processor.ts`
- **Funcionalidades**:
  - Carrega variáveis customizadas do mapeamento
  - Aplica variáveis customizadas aos componentes do template
  - Substitui `{{nome_lead}}` pelo nome extraído do telefone do contato
  - Fallback para valores de exemplo da Meta quando não há valores customizados

### 8. Tipos TypeScript Atualizados
- **Arquivo**: `worker/types/types.ts`
- **Mudança**: Adicionado campo `customVariables?` na interface `TemplateMapping`

## Fluxo de Funcionamento

### 1. Configuração (Admin)
1. Admin seleciona template oficial para mapear intenção
2. Sistema detecta se template tem variáveis (`{{1}}`, `{{2}}`, etc.)
3. Se tem variáveis, abre diálogo de configuração
4. Admin pode:
   - Usar valores de exemplo da Meta (padrão)
   - Configurar valores customizados
   - Usar variável especial `{{nome_lead}}` nos valores
5. Variáveis são salvas no campo `customVariables` do mapeamento

### 2. Processamento (Worker)
1. Worker recebe intenção e busca mapeamento
2. Carrega template e variáveis customizadas
3. Para cada variável `{{N}}` no template:
   - Verifica se existe valor customizado (`variavel_N`)
   - Se existe, usa valor customizado
   - Se não existe, usa valor de exemplo da Meta
   - Se valor contém `{{nome_lead}}`, substitui pelo nome do lead
4. Envia mensagem processada via WhatsApp API

## Exemplo de Uso

### Template Original (Meta):
```
Olá {{1}}, bem-vindo à {{2}}!
```

### Valores de Exemplo (Meta):
- `{{1}}`: "João"
- `{{2}}`: "Empresa XYZ"

### Valores Customizados (Admin):
- `variavel_1`: "{{nome_lead}}"
- `variavel_2`: "Nossa Empresa Incrível"

### Resultado Final (Enviado):
```
Olá Lead 7766, bem-vindo à Nossa Empresa Incrível!
```

## Benefícios

1. **Flexibilidade**: Admin pode personalizar mensagens sem alterar template na Meta
2. **Dinamismo**: Variável `{{nome_lead}}` permite personalização automática
3. **Fallback**: Sistema usa valores de exemplo quando não há customização
4. **Compatibilidade**: Funciona com templates existentes sem quebrar funcionalidade
5. **Interface Intuitiva**: Diálogo claro com preview dos valores

## Arquivos Modificados/Criados

### Criados:
- `app/admin/mtf-diamante/components/shared/TemplateVariablesDialog.tsx`
- `prisma/migrations/20250808112218_add_custom_variables_to_mapping/migration.sql`

### Modificados:
- `app/admin/mtf-diamante/components/MapeamentoTab.tsx`
- `app/admin/mtf-diamante/components/shared/VariableContextMenu.tsx`
- `app/api/admin/mtf-diamante/mapeamentos/route.ts`
- `app/api/admin/mtf-diamante/template-info/route.ts`
- `worker/processors/intent.processor.ts`
- `worker/types/types.ts`
- `prisma/schema.prisma`

## Próximos Passos Sugeridos

1. **Melhorar Extração de Nome**: Implementar lógica mais sofisticada para extrair nome do lead (consulta a base de contatos)
2. **Validação de Variáveis**: Adicionar validação para evitar loops infinitos na substituição
3. **Preview em Tempo Real**: Mostrar preview da mensagem final no diálogo de configuração
4. **Histórico de Variáveis**: Manter histórico de valores utilizados para análise
5. **Testes Automatizados**: Criar testes unitários para as funções de substituição de variáveis