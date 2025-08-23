# Teste de Detecção de Canal Instagram

## Como Testar

1. **Criar uma caixa Instagram no banco de dados**:
   - Acessar o banco de dados
   - Na tabela `ChatwitInbox`, criar um registro com `channelType = 'Channel::Instagram'`

2. **Verificar no Console do Navegador**:
   - Abrir as ferramentas de desenvolvedor
   - Navegar para `/admin/mtf-diamante/inbox/{INBOX_ID}`
   - Procurar logs com `🔍 [InteractiveMessageCreator] Canal detectado:`

3. **Testar a Interface**:
   - Clicar em "Mensagens Interativas"
   - Verificar se aparece o badge "Instagram" no seletor de tipos
   - Confirmar que apenas 3 tipos aparecem: Quick Replies, Generic Template, Button Template

## Dados de Teste Instagram

```sql
-- Exemplo para criar uma caixa Instagram
UPDATE "ChatwitInbox" 
SET "channelType" = 'Channel::Instagram'
WHERE "id" = 'cmefk539m0001mw0lg1wjz4e8';
```

## Expected Behavior

### Para Canal Instagram:
- Badge azul "Instagram" aparece no cabeçalho
- Apenas 3 tipos de mensagem disponíveis
- Limites específicos do Instagram mostrados
- Interface adaptada (sem "Document" no header, etc.)

### Para Canal WhatsApp:
- Badge verde "WhatsApp" aparece
- 8 tipos de mensagem disponíveis
- Limites do WhatsApp aplicados

## Debug Info

Os logs no console mostrarão:
- `inboxId`: ID da caixa atual
- `channelType`: Tipo detectado
- `inboxData`: Dados da caixa encontrada
- `totalCaixas`: Total de caixas carregadas
- `todasCaixas`: Lista de todas as caixas com seus tipos
