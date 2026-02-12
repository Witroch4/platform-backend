#!/bin/bash
# Script de reprodução para investigar erro 404 no Chatwit

BASE_URL="https://chatwit.witdev.com.br"
ACCOUNT_ID="3"
CONVERSATION_ID="2724"
TOKEN="5rxTkF7gs9H9E9jqEW4fqeas"

echo "🔍 Testando conectividade com Chatwit..."
echo "URL Base: $BASE_URL"
echo "Account: $ACCOUNT_ID"
echo "Conversation: $CONVERSATION_ID"
echo "Token: $TOKEN"
echo "----------------------------------------"

# 1. Verificar se a conversa existe (GET)
echo "1️⃣  GET Conversation Details..."
curl -s -X GET "$BASE_URL/api/v1/accounts/$ACCOUNT_ID/conversations/$CONVERSATION_ID"   -H "api_access_token: $TOKEN"   -H "Content-Type: application/json"   -w "\nCODE: %{http_code}\n"

echo "----------------------------------------"

# 2. Tentar enviar mensagem (POST) - Simulando o erro
echo "2️⃣  POST Message (Async Delivery)..."
curl -s -X POST "$BASE_URL/api/v1/accounts/$ACCOUNT_ID/conversations/$CONVERSATION_ID/messages"   -H "api_access_token: $TOKEN"   -H "Content-Type: application/json"   -d '{
    "content": "Teste curl direto do SocialWise",
    "message_type": "outgoing"
  }'   -w "\nCODE: %{http_code}\n"

echo "----------------------------------------"
echo "✅ Fim do teste."
