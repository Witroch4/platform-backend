-- Script para adicionar appUserId à tabela UsuarioChatwit
-- Execute este script no seu banco PostgreSQL

-- 1. Adicionar a coluna appUserId como nullable primeiro
ALTER TABLE "UsuarioChatwit" ADD COLUMN "appUserId" TEXT;

-- 2. Buscar o primeiro usuário do sistema para usar como padrão
-- (Substitua 'USER_ID_AQUI' pelo ID real do primeiro usuário)
UPDATE "UsuarioChatwit" 
SET "appUserId" = (
    SELECT id FROM "User" 
    ORDER BY "createdAt" 
    LIMIT 1
);

-- 3. Tornar a coluna NOT NULL
ALTER TABLE "UsuarioChatwit" ALTER COLUMN "appUserId" SET NOT NULL;

-- 4. Adicionar a constraint UNIQUE
ALTER TABLE "UsuarioChatwit" ADD CONSTRAINT "UsuarioChatwit_appUserId_key" UNIQUE ("appUserId");

-- 5. Adicionar a foreign key
ALTER TABLE "UsuarioChatwit" ADD CONSTRAINT "UsuarioChatwit_appUserId_fkey" 
FOREIGN KEY ("appUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; 