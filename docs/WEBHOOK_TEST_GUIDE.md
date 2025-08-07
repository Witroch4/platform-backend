# 🧪 Guia de Teste do Webhook Dialogflow

## Visão Geral

A página de teste do webhook (`/admin/webhook-test`) permite testar o endpoint do MTF Diamante com payloads reais do Dialogflow, facilitando o desenvolvimento e debug do sistema.

## 🎯 Funcionalidades

### 1. Testes Rápidos
- **Button Click Real**: Usa o payload real fornecido (button_reply)
- **Intent Test**: Testa com um intent simples modificado
- **Payload Customizado**: Permite testar com qualquer payload JSON

### 2. Status da Flash Intent
- Mostra se a Flash Intent está ativa globalmente
- Exibe status de cada componente do sistema
- Indica qual modo de processamento será usado

### 3. Configurações
- Permite alterar o número de telefone que receberá a mensagem
- Atualiza automaticamente o payload com o novo número

### 4. Monitoramento
- Mostra tempo de resposta do webhook
- Exibe headers importantes da resposta
- Logs detalhados no console

## 📱 Como Usar

### 1. Acesso
```
1. Faça login como ADMIN ou SUPERADMIN
2. Acesse /admin/webhook-test
3. Ou clique em "🧪 Teste de Webhook" no painel admin
```

### 2. Configurar Número
```
1. Altere o número de telefone no campo "Configurações do Teste"
2. Use formato internacional: +5511999999999
3. Este número receberá a mensagem de teste no WhatsApp
```

### 3. Executar Testes

#### Button Click Test
```
1. Clique em "Testar Button Click"
2. Simula o clique no botão "Finalizar"
3. Usa o payload real fornecido
```

#### Intent Test
```
1. Clique em "Testar Intent"
2. Simula um intent "Welcome" com texto "Olá"
3. Usa payload modificado do real
```

#### Payload Customizado
```
1. Cole um payload JSON na área de texto
2. Clique em "Enviar Payload Customizado"
3. Permite testar cenários específicos
```

## 📊 Interpretando Resultados

### Status da Resposta
- **200/202**: Sucesso - webhook processou corretamente
- **400**: Erro de validação - payload inválido
- **500**: Erro interno - problema no servidor

### Headers Importantes
- `x-correlation-id`: ID para rastrear a requisição
- `x-processing-mode`: Modo usado (flash/standard/legacy_fallback)
- `x-queue-used`: Fila utilizada (high_priority/low_priority)
- `x-response-time`: Tempo de resposta em ms

### Dados de Teste
- **Telefone**: Número que receberá a mensagem
- **Tipo**: intent ou button_reply
- **Intent**: Nome do intent processado
- **Button ID**: ID do botão clicado (se aplicável)
- **Tempo de Resposta**: Latência do webhook

## 🔍 Payload Real Analisado

O payload fornecido contém:

### Dados do Contato
```json
{
  "contact_name": "Witalo Rocha",
  "contact_phone": "+558597550136",
  "contact_id": 1447,
  "conversation_id": 1988
}
```

### Dados do WhatsApp
```json
{
  "business_id": "294585820394901",
  "phone_number_id": "274633962398273",
  "inbox_id": 4,
  "wamid": "wamid.HBgMNTU4NTk3NTUwMTM2..."
}
```

### Dados da Interação
```json
{
  "interaction_type": "button_reply",
  "intent": "Finalizar",
  "button_id": "btn_1753326794020_tbc27gtbw",
  "button_title": "Finalizar"
}
```

### Dados da Conta
```json
{
  "account_name": "DraAmandaSousa",
  "account_id": 3,
  "inbox_name": "WhatsApp - ANA",
  "channel_type": "Channel::Whatsapp"
}
```

## ⚡ Flash Intent no Teste

### Quando Ativa
- Processamento de alta prioridade (priority: 100)
- Resposta mais rápida (< 100ms target)
- Usa fila `resposta-rapida.queue`
- Headers mostram `x-processing-mode: flash`

### Quando Inativa
- Processamento padrão (priority: 1)
- Resposta normal (< 5s target)
- Usa fila `persistencia-credenciais.queue`
- Headers mostram `x-processing-mode: standard`

## 🐛 Troubleshooting

### Erro 401 - Unauthorized
```
Problema: Usuário não tem permissão
Solução: Fazer login como ADMIN ou SUPERADMIN
```

### Erro 400 - Bad Request
```
Problema: Payload JSON inválido
Solução: Verificar sintaxe do JSON no payload customizado
```

### Erro 500 - Internal Server Error
```
Problema: Erro no webhook ou dependências
Solução: 
1. Verificar logs do servidor
2. Verificar se Redis está funcionando
3. Verificar se workers estão rodando
```

### Webhook não responde
```
Problema: Timeout ou erro de rede
Solução:
1. Verificar se o servidor está rodando
2. Verificar conectividade de rede
3. Verificar logs do webhook
```

### Mensagem não chega no WhatsApp
```
Problema: Credenciais ou configuração do WhatsApp
Solução:
1. Verificar se o token do WhatsApp é válido
2. Verificar se o phone_number_id está correto
3. Verificar se o número de destino é válido
4. Verificar logs do worker
```

## 📝 Logs Importantes

### Console do Navegador
```javascript
// Payload sendo enviado
"Enviando payload para webhook:", payload

// Resposta recebida
"Resposta do webhook:", response
```

### Logs do Servidor
```
[Webhook Test] Enviando teste de webhook para +558597550136
[Webhook Test] Enviando para: http://localhost:3000/api/admin/mtf-diamante/dialogflow/webhook
[Webhook Test] Resposta recebida em 45ms
```

### Logs do Webhook
```
[MTF Diamante Dispatcher] [1234567890-abc123] Received Dialogflow request
[Flash Intent] Status para usuário user-123: ATIVA
[Flash Intent] Processando com ALTA PRIORIDADE
[Resposta Rapida] Job enqueued: resposta-button_reply-1234567890-abc123
```

## 🔧 Desenvolvimento

### Modificar Payload
Para testar cenários específicos, modifique o payload:

```javascript
// Alterar tipo de interação
payload.originalDetectIntentRequest.payload.interaction_type = "intent";

// Alterar intent
payload.queryResult.intent.displayName = "MeuIntent";

// Alterar button ID
payload.originalDetectIntentRequest.payload.button_id = "meu_botao_123";

// Alterar número de telefone
payload.originalDetectIntentRequest.payload.contact_phone = "+5511999999999";
```

### Adicionar Novos Testes
Para adicionar novos cenários de teste:

1. Crie uma nova função no componente
2. Modifique o payload base conforme necessário
3. Adicione um novo card na seção "Testes Rápidos"
4. Teste e documente o comportamento esperado

### Monitoramento Avançado
Para monitoramento mais detalhado:

1. Abra as ferramentas de desenvolvedor (F12)
2. Vá para a aba "Network" para ver requisições HTTP
3. Vá para a aba "Console" para ver logs detalhados
4. Use `npm run flash-intent -- stats` para ver estatísticas das filas

## 🚀 Próximos Passos

1. **Testar cenários reais**: Use payloads de produção
2. **Validar Flash Intent**: Confirme que está funcionando corretamente
3. **Medir performance**: Compare tempos com/sem Flash Intent
4. **Testar fallbacks**: Simule falhas para testar recuperação
5. **Documentar resultados**: Registre comportamentos observados

Esta ferramenta é essencial para validar que o sistema de respostas rápidas está funcionando corretamente antes de colocar em produção!