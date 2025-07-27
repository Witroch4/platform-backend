-- Configurar autenticação para aceitar conexões externas
ALTER SYSTEM SET listen_addresses = '*';
ALTER SYSTEM SET password_encryption = 'scram-sha-256';

-- Criar usuário e banco se não existirem
CREATE USER postgres WITH PASSWORD 'postgres' SUPERUSER;
CREATE DATABASE socialWise OWNER postgres;

-- Configurar permissões
GRANT ALL PRIVILEGES ON DATABASE socialWise TO postgres; 