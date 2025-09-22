#!/usr/bin/env node
/* eslint-disable no-console */
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");

// ---------- ENV ----------
const envFiles = process.env.NODE_ENV === 'production'
  ? ['.env.production', '.env']
  : ['.env.development', '.env.local', '.env'];

for (const file of envFiles) {
  const p = path.join(process.cwd(), file);
  if (fs.existsSync(p)) {
    console.log(`📄 Carregando variáveis de ambiente de: ${file}`);
    require('dotenv').config({ path: p });
    break;
  }
}

require("dotenv").config();

// ---------- ARGS & VARS ----------
function getArg(name, def) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : def;
}

const MODE = getArg("mode", process.env.NODE_ENV === "production" ? "deploy" : "reset"); // deploy | reset
const PRISMA_SCHEMA = getArg("schema", process.env.PRISMA_SCHEMA || ""); // opcional: --schema prisma/schema.prisma
const RETRIES = Number(process.env.DB_CONNECT_RETRIES || 60);
const SLEEP_MS = Number(process.env.DB_CONNECT_SLEEP_MS || 2000);
// Se não especificado via env, executa seed automaticamente em modo deploy (produção)
const RUN_SEED = String(process.env.PRISMA_RUN_SEED || (MODE === "deploy" ? "true" : "false")) === "true";
const ALLOW_DB_PUSH_FALLBACK = String(process.env.ALLOW_DB_PUSH_FALLBACK || "false") === "true";
const RUN_DB_PREPARE = (process.env.RUN_DB_PREPARE || "yes").toLowerCase(); // yes|no (recomendado: yes só no app)
const VECTOR_REQUIRED = String(process.env.VECTOR_REQUIRED || "true") === "true"; // se não conseguir habilitar vector, falha
const VECTOR_DIMS = Number(process.env.EMBEDDING_DIMS || 1536);
const VECTOR_DISTANCE = (process.env.VECTOR_DISTANCE || "cosine").toLowerCase(); // cosine|l2|ip
const VECTOR_INDEX_PREFERRED = (process.env.VECTOR_INDEX || "hnsw").toLowerCase(); // hnsw|ivfflat
const VECTOR_INDEX_LISTS = Number(process.env.VECTOR_IVFFLAT_LISTS || 100);
const HNSW_M = Number(process.env.VECTOR_HNSW_M || 16);
const HNSW_EF_CONSTRUCTION = Number(process.env.VECTOR_HNSW_EF_CONSTRUCTION || 64);

function vectorOps() {
  switch (VECTOR_DISTANCE) {
    case "l2":
      return "vector_l2_ops";
    case "ip":
      return "vector_ip_ops";
    default:
      return "vector_cosine_ops";
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function parseDbUrl(raw) {
  const url = new URL(raw);
  const params = url.search || "";
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username || ""),
    pass: decodeURIComponent(url.password || ""),
    db: (url.pathname || "").replace(/^\//, ""),
    adminUrl: `postgresql://${encodeURIComponent(url.username || "")}:${encodeURIComponent(url.password || "")}@${url.hostname}:${url.port || "5432"}/postgres${params}`,
  };
}
function run(cmd, env) {
  const full = PRISMA_SCHEMA ? `${cmd} --schema ${PRISMA_SCHEMA}` : cmd;
  execSync(full, { stdio: "inherit", env });
}

// Resolve Prisma CLI without relying on pnpm being installed in runtime
function getPrismaBin() {
  const binName = process.platform === 'win32' ? 'prisma.cmd' : 'prisma';
  const localBin = path.join(process.cwd(), 'node_modules', '.bin', binName);
  if (fs.existsSync(localBin)) return localBin;
  // Fallbacks: global install or PATH
  return 'prisma';
}
const PRISMA_BIN = getPrismaBin();

// ---------- HELPERS ----------
async function waitForConnection(prisma, label = "Postgres") {
  let lastErr;
  for (let i = 1; i <= RETRIES; i++) {
    try {
      await prisma.$connect();
      await prisma.$disconnect();
      return true;
    } catch (err) {
      lastErr = err;
      console.log(`⏳ Aguardando ${label} (${i}/${RETRIES})... ${err?.message || err}`);
      await sleep(SLEEP_MS);
    }
  }
  console.error(`❌ Não foi possível conectar ao ${label} no tempo limite.`);
  if (lastErr) console.error(lastErr);
  return false;
}

async function logServerInfo(prisma) {
  try {
    const ver = await prisma.$queryRawUnsafe(`SHOW server_version`);
    const sv = Array.isArray(ver) && ver[0] && ver[0].server_version ? ver[0].server_version : JSON.stringify(ver);
    console.log(`🧭 Postgres server_version: ${sv}`);
  } catch {}
  try {
    const ext = await prisma.$queryRawUnsafe(`SELECT extversion FROM pg_extension WHERE extname='vector'`);
    if (Array.isArray(ext) && ext[0] && ext[0].extversion) {
      console.log(`🧩 pgvector extversion: ${ext[0].extversion}`);
    } else {
      console.log("🧩 pgvector não está instalada (ainda).");
    }
  } catch {}
}

async function ensureDatabaseExists(adminPrisma, dbName) {
  const rows = await adminPrisma.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
  if (!rows || rows.length === 0) {
    console.log(`📝 Criando database '${dbName}'...`);
    try {
      await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`✅ Database '${dbName}' criado.`);
    } catch (err) {
      if ((err.code === "42P04") || /already exists/i.test(err.message)) {
        console.log(`✅ Database '${dbName}' já existe (concorrência).`);
      } else if (err.code === "42501" || /permission denied/i.test(err.message)) {
        console.error("🔒 Sem permissão para CREATE DATABASE. Crie o DB manualmente ou forneça credenciais com permissão.");
        throw err;
      } else {
        throw err;
      }
    }
  } else {
    console.log(`✅ Database '${dbName}' já existe.`);
  }
}

async function ensurePgVectorEnabled(prisma) {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    console.log("✅ Extensão pgvector habilitada no banco alvo.");
  } catch (err) {
    console.error("⚠️ Falha ao habilitar extensão pgvector:", err?.message || err);
    if (VECTOR_REQUIRED) {
      if (/permission denied/i.test(err?.message) || err?.code === "42501") {
        console.error("🔒 Permissão insuficiente para CREATE EXTENSION (use superuser ou fale com o DBA).");
      } else if (/could not open extension control file/i.test(err?.message) || err?.code === "42704") {
        console.error("📦 A extensão pgvector não está instalada no servidor Postgres.");
      }
      throw err;
    } else {
      console.warn("↪️ VECTOR_REQUIRED=false → seguindo sem pgvector (algumas features podem falhar).");
    }
  }
}

async function adjustEmbeddingColumnAndIndex(prisma, dims) {
  // 1) tabela existe?
  const existsTable = await prisma.$queryRaw`SELECT to_regclass('public."Intent"')::text AS reg`;
  if (!existsTable || !existsTable[0] || !existsTable[0].reg) {
    console.log('ℹ️ Tabela "Intent" ainda não existe (migrações cuidarão disso).');
    return;
  }

  // 2) coluna existe?
  const col = await prisma.$queryRaw`
    SELECT a.attname AS name, a.atttypid::regtype::text AS typ
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'Intent' AND a.attname = 'embedding' AND a.attnum > 0 AND NOT a.attisdropped
    LIMIT 1
  `;
  if (!col || col.length === 0) {
    console.log('ℹ️ Coluna "embedding" inexistente (migrações cuidarão disso).');
    return;
  }

  const typ = String(col[0].typ || "");
  if (!/vector/i.test(typ)) {
    console.log(`🛠️ Ajustando tipo de "embedding" para vector(${dims})... (era: ${typ})`);
    
    // Se for jsonb, primeiro converter para text, depois para vector
    if (typ.toLowerCase() === 'jsonb') {
      console.log("🔄 Convertendo jsonb → text → vector...");
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Intent"
        ALTER COLUMN "embedding" TYPE text USING "embedding"::text
      `);
      console.log("✅ Convertido para text.");
    }
    
    // Agora converter para vector
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Intent"
      ALTER COLUMN "embedding" TYPE vector(${dims}) USING "embedding"::vector
    `);
    console.log("✅ Tipo ajustado para vector.");
  } else {
    // confirmar dimensão
    const dimRow = await prisma.$queryRawUnsafe(`
      SELECT (a.atttypmod - 4) AS dims
      FROM pg_attribute a
      JOIN pg_class c ON a.attrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' AND c.relname = 'Intent' AND a.attname = 'embedding' AND a.attnum > 0 AND NOT a.attisdropped
      LIMIT 1
    `);
    const currentDims = dimRow && dimRow[0] ? Number(dimRow[0].dims) : null;
    if (currentDims && currentDims !== dims) {
      console.log(`🛠️ Corrigindo dimensão para vector(${dims})... (era: ${currentDims})`);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Intent"
        ALTER COLUMN "embedding" TYPE vector(${dims}) USING "embedding"::vector
      `);
      console.log("✅ Dimensão corrigida.");
    }
  }

  // 3) índice ANN com fallback
  const ops = vectorOps();
  const idxHnsw = `intent_embedding_hnsw`;
  const idxIvf = `intent_embedding_ivfflat`;
  const hasIndex = async (name) => {
    const row = await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'Intent' AND indexname = ${name}
    `;
    return row && row.length > 0;
  };

  async function createHNSW() {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS ${idxHnsw}
      ON "Intent" USING hnsw ("embedding" ${ops})
      WITH (m = ${HNSW_M}, ef_construction = ${HNSW_EF_CONSTRUCTION})
    `);
  }
  async function createIVFFLAT() {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS ${idxIvf}
      ON "Intent" USING ivfflat ("embedding" ${ops})
      WITH (lists = ${VECTOR_INDEX_LISTS})
    `);
  }

  const preferred = VECTOR_INDEX_PREFERRED;
  try {
    if (preferred === "hnsw") {
      if (!(await hasIndex(idxHnsw))) {
        console.log(`🛠️ Criando índice HNSW em "Intent.embedding"...`);
        await createHNSW();
        console.log("✅ HNSW criado.");
      } else {
        console.log("✅ Índice HNSW já existe.");
      }
    } else {
      if (!(await hasIndex(idxIvf))) {
        console.log(`🛠️ Criando índice IVFFLAT em "Intent.embedding"...`);
        await createIVFFLAT();
        console.log("✅ IVFFLAT criado.");
      } else {
        console.log("✅ Índice IVFFLAT já existe.");
      }
    }
  } catch (e) {
    console.warn(`⚠️ Falhou criar ${preferred.toUpperCase()} → fallback para ${preferred === "hnsw" ? "IVFFLAT" : "HNSW"} (${e?.message || e})`);
    try {
      if (preferred === "hnsw") {
        if (!(await hasIndex(idxIvf))) {
          console.log(`🛠️ Criando índice IVFFLAT (fallback)...`);
          await createIVFFLAT();
          console.log("✅ IVFFLAT criado (fallback).");
        }
      } else {
        if (!(await hasIndex(idxHnsw))) {
          console.log(`🛠️ Criando índice HNSW (fallback)...`);
          await createHNSW();
          console.log("✅ HNSW criado (fallback).");
        }
      }
    } catch (e2) {
      console.error("❌ Falha ao criar índice ANN (inclusive fallback):", e2?.message || e2);
      if (VECTOR_REQUIRED) throw e2;
    }
  }
}

// ---------- MAIN ----------
(async () => {
  console.log(`🔧 db-prepare (mode=${MODE}, run=${RUN_DB_PREPARE})`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL não definida.");
    process.exit(1);
  }
  const { adminUrl, db } = parseDbUrl(dbUrl);

  // Se for para pular (workers), só gera client e vaza
  if (RUN_DB_PREPARE === "no") {
    console.log("⏭️ RUN_DB_PREPARE=no → pulando criação de DB/migrations. Rodando apenas prisma generate.");
    run(`${PRISMA_BIN} generate`, { ...process.env, DATABASE_URL: dbUrl });
    console.log("🎉 pronto.");
    process.exit(0);
  }

  // 1) esperar Postgres admin
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  const okAdmin = await waitForConnection(admin, "Postgres (admin)");
  if (!okAdmin) process.exit(1);

  await admin.$connect();
  await logServerInfo(admin);
  await ensureDatabaseExists(admin, db);
  await admin.$disconnect();

  // 2) alvo
  const app = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const okApp = await waitForConnection(app, "Postgres (target)");
  if (!okApp) process.exit(1);
  await app.$connect();
  await logServerInfo(app);

  // 3) habilitar pgvector (se exigir)
  await ensurePgVectorEnabled(app);
  await app.$disconnect();

  // 4) migrar
  const env = { ...process.env, DATABASE_URL: dbUrl };
  try {
    if (MODE === "deploy") {
      console.log("🔄 prisma migrate deploy");
      run(`${PRISMA_BIN} migrate deploy`, env);
    } else {
      console.log("🧨 prisma migrate reset -f");
      run(`${PRISMA_BIN} migrate reset -f`, env);
    }
    console.log("✅ Migrações aplicadas.");
  } catch (e) {
    console.error("⚠️ Falha nas migrações:", e?.message || e);
    if (ALLOW_DB_PUSH_FALLBACK) {
      console.log("🔁 Fallback habilitado → executando `prisma db push`");
      run(`${PRISMA_BIN} db push`, env);
      console.log("✅ db push concluído.");
    } else {
      process.exit(1);
    }
  }

  // 5) hardening defensivo (embedding + índice)
  await app.$connect();
  try {
    await adjustEmbeddingColumnAndIndex(app, VECTOR_DIMS);
  } finally {
    await app.$disconnect();
  }

  // 6) generate
  console.log("🧩 prisma generate");
  run(`${PRISMA_BIN} generate`, env);

  // 7) seed (opcional)
  if (RUN_SEED) {
    console.log("🌱 prisma db seed");
    try {
      run(`${PRISMA_BIN} db seed`, env);
      console.log("✅ Seed concluído.");
    } catch (e) {
      console.error("⚠️ Seed falhou (prosseguindo):", e?.message || e);
    }
  }

  console.log("🎉 Banco pronto.");
})().catch((err) => {
  console.error("💥 Erro fatal no db-prepare:", err);
  process.exit(1);
});
