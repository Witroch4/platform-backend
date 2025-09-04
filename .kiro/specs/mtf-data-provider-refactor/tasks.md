# Implementation Plan

## CRITICAL: File Tracking Instructions

**At the end of each task, you MUST:**

1. **IDENTIFY**: List ALL files created or modified during that task

2. **COMBINE**: Take the current task's "Files:" list + all files you actually created/modified

3. **UPDATE**: Add this COMBINED list to the next task's "Files:" section

4. **NEVER REPLACE**: Always ADD to existing files, never replace the list

5. **FORMAT**: `Task X - [Description] | Files: existing_file1.ts, existing_file2.tsx, new_file1.ts, new_file2.tsx`

**EXAMPLE:**

- Current task has: `Files: file1.ts, file2.tsx`

- You created: `file3.ts, file4.tsx`

- Next task should get: `Files: file1.ts, file2.tsx, file3.ts, file4.tsx`

This ensures complete context flow throughout the entire project.

## Não liste os testes, apenas os arquivos úteis da aplicação

- [x] 1. Criar estrutura base e tipos TypeScript | Files: [INITIAL TASK]
  - Criar diretório `app/admin/mtf-diamante/hooks/`
  - Criar arquivo `app/admin/mtf-diamante/lib/types.ts` com interfaces consolidadas
  - Criar arquivo `app/admin/mtf-diamante/lib/api-clients.ts` com funções de API
  - Definir tipos para todos os hooks dedicados (UseInteractiveMessagesReturn, UseCaixasReturn, etc.)
  - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
  - _Requirements: 1.1, 1.2_

- [x] 2. Implementar hook useInteractiveMessages | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts
  - [x] 2.1 Criar hook básico com useSWR para busca de mensagens
    - Implementar busca de dados com endpoint `/api/admin/mtf-diamante/interactive-messages`
    - Configurar opções do SWR (keepPreviousData, revalidateOnFocus, refreshInterval)
    - Adicionar suporte para pausar updates via parâmetro isPaused

    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 1.1, 1.2, 6.3, 6.4_

  - [x] 2.2 Implementar função addMessage com mutação otimista | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts
    - Criar função que segue padrão: mutate otimista → API call → mutate final
    - Implementar rollback automático em caso de erro
    - Adicionar suporte para IDs temporários e substituição por IDs reais
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.3 Implementar função updateMessage com mutação otimista | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts
    - Criar função para atualizar mensagem existente
    - Implementar lógica de map para encontrar e modificar item correto
    - Adicionar tratamento de buttonReactions atualizadas
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.4 Implementar função deleteMessage com mutação otimista | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts
    - Criar função para deletar mensagem
    - Implementar lógica de filter para remover item
    - Adicionar limpeza de reações associadas
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Implementar hook useCaixas | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts
  - [x] 3.1 Criar hook básico para busca de caixas
    - Implementar busca com endpoint `/api/admin/mtf-diamante/caixas`
    - Configurar opções do SWR apropriadas
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 1.1, 1.2_

  - [x] 3.2 Implementar funções de mutação para caixas | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts
    - Criar addCaixa, updateCaixa, deleteCaixa seguindo mesmo padrão
    - Implementar mutações otimistas com rollback
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Implementar hooks restantes (useLotes, useVariaveis, useApiKeys) | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts
  - [x] 4.1 Criar hook useLotes | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts
    - Implementar busca e mutações para lotes
    - Seguir mesmo padrão dos hooks anteriores
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4_

  - [x] 4.2 Criar hook useVariaveis | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts
    - Implementar busca e mutações para variáveis
    - Seguir mesmo padrão dos hooks anteriores
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4_

  - [x] 4.3 Criar hook useApiKeys | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts
    - Implementar busca e mutações para API keys
    - Seguir mesmo padrão dos hooks anteriores
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4_

- [x] 5. Criar endpoints de API separados | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts
  - [x] 5.1 Criar endpoints para mensagens interativas | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts
    - Implementar GET, POST, PUT, DELETE para `/api/admin/mtf-diamante/interactive-messages`
    - Adicionar suporte para query parameter inboxId
    - Implementar validação e tratamento de erros
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 5.2 Criar endpoints para caixas | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts, app/api/admin/mtf-diamante/interactive-messages/route.ts, app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts, app/api/admin/mtf-diamante/caixas/route.ts, app/api/admin/mtf-diamante/caixas/[id]/route.ts
    - [x] Implementar CRUD completo para `/api/admin/mtf-diamante/caixas`
    - [x] Seguir mesmo padrão dos endpoints de mensagens
    - [x] Criar hook useCaixas
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 5.3 Criar endpoints restantes (lotes, variáveis, api-keys) | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts, app/api/admin/mtf-diamante/interactive-messages/route.ts, app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts, app/api/admin/mtf-diamante/caixas/route.ts, app/api/admin/mtf-diamante/caixas/[id]/route.ts, app/api/admin/mtf-diamante/api-keys/route.ts, app/api/admin/mtf-diamante/api-keys/[id]/route.ts
    - [x] Implementar CRUD para cada tipo de dado (lotes e variáveis já existiam, criados api-keys)
    - [x] Criar hooks para lotes, variáveis e api-keys
    - [x] Manter consistência na estrutura de resposta
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 5.1, 5.4, 5.5_

- [x] 6. Refatorar MtfDataProvider | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts, app/api/admin/mtf-diamante/interactive-messages/route.ts, app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts, app/api/admin/mtf-diamante/caixas/route.ts, app/api/admin/mtf-diamante/caixas/[id]/route.ts, app/api/admin/mtf-diamante/api-keys/route.ts, app/api/admin/mtf-diamante/api-keys/[id]/route.ts
  - [x] 6.1 Simplificar provider para usar hooks dedicados | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts, app/api/admin/mtf-diamante/interactive-messages/route.ts, app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts, app/api/admin/mtf-diamante/caixas/route.ts, app/api/admin/mtf-diamante/caixas/[id]/route.ts, app/api/admin/mtf-diamante/api-keys/route.ts, app/api/admin/mtf-diamante/api-keys/[id]/route.ts, app/admin/mtf-diamante/context/MtfDataProvider.tsx, app/admin/mtf-diamante/components/MensagensInterativasTab.tsx, components/app-admin-dashboard.tsx
    - Remover lógica complexa de useRef, timers e proteções manuais
    - Integrar hooks dedicados internamente
    - Manter interface pública compatível para não quebrar componentes existentes
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 8.1, 8.2_

  - [x] 6.2 Implementar controle de pausa simplificado | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts, app/api/admin/mtf-diamante/interactive-messages/route.ts, app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts, app/api/admin/mtf-diamante/caixas/route.ts, app/api/admin/mtf-diamante/caixas/[id]/route.ts, app/api/admin/mtf-diamante/api-keys/route.ts, app/api/admin/mtf-diamante/api-keys/[id]/route.ts, app/admin/mtf-diamante/context/MtfDataProvider.tsx, app/admin/mtf-diamante/components/MensagensInterativasTab.tsx, components/app-admin-dashboard.tsx
    - Criar estado isPaused simples com useState

    - Passar isPaused para todos os hooks dedicados
    - Implementar pauseUpdates e resumeUpdates de forma limpa
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 4.3, 6.1, 6.2, 6.5_

  - [x] 6.3 Adicionar SWRConfig com fallback para SSR | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts, app/api/admin/mtf-diamante/interactive-messages/route.ts, app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts, app/api/admin/mtf-diamante/caixas/route.ts, app/api/admin/mtf-diamante/caixas/[id]/route.ts, app/api/admin/mtf-diamante/api-keys/route.ts, app/api/admin/mtf-diamante/api-keys/[id]/route.ts, app/admin/mtf-diamante/context/MtfDataProvider.tsx, app/admin/mtf-diamante/components/MensagensInterativasTab.tsx, components/app-admin-dashboard.tsx, app/admin/mtf-diamante/lib/ssr-helpers.ts, app/admin/mtf-diamante/context/SWR-Usage-Guide.md
    - Envolver provider com SWRConfig
    - Implementar suporte para dados iniciais via fallback
    - Configurar tratamento de erros centralizado
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 4.4, 7.1, 7.2_

  - [ ] 6.4 Manter funções de compatibilidade (deprecated) | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts, app/api/admin/mtf-diamante/interactive-messages/route.ts, app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts, app/api/admin/mtf-diamante/caixas/route.ts, app/api/admin/mtf-diamante/caixas/[id]/route.ts, app/api/admin/mtf-diamante/api-keys/route.ts, app/api/admin/mtf-diamante/api-keys/[id]/route.ts, app/admin/mtf-diamante/context/MtfDataProvider.tsx, app/admin/mtf-diamante/components/MensagensInterativasTab.tsx, components/app-admin-dashboard.tsx, app/admin/mtf-diamante/lib/ssr-helpers.ts, app/admin/mtf-diamante/context/SWR-Usage-Guide.md
    - Implementar saveMessage, updateMessagesCache como wrappers
    - Marcar como deprecated mas manter funcionando
    - Adicionar warnings de deprecação em desenvolvimento
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 8.3, 8.4, 8.5_

- [x] 7. Implementar tratamento de erros robusto | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts, app/api/admin/mtf-diamante/interactive-messages/route.ts, app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts, app/api/admin/mtf-diamante/caixas/route.ts, app/api/admin/mtf-diamante/caixas/[id]/route.ts, app/api/admin/mtf-diamante/api-keys/route.ts, app/api/admin/mtf-diamante/api-keys/[id]/route.ts, app/admin/mtf-diamante/context/MtfDataProvider.tsx, app/admin/mtf-diamante/components/MensagensInterativasTab.tsx, components/app-admin-dashboard.tsx, app/admin/mtf-diamante/lib/ssr-helpers.ts, app/admin/mtf-diamante/context/SWR-Usage-Guide.md, app/admin/mtf-diamante/lib/error-handling.ts, app/admin/mtf-diamante/lib/error-testing.ts
  - [x] 7.1 Configurar tratamento global de erros no SWRConfig
    - Implementar onError centralizado
    - Adicionar logging estruturado de erros
    - Configurar retry inteligente para erros 5xx
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 7.1, 7.4, 7.5_

  - [x] 7.2 Implementar rollback automático em todos os hooks | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts, app/api/admin/mtf-diamante/interactive-messages/route.ts, app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts, app/api/admin/mtf-diamante/caixas/route.ts, app/api/admin/mtf-diamante/caixas/[id]/route.ts, app/api/admin/mtf-diamante/api-keys/route.ts, app/api/admin/mtf-diamante/api-keys/[id]/route.ts, app/admin/mtf-diamante/context/MtfDataProvider.tsx, app/admin/mtf-diamante/components/MensagensInterativasTab.tsx, components/app-admin-dashboard.tsx, app/admin/mtf-diamante/lib/ssr-helpers.ts, app/admin/mtf-diamante/context/SWR-Usage-Guide.md, app/admin/mtf-diamante/lib/error-handling.ts, app/admin/mtf-diamante/lib/error-testing.ts
    - Garantir que todas as mutações tenham rollback em caso de falha
    - Testar cenários de erro para cada tipo de operação
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 7.2, 7.3_

- [ ] 8. Criar testes unitários para hooks dedicados | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts, app/api/admin/mtf-diamante/interactive-messages/route.ts, app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts, app/api/admin/mtf-diamante/caixas/route.ts, app/api/admin/mtf-diamante/caixas/[id]/route.ts, app/api/admin/mtf-diamante/api-keys/route.ts, app/api/admin/mtf-diamante/api-keys/[id]/route.ts, app/admin/mtf-diamante/context/MtfDataProvider.tsx, app/admin/mtf-diamante/components/MensagensInterativasTab.tsx, components/app-admin-dashboard.tsx, app/admin/mtf-diamante/lib/ssr-helpers.ts, app/admin/mtf-diamante/context/SWR-Usage-Guide.md, app/admin/mtf-diamante/lib/error-handling.ts, app/admin/mtf-diamante/lib/error-testing.ts
  - [ ] 8.1 Testes para useInteractiveMessages | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts, app/api/admin/mtf-diamante/interactive-messages/route.ts, app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts, app/api/admin/mtf-diamante/caixas/route.ts, app/api/admin/mtf-diamante/caixas/[id]/route.ts, app/api/admin/mtf-diamante/api-keys/route.ts, app/api/admin/mtf-diamante/api-keys/[id]/route.ts, app/admin/mtf-diamante/context/MtfDataProvider.tsx, app/admin/mtf-diamante/components/MensagensInterativasTab.tsx, components/app-admin-dashboard.tsx, app/admin/mtf-diamante/lib/ssr-helpers.ts, app/admin/mtf-diamante/context/SWR-Usage-Guide.md, app/admin/mtf-diamante/lib/error-handling.ts, app/admin/mtf-diamante/lib/error-testing.ts
    - Testar busca de dados, mutações otimistas, rollback
    - Testar estados de loading e tratamento de erros
    - Usar @testing-library/react-hooks para testes
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: Todos os requirements de teste_

  - [ ] 8.2 Testes para demais hooks | Files: [TO BE UPDATED FROM TASK 8.1]
    - Criar testes similares para useCaixas, useLotes, useVariaveis, useApiKeys
    - Garantir cobertura completa de funcionalidades
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: Todos os requirements de teste_

- [ ] 9. Criar testes de integração | Files: [TO BE UPDATED FROM TASK 8.2]
  - [ ] 9.1 Testes do MtfDataProvider refatorado
    - Testar se contexto expõe dados corretamente
    - Verificar independência entre diferentes tipos de dados
    - Testar funcionalidade de pausa/retomada
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: Todos os requirements de teste_

  - [ ] 9.2 Testes de compatibilidade | Files: [TO BE UPDATED FROM TASK 9.1]
    - Garantir que componentes existentes continuam funcionando
    - Testar funções deprecated mas mantidas
    - **AT TASK END: CRITICAL - Add ALL files from current task's "Files:" list + ALL files actually created/modified to the next task's "Files:" list. Do NOT replace, ADD to existing files.**
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 10. Otimização e documentação | Files: app/admin/mtf-diamante/lib/types.ts, app/admin/mtf-diamante/lib/api-clients.ts, app/admin/mtf-diamante/hooks/useInteractiveMessages.ts, app/admin/mtf-diamante/hooks/useCaixas.ts, app/admin/mtf-diamante/hooks/useLotes.ts, app/admin/mtf-diamante/hooks/useVariaveis.ts, app/admin/mtf-diamante/hooks/useApiKeys.ts, app/api/admin/mtf-diamante/interactive-messages/route.ts, app/api/admin/mtf-diamante/interactive-messages/[id]/route.ts, app/api/admin/mtf-diamante/caixas/route.ts, app/api/admin/mtf-diamante/caixas/[id]/route.ts, app/api/admin/mtf-diamante/api-keys/route.ts, app/api/admin/mtf-diamante/api-keys/[id]/route.ts, app/admin/mtf-diamante/context/MtfDataProvider.tsx, app/admin/mtf-diamante/components/MensagensInterativasTab.tsx, components/app-admin-dashboard.tsx, app/admin/mtf-diamante/lib/ssr-helpers.ts, app/admin/mtf-diamante/context/SWR-Usage-Guide.md, app/admin/mtf-diamante/lib/error-handling.ts, app/admin/mtf-diamante/lib/error-testing.ts, app/admin/mtf-diamante/lib/performance-utils.ts, app/admin/mtf-diamante/components/PerformanceMonitor.tsx, app/admin/mtf-diamante/lib/PERFORMANCE_GUIDE.md, app/admin/mtf-diamante/lib/cleanup-utils.ts, app/admin/mtf-diamante/lib/CLEANUP_SUMMARY.md
  - [x] 10.1 Otimizar performance
    - Verificar se cache granular está funcionando corretamente
    - Otimizar polling e revalidações
    - Medir e documentar melhorias de performance
    - _Requirements: 1.4, 2.5_

  - [x] 10.2 Limpeza de código legado
    - Remover código comentado e não utilizado
    - Simplificar imports e dependências
    - Verificar se todas as funcionalidades antigas foram migradas
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
