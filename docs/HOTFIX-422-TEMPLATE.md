# Hotfix: Erro 422 - Template Rejection (Flow Builder)

> **Data:** 22 de Fevereiro de 2026  
> **Status:** Resolvido ✅  
> **Contexto:** Flow Builder → Disparo de WhatsApp Template via Chatwit

## 🚨 O Problema

Ao disparar templates via Flow Builder, o Chatwit retornava **HTTP 422 Unprocessable Entity**.

### Causa Raiz
1. **Enum Mismatch (Chatwit):** O SocialWise estava enviando o payload com `content_type: 'template'`. No entanto, o model `Message.rb` do Chatwit não possui `'template'` no seu enum de `content_type`, causando um `ArgumentError` silencioso que resultava em 422.
2. **Layout não-nativo:** O payload estava sendo estruturado de forma customizada (`content_attributes: { template_payload: ... }`), o que exigia modificações não-standard no backend do Chatwit.

## 🛠️ A Solução

Em vez de forçar um novo `content_type`, alinhamos o SocialWise ao **padrão nativo do Chatwit** para envio de templates via API.

### 1. Novo Payload Nativo
O Chatwit processa templates nativamente quando os dados são enviados em `additional_attributes.template_params`.

**Estrutura adotada:**
```json
{
  "content": "[Template: nome_do_template]",
  "message_type": "outgoing",
  "template_params": {
    "name": "nome_do_template",
    "language": "pt_BR",
    "processed_params": {
      "body": { "var1": "valor1" },
      "header": { "media_url": "...", "media_type": "image" },
      "buttons": [ { "type": "copy_code", "parameter": "CUPOM123" } ]
    }
  }
}
```

### 2. Mudanças no Código (SocialWise)

| Arquivo | Mudança |
|---------|---------|
| `lib/flow-builder/templateElements.ts` | Adicionada função `buildChatwitTemplateParams` para converter `TemplateNodeData` no formato nativo. |
| `services/flow-engine/chatwit-delivery-service.ts` | Reescrito `deliverTemplate()` para enviar `template_params` no body do POST. |
| `services/flow-engine/flow-executor.ts` | Atualizado para usar o novo builder de parâmetros. |
| `build.sh` | **Ordem de Deploy:** Invertida para atualizar o `worker` antes da `app`. Isso evita que a `app` nova envie payloads novos para um `worker` velho (Race Condition). |

## 📦 Deploy e Race Condition

**Pergunta:** É necessário um delay após o push para evitar Race Condition?

**Resposta:** **SIM.**
Alteramos o `build.sh` para garantir que:
1. O `worker` atualize **primeiro**.
2. Haja um **delay de 10 segundos** antes de atualizar a `app`.

Isso garante que, quando a `app` começar a enviar templates no formato novo, os `workers` já estejam rodando a versão capaz de processar esse formato (ou pelo menos em processo de rollout avançado).

## 📝 Referências
- Chatwit Contract: `chatwitv4.10/chatwitdocs/chatwit-contrato-async-30s.md` (v1.9.0)
- Chatwoot Service: `app/services/whatsapp/send_on_whatsapp_service.rb` (checa `template_params`)
