-- Verificar configuração do inbox 4
\echo '🔍 Verificando inbox 4...'
SELECT 
  ci."inboxId",
  ci.nome,
  ci."usuarioChatwitId",
  uc."appUserId",
  uc."chatwitAccountId"
FROM "ChatwitInbox" ci 
LEFT JOIN "UsuarioChatwit" uc ON ci."usuarioChatwitId" = uc.id 
WHERE ci."inboxId" = '4';

\echo ''
\echo '🤖 Verificando assistants linkados...'
SELECT 
  aai.id as link_id,
  aa.id as assistant_id,
  aa.name as assistant_name,
  aa.model,
  aa."isActive",
  aa."updatedAt"
FROM "ChatwitInbox" ci 
LEFT JOIN "AiAssistantInbox" aai ON ci.id = aai."inboxDbId"
LEFT JOIN "AiAssistant" aa ON aai."assistantId" = aa.id
WHERE ci."inboxId" = '4';

\echo ''
\echo '🎯 Verificando assistants do usuário (fallback)...'
SELECT 
  aa.id,
  aa.name,
  aa.model,
  aa."isActive",
  aa."updatedAt"
FROM "ChatwitInbox" ci 
LEFT JOIN "UsuarioChatwit" uc ON ci."usuarioChatwitId" = uc.id 
LEFT JOIN "AiAssistant" aa ON uc."appUserId" = aa."userId"
WHERE ci."inboxId" = '4' AND aa."isActive" = true
ORDER BY aa."updatedAt" DESC;
