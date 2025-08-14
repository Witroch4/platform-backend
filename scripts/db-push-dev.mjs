#!/usr/bin/env node
/* scripts/db-push-dev.js */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'prisma', 'migrations')

// 1. Deleta a pasta de migrações antigas, se existir.
if (fs.existsSync(MIGRATIONS_DIR)) {
  console.log('🗑️  Removendo prisma/migrations…')
  fs.rmSync(MIGRATIONS_DIR, { recursive: true, force: true })
}

// 2. Reseta o banco de dados sem rodar o seed.
console.log('💥 Resetando o banco de dados (sem seed)...')
execSync('npx prisma migrate reset --force --skip-seed', { stdio: 'inherit' })

// 3. Cria o arquivo da migração "init".
console.log('✨ Gerando migração init (create-only)…')
execSync('npx prisma migrate dev --name init --create-only', { stdio: 'inherit' })

// 4. Insere a extensão pgvector no topo do arquivo SQL.
const initDir = fs.readdirSync(MIGRATIONS_DIR).find((d) => d.endsWith('_init'))
if (!initDir) {
  console.error('❌ Não achei pasta *_init dentro de prisma/migrations')
  process.exit(1)
}
const migrationFile = path.join(MIGRATIONS_DIR, initDir, 'migration.sql')
let sql = fs.readFileSync(migrationFile, 'utf-8')
const header = 'CREATE EXTENSION IF NOT EXISTS vector;\n\n'
if (!sql.startsWith(header)) {
  console.log('⚙️  Injetando pgvector no topo de migration.sql…')
  sql = header + sql
  fs.writeFileSync(migrationFile, sql, 'utf-8')
}

// 5. APLICA a migração pendente de forma não-interativa.
console.log('🚀 Aplicando migrações (prisma migrate deploy)…')
execSync('npx prisma migrate deploy', { stdio: 'inherit' })

// 6. EXECUTA o seed explicitamente com tsx (garante .env e tsconfig)
console.log('🌱 Executando seed…')
execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' })

console.log('🎉 Banco pronto e populado!')