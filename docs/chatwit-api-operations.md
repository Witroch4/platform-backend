# Operações de API do Chatwit (Chatwoot Fork)

Este documento detalha como executar operações avançadas via API no Chatwit, focando especialmente em Ações em Massa (Bulk Actions) e manipulação de Labels, funcionalidades essenciais para automação via Agent Bots e scripts externos.

## 1. Autenticação e Base URL

Todas as requisições descritas aqui utilizam a **Application API** do Chatwoot.

*   **Base URL:** `https://seu-chatwit.com/api/v1` (ajuste para seu domínio)
*   **Header Obrigatório:** `api_access_token: {seu_token}`

> **Nota para Agent Bots:** Utilize o `access_token` fornecido na criação do Bot para autenticar as requisições. O Bot age como um usuário/agente na plataforma.

---

## 2. Ações em Massa (Bulk Actions)

O Chatwit possui um endpoint específico para aplicar ações em múltiplas conversas simultaneamente. É o mesmo endpoint utilizado pela interface quando você seleciona várias conversas na listagem.

**Endpoint:**
`POST /api/v1/accounts/{account_id}/conversations/bulk_action`

### Estrutura do Payload
O corpo da requisição deve conter:
1.  `ids`: Array com os IDs das conversas a serem afetadas.
2.  `type`: Sempre `"conversation_update"`.
3.  `fields`: Objeto contendo os campos a serem alterados.

### Exemplos de Uso

#### A. Atribuir Agente (Assign Agent)
Atribui as conversas selecionadas a um agente específico.

```json
{
  "ids": [102, 105, 108],
  "type": "conversation_update",
  "fields": {
    "assignee_id": 1
  }
}
```

#### B. Resolver Conversas (Resolve)
Altera o status de múltiplas conversas para "Resolvido".

```json
{
  "ids": [102, 105],
  "type": "conversation_update",
  "fields": {
    "status": "resolved"
  }
}
```

#### C. Adiar Conversas (Snooze)
Coloca as conversas em estado de "Snooze" até uma data específica ou indefinidamente.

```json
{
  "ids": [102],
  "type": "conversation_update",
  "fields": {
    "status": "snoozed",
    "snoozed_until": 1715436000
  }
}
```
*`snoozed_until` é um timestamp Unix (segundos).*

#### D. Adicionar Labels em Massa
**Atenção:** Esta operação **sobrescreve** a lista de labels atual das conversas selecionadas. Todas as conversas passarão a ter exatamente a lista de labels enviada.

```json
{
  "ids": [102, 103],
  "type": "conversation_update",
  "fields": {
    "labels": ["suporte", "prioridade-alta"]
  }
}
```

---

## 3. Gerenciamento de Labels

### A. Adicionar/Alterar Labels (Individual)
Para alterar as labels de uma *única* conversa. Assim como no Bulk, isso **substitui** as labels existentes.

**Endpoint:**
`POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/labels`

**Payload:**
```json
{
  "labels": ["nova-label", "cliente-vip"]
}
```

### B. Estratégia para "Append" (Adicionar sem remover)
A API não possui um método nativo "ADICIONAR LABEL X" que preserve as anteriores. Para fazer isso (seja individualmente ou em massa), seu script/Bot deve:

1.  Ler os detalhes da conversa (`GET /conversations/{id}`) para obter as labels atuais.
2.  Adicionar a nova label ao array recuperado.
3.  Enviar o array atualizado para o endpoint de labels ou `bulk_action`.

---

## 4. Agent Bot: Boas Práticas

Ao desenvolver um Agent Bot para o Chatwit:

1.  **Escute os Webhooks:** O Bot deve reagir a eventos (ex: `message_created`, `conversation_created`).
2.  **Use a API como Agente:** Use o token do Bot para executar as ações descritas acima.
3.  **Context-Aware:** Antes de executar uma ação (ex: resolver), verifique o status atual da conversa no payload do webhook para evitar chamadas redundantes.

---

## 5. Integração com Flow Builder (Novo)

Este guia descreve como criar nós personalizados no Flow Builder (`app/admin/mtf-diamante/components/flow-builder`) que executam as operações de API descritas acima durante a execução do fluxo.

### Visão Geral da Arquitetura

1.  **Canvas (Frontend):** O usuário configura a ação (ex: "Resolver Conversa") no editor visual.
2.  **Flow Engine (Runtime):** O executor processa o nó e realiza a chamada à API do Chatwit usando o token do Bot ou do Admin.

### Passo 1: Definir Novos Tipos de Nó

Adicione os novos tipos de nó nos arquivos de definição (`types/`).

**Em `types/flow-engine.ts` (Runtime Enum):**
```typescript
export type FlowNodeType =
    // ... existentes
    | "CHATWIT_ACTION" // Nó genérico para ações de API
    | "ASSIGN_AGENT"   // Específico para atribuição
    | "RESOLVE_CONVERSATION"; // Específico para resolver
```

**Em `types/flow-builder/nodes.ts` (Data Interfaces):**
```typescript
/**
 * Dados para nó de Ação Chatwit Genérica
 */
export interface ChatwitActionNodeData extends FlowNodeDataBase {
    actionType: "resolve" | "snooze" | "assign" | "add_label";
    // Parâmetros específicos da ação
    assigneeId?: string;
    labelsToAdd?: string[];
    snoozeUntil?: number;
}
```

### Passo 2: Criar Componente Visual (Frontend)

Crie o componente React que renderiza o nó no Canvas.
Exemplo: `app/admin/mtf-diamante/components/flow-builder/nodes/ChatwitActionNode.tsx`

```tsx
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Settings, CheckCircle, UserPlus, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

export const ChatwitActionNode = memo(({ data, selected }: any) => {
    // Ícone dinâmico baseado no tipo de ação
    const getIcon = () => {
        switch (data.actionType) {
            case "resolve": return <CheckCircle className="h-5 w-5" />;
            case "assign": return <UserPlus className="h-5 w-5" />;
            case "add_label": return <Tag className="h-5 w-5" />;
            default: return <Settings className="h-5 w-5" />;
        }
    };

    return (
        <div className={cn("min-w-[150px] bg-card border-2 rounded-lg p-3 shadow-sm", selected && "border-primary")}>
             <Handle type="target" position={Position.Top} className="!bg-primary" />
             
             <div className="flex items-center gap-2">
                 <div className="p-2 bg-muted rounded-full">{getIcon()}</div>
                 <div>
                     <p className="text-sm font-bold">{data.label || "Ação Chatwit"}</p>
                     <p className="text-xs text-muted-foreground capitalize">{data.actionType}</p>
                 </div>
             </div>

             <Handle type="source" position={Position.Bottom} className="!bg-primary" />
        </div>
    );
});
```

**Registrar no `FlowCanvas.tsx`:**
```typescript
const nodeTypes = {
    // ...
    [FlowNodeType.CHATWIT_ACTION]: ChatwitActionNode,
};
```

### Passo 3: Implementar Execução no Runtime

No motor de execução (`services/flow-engine/FlowExecutor.ts` ou similar), adicione o handler para o novo tipo de nó.

```typescript
// Exemplo conceitual do handler no FlowExecutor
async function executeChatwitActionNode(node: RuntimeFlowNode, context: DeliveryContext) {
    const { actionType, assigneeId, labelsToAdd } = node.config as ChatwitActionNodeData;
    const { conversationId, accountId, chatwitAccessToken, chatwitBaseUrl } = context;

    const headers = {
        "api_access_token": chatwitAccessToken,
        "Content-Type": "application/json"
    };

    switch (actionType) {
        case "resolve":
            // Opção A: Usar endpoint individual (fácil)
            await fetch(`${chatwitBaseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_status`, {
                method: "POST",
                headers,
                body: JSON.stringify({ status: "resolved" })
            });
            // Opção B: Usar Bulk Action (conforme doc acima)
            await fetch(`${chatwitBaseUrl}/api/v1/accounts/${accountId}/conversations/bulk_action`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    ids: [conversationId],
                    type: "conversation_update",
                    fields: { status: "resolved" }
                })
            });
            break;

        case "assign":
            if (!assigneeId) throw new Error("Assignee ID required");
            await fetch(`${chatwitBaseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`, {
                method: "POST",
                headers,
                body: JSON.stringify({ assignee_id: parseInt(assigneeId) })
            });
            break;
            
        case "add_label":
             // 1. Buscar labels atuais
             const convRes = await fetch(`${chatwitBaseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}`, { headers });
             const convData = await convRes.json();
             const currentLabels = convData.labels || [];
             
             // 2. Append novas labels
             const newLabels = [...new Set([...currentLabels, ...(labelsToAdd || [])])];
             
             // 3. Atualizar
             await fetch(`${chatwitBaseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`, {
                method: "POST",
                headers,
                body: JSON.stringify({ labels: newLabels })
            });
            break;
    }
}
```

### Resumo das Operações Suportadas

| Nó / Ação | Endpoint Chatwit Usado | Payload Típico |
| :--- | :--- | :--- |
| **Resolver** | `POST .../status` ou `bulk_action` | `{ status: "resolved" }` |
| **Atribuir** | `POST .../assignments` | `{ assignee_id: 123 }` |
| **Adicionar Tag** | `POST .../labels` | `{ labels: ["tag1", "tag2"] }` |
| **Snooze** | `POST .../bulk_action` | `{ status: "snoozed", snoozed_until: ... }` |

Use estas referências para expandir a capacidade do seu Flow Builder, permitindo que ele gerencie não apenas mensagens, mas também o estado operacional das conversas no Chatwit.
