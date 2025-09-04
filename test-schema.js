// Teste rápido do schema
import { validateSocialWisePayloadWithPreprocessing } from './lib/socialwise-flow/schemas/payload.ts';

const testPayload = {
  "session_id": "1002859634954741",
  "message": "Falar com a Dra",
  "channel_type": "Channel::Instagram",
  "language": "pt-BR",
  "context": {
    "message": {
      "id": 36029,
      "content": "Falar com a Dra",
      "account_id": 3,
      "inbox_id": 105,
      "conversation_id": 2132,
      "message_type": "incoming",
      "created_at": "2025-08-13T23:02:06.966Z",
      "updated_at": "2025-08-13T23:02:06.966Z",
      "source_id": "test_source_id",
      "content_type": "text",
      "sender_type": "Contact",
      "sender_id": 1885
    },
    "conversation": {
      "id": 2132,
      "account_id": 3,
      "inbox_id": 105,
      "status": "pending",
      "created_at": "2025-08-12T17:30:10.706Z",
      "updated_at": "2025-08-13T23:00:33.753Z",
      "contact_id": 1885
    },
    "contact": {
      "id": 1885,
      "name": "Witalo Rocha",
      "account_id": 3,
      "created_at": "2025-07-25T11:02:03.286Z",
      "updated_at": "2025-08-13T23:00:33.799Z"
    },
    "inbox": {
      "id": 105,
      "account_id": 3,
      "name": "dra.amandasousadv",
      "created_at": "2025-07-25T10:44:53.201Z",
      "updated_at": "2025-07-25T10:44:53.201Z",
      "channel_type": "Channel::Instagram"
    }
  }
};

const result = validateSocialWisePayloadWithPreprocessing(testPayload);
console.log('Validation result:', {
  success: result.success,
  hasData: !!result.data,
  error: result.error?.issues?.[0]
});
