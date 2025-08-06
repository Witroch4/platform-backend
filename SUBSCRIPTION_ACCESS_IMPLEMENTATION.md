# Implementação de Controle de Acesso por Assinatura

## Resumo

Foi implementado um sistema de controle de acesso que permite que apenas usuários com assinatura ativa ou emails específicos na lista de exceções acessem certas funcionalidades.

## Emails com Acesso Liberado

Os seguintes emails têm acesso liberado independentemente do status da assinatura:

- `amandasousa22.adv@gmail.com`
- `witalorocha216@gmail.com`
- `witalo_rocha@outlook.com`

## Arquivos Criados/Modificados

### 1. `lib/subscription-access.ts`

- Função `checkSubscriptionAccess()`: Verifica se o usuário tem acesso (assinatura ativa ou email liberado)
- Função `isExemptedEmail()`: Verifica se um email está na lista de exceções
- Lista `EXEMPTED_EMAILS`: Contém os emails com acesso liberado

### 2. `components/subscription-guard.tsx`

- Componente React que protege rotas que requerem assinatura
- Exibe interface amigável quando o acesso é negado
- Mostra badge especial para usuários com acesso liberado

### 3. `app/[accountid]/dashboard/automacao/layout.tsx`

- Layout específico para a rota de automação
- Aplica o `SubscriptionGuard` automaticamente

### 4. `middleware.ts` (modificado)

- Adicionada verificação de assinatura no middleware
- Redireciona usuários sem acesso para `/assine-agora`
- Permite acesso para emails na lista de exceções

### 5. `app/api/subscription/access/route.ts`

- API endpoint para verificar acesso de assinatura
- Retorna informações sobre o tipo de acesso (assinatura ativa ou email liberado)

### 6. `scripts/test-subscription-access.ts`

- Script de teste para verificar se os emails estão sendo reconhecidos corretamente

## Como Funciona

### 1. Verificação no Middleware

- Quando um usuário acessa uma rota protegida (ex: `/dashboard/automacao`)
- O middleware verifica se o email está na lista de exceções
- Se não estiver, verifica se tem assinatura ativa via cookie
- Redireciona para `/assine-agora` se não tiver acesso

### 2. Verificação no Frontend

- O componente `SubscriptionGuard` faz uma verificação adicional
- Consulta a API `/api/subscription/access` para confirmar o acesso
- Exibe interface apropriada baseada no resultado

### 3. Tipos de Acesso

- `exempted_email`: Email está na lista de exceções
- `active_subscription`: Usuário tem assinatura ativa
- `no_access`: Usuário não tem acesso

## Rotas Protegidas

Atualmente, as seguintes rotas requerem assinatura ou email liberado:

- `/dashboard/automacao/*`

## Logs

O sistema gera logs detalhados para debug:

- `[Middleware]`: Logs do middleware de verificação
- `[Subscription Access]`: Logs da verificação de acesso
- `[Subscription Middleware]`: Logs específicos de assinatura

## Testando

Para testar se um email está sendo reconhecido corretamente:

```bash
npx tsx scripts/test-subscription-access.ts
```

## Adicionando Novos Emails

Para adicionar novos emails à lista de exceções, edite o array `EXEMPTED_EMAILS` em:

- `lib/subscription-access.ts`
- `middleware.ts` (na seção de verificação de assinatura)

## Adicionando Novas Rotas Protegidas

Para proteger novas rotas, adicione-as ao array `subscriptionRequiredPaths` no `middleware.ts` ou crie um layout específico com `SubscriptionGuard`.
