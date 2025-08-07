# Análise de Padrões de Webhook - Guia de Uso dos Logs

Este documento explica como usar os logs `[OriginalRequestDialogflow]` para analisar diferentes padrões de payload do Dialogflow.

## Tipos de Logs Disponíveis

### 1. Log Completo do Payload Original
```
[OriginalRequestDialogflow] [correlationId] COMPLETE ORIGINAL PAYLOAD
```
**Contém:**
- Payload completo sem qualquer tratamento
- Headers da requisição
- Tamanho do payload
- Timestamp da requisição

**Uso:** Análise detalhada de estruturas específicas e debugging de problemas.

### 2. Log de Análise Estrutural
```
[OriginalRequestDialogflow] [correlationId] PAYLOAD STRUCTURE ANALYSIS
```
**Contém:**
- Presença de campos principais (responseId, queryResult, etc.)
- Detalhes do queryResult (intent, parâmetros, contextos)
- Informações do originalDetectIntentRequest
- Tipo de canal e interação

**Uso:** Identificação rápida de tipos de payload e campos ausentes.

### 3. Log de Detalhes do Chatwoot
```
[OriginalRequestDialogflow] [correlationId] CHATWOOT PAYLOAD DETAILS
```
**Contém:**
- Identificadores principais (inbox, conversation, message, contact, account)
- Informações de contato (telefone mascarado, nome, email)
- Dados específicos do WhatsApp (wamid, phoneNumberId, businessId)
- Detalhes da mensagem e interação
- Status da conversa e metadados

**Uso:** Análise de dados específicos do Chatwoot e WhatsApp.

### 4. Log de Padrões de Interação
```
[OriginalRequestDialogflow] [correlationId] BUTTON INTERACTION PATTERN
[OriginalRequestDialogflow] [correlationId] INTENT INTERACTION PATTERN
```
**Contém:**
- Tipo de interação detectado
- Método de detecção usado
- Dados específicos da interação (botão/intent)
- Contexto da mensagem original

**Uso:** Análise de diferentes tipos de interação e seus padrões.

### 5. Log de Análise de Canal
```
[OriginalRequestDialogflow] [correlationId] CHANNEL PATTERN ANALYSIS
```
**Contém:**
- Tipo de canal detectado
- Flags booleanos para diferentes canais
- Dados específicos por canal
- Informações de integração

**Uso:** Identificação de padrões específicos por canal (WhatsApp, Instagram, etc.).

### 6. Log de Análise Abrangente
```
[OriginalRequestDialogflow] [correlationId] COMPREHENSIVE PATTERN ANALYSIS
```
**Contém:**
- Análise completa automatizada
- Classificação do tipo de payload
- Verificação de campos obrigatórios
- Identificação de problemas potenciais
- Métricas de tamanho

**Uso:** Visão geral rápida e identificação automática de padrões.

### 7. Log de Análise de Erro
```
[OriginalRequestDialogflow] [correlationId] ERROR PATTERN ANALYSIS
```
**Contém:**
- Detalhes do erro ocorrido
- Possíveis causas identificadas
- Informações de debug
- Contexto da requisição

**Uso:** Debugging de problemas e identificação de padrões de erro.

## Como Usar os Logs para Análise

### 1. Identificação de Novos Padrões de Payload

**Buscar por:**
```bash
grep "COMPLETE ORIGINAL PAYLOAD" logs/webhook.log | jq '.fullPayload'
```

**Analisar:**
- Estruturas de payload não documentadas
- Novos campos adicionados pelo Chatwoot/Dialogflow
- Variações por tipo de canal

### 2. Debugging de Problemas Específicos

**Buscar por:**
```bash
grep "ERROR PATTERN ANALYSIS" logs/webhook.log
```

**Analisar:**
- Padrões de erro recorrentes
- Payloads malformados
- Problemas de sanitização

### 3. Análise de Tipos de Interação

**Buscar por:**
```bash
grep "INTERACTION PATTERN" logs/webhook.log
```

**Analisar:**
- Diferenças entre intent e button click
- Métodos de detecção mais confiáveis
- Variações na estrutura de dados

### 4. Análise por Canal

**Buscar por:**
```bash
grep "CHANNEL PATTERN ANALYSIS" logs/webhook.log
```

**Analisar:**
- Diferenças entre WhatsApp, Instagram, etc.
- Campos específicos por canal
- Padrões de integração

### 5. Monitoramento de Qualidade de Dados

**Buscar por:**
```bash
grep "COMPREHENSIVE PATTERN ANALYSIS" logs/webhook.log | jq '.analysis.potentialIssues'
```

**Analisar:**
- Campos obrigatórios ausentes
- Payloads com problemas
- Tendências de qualidade

## Exemplos de Padrões Identificados

### Padrão: Intent Simples
```json
{
  "payloadType": "intent",
  "channelType": "Channel::Whatsapp",
  "hasRequiredFields": true,
  "patternAnalysis": {
    "queryResult": {
      "hasQueryText": true,
      "hasIntent": true,
      "intentName": "saudacao",
      "confidence": 1.0
    },
    "chatwootPayload": {
      "interactionType": null,
      "hasButtonId": false,
      "messageType": "incoming"
    }
  }
}
```

### Padrão: Clique em Botão
```json
{
  "payloadType": "button_click",
  "channelType": "Channel::Whatsapp",
  "hasRequiredFields": true,
  "patternAnalysis": {
    "chatwootPayload": {
      "interactionType": "button_reply",
      "hasButtonId": true,
      "hasInteractive": true,
      "interactiveType": "button_reply"
    }
  }
}
```

### Padrão: Instagram
```json
{
  "payloadType": "intent",
  "channelType": "Channel::Instagram",
  "hasRequiredFields": true,
  "patternAnalysis": {
    "chatwootPayload": {
      "socialwiseActive": true,
      "isWhatsappChannel": false
    }
  }
}
```

## Scripts de Análise Úteis

### 1. Contar Tipos de Payload
```bash
#!/bin/bash
echo "=== Análise de Tipos de Payload ==="
grep "COMPREHENSIVE PATTERN ANALYSIS" logs/webhook.log | \
jq -r '.analysis.payloadType' | \
sort | uniq -c | sort -nr
```

### 2. Identificar Campos Ausentes
```bash
#!/bin/bash
echo "=== Campos Obrigatórios Ausentes ==="
grep "COMPREHENSIVE PATTERN ANALYSIS" logs/webhook.log | \
jq -r 'select(.analysis.hasRequiredFields == false) | .correlationId'
```

### 3. Análise de Canais
```bash
#!/bin/bash
echo "=== Distribuição por Canal ==="
grep "COMPREHENSIVE PATTERN ANALYSIS" logs/webhook.log | \
jq -r '.analysis.channelType' | \
sort | uniq -c | sort -nr
```

### 4. Problemas Potenciais
```bash
#!/bin/bash
echo "=== Problemas Identificados ==="
grep "COMPREHENSIVE PATTERN ANALYSIS" logs/webhook.log | \
jq -r '.analysis.patternAnalysis.potentialIssues[]' | \
sort | uniq -c | sort -nr
```

### 5. Análise de Tamanho de Payload
```bash
#!/bin/bash
echo "=== Estatísticas de Tamanho ==="
grep "COMPREHENSIVE PATTERN ANALYSIS" logs/webhook.log | \
jq -r '.analysis.patternAnalysis.payloadSize' | \
awk '{sum+=$1; count++} END {print "Média:", sum/count, "bytes"}'
```

## Alertas Automáticos

### 1. Payload Muito Grande
```bash
# Alerta para payloads > 100KB
grep "COMPREHENSIVE PATTERN ANALYSIS" logs/webhook.log | \
jq 'select(.analysis.patternAnalysis.payloadSize > 100000)' | \
jq -r '.correlationId + " - " + (.analysis.patternAnalysis.payloadSize | tostring) + " bytes"'
```

### 2. Campos Obrigatórios Ausentes
```bash
# Alerta para payloads com campos ausentes
grep "COMPREHENSIVE PATTERN ANALYSIS" logs/webhook.log | \
jq 'select(.analysis.hasRequiredFields == false)' | \
jq -r '.correlationId + " - Missing required fields"'
```

### 3. Tipos Desconhecidos
```bash
# Alerta para tipos de payload desconhecidos
grep "COMPREHENSIVE PATTERN ANALYSIS" logs/webhook.log | \
jq 'select(.analysis.payloadType == "unknown")' | \
jq -r '.correlationId + " - Unknown payload type"'
```

## Integração com Monitoramento

### Grafana Queries
```sql
-- Contagem de tipos de payload por hora
SELECT 
  time_bucket('1 hour', timestamp) as time,
  payload_type,
  count(*) as count
FROM webhook_patterns 
WHERE timestamp > now() - interval '24 hours'
GROUP BY time, payload_type
ORDER BY time;

-- Taxa de erro por canal
SELECT 
  channel_type,
  count(*) filter (where has_required_fields = false) * 100.0 / count(*) as error_rate
FROM webhook_patterns 
WHERE timestamp > now() - interval '1 hour'
GROUP BY channel_type;
```

### Alertmanager Rules
```yaml
groups:
- name: webhook_patterns
  rules:
  - alert: HighErrorRate
    expr: webhook_error_rate > 5
    for: 5m
    annotations:
      summary: "High webhook error rate detected"
      
  - alert: UnknownPayloadType
    expr: webhook_unknown_payload_count > 10
    for: 1m
    annotations:
      summary: "Multiple unknown payload types detected"
```

## Melhores Práticas

### 1. Análise Regular
- Execute scripts de análise diariamente
- Monitore tendências de tipos de payload
- Identifique padrões emergentes

### 2. Documentação de Padrões
- Documente novos padrões identificados
- Atualize validações baseadas em padrões reais
- Mantenha exemplos de payloads típicos

### 3. Alertas Proativos
- Configure alertas para padrões anômalos
- Monitore qualidade de dados
- Alerte sobre mudanças estruturais

### 4. Otimização Baseada em Dados
- Use análises para otimizar sanitização
- Ajuste validações baseadas em padrões reais
- Melhore performance baseada em tamanhos típicos

Este sistema de logging fornece visibilidade completa sobre os padrões de payload do Dialogflow, permitindo análise detalhada, debugging eficiente e otimização contínua do sistema de webhook.