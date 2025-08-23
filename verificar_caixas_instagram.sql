-- Script para verificar e configurar caixa do Instagram

-- 1. Verificar todas as caixas e seus tipos
SELECT 
  id,
  nome,
  "inboxId",
  "channelType",
  "createdAt"
FROM "ChatwitInbox"
ORDER BY "createdAt" DESC;

-- 2. Verificar a caixa específica da URL
SELECT 
  id,
  nome,
  "inboxId", 
  "channelType",
  "usuarioChatwitId"
FROM "ChatwitInbox" 
WHERE id = 'cmefk539m0001mw0lg1wjz4e8';

-- 3. Atualizar a caixa para ser do tipo Instagram (EXECUTAR APENAS SE NECESSÁRIO)
-- UPDATE "ChatwitInbox" 
-- SET "channelType" = 'Channel::Instagram'
-- WHERE id = 'cmefk539m0001mw0lg1wjz4e8';

-- 4. Verificar após a atualização
-- SELECT 
--   id,
--   nome,
--   "channelType"
-- FROM "ChatwitInbox" 
-- WHERE id = 'cmefk539m0001mw0lg1wjz4e8';

-- 5. Ver todos os tipos de canal existentes
SELECT DISTINCT "channelType", COUNT(*) as quantidade
FROM "ChatwitInbox"
GROUP BY "channelType"
ORDER BY quantidade DESC;
