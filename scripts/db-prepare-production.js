#!/usr/bin/env node
/* eslint-disable no-console */
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");

// ---------- ENV ----------
const envFiles =
	process.env.NODE_ENV === "production" ? [".env.production", ".env"] : [".env.development", ".env.local", ".env"];

for (const file of envFiles) {
	const p = path.join(process.cwd(), file);
	if (fs.existsSync(p)) {
		console.log(`📄 Carregando variáveis de ambiente de: ${file}`);
		require("dotenv").config({ path: p });
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

// FORÇAR MODO DEPLOY EM PRODUÇÃO
const MODE = "deploy"; // SEMPRE deploy em produção
const PRISMA_SCHEMA = getArg("schema", "prisma/schema.prisma");
const RETRIES = Number(process.env.DB_CONNECT_RETRIES || 30);
const SLEEP_MS = Number(process.env.DB_CONNECT_SLEEP_MS || 3000);
const RUN_SEED = String(process.env.PRISMA_RUN_SEED || "false") === "true";
const RUN_DB_PREPARE = (process.env.RUN_DB_PREPARE || "yes").toLowerCase();
const VECTOR_REQUIRED = String(process.env.VECTOR_REQUIRED || "true") === "true";
const VECTOR_DIMS = Number(process.env.EMBEDDING_DIMS || 1536);
const VECTOR_DISTANCE = (process.env.VECTOR_DISTANCE || "cosine").toLowerCase();
const VECTOR_INDEX_PREFERRED = (process.env.VECTOR_INDEX || "hnsw").toLowerCase();
const VECTOR_INDEX_LISTS = Number(process.env.VECTOR_IVFFLAT_LISTS || 100);
const HNSW_M = Number(process.env.VECTOR_HNSW_M || 16);
const HNSW_EF_CONSTRUCTION = Number(process.env.VECTOR_HNSW_EF_CONSTRUCTION || 64);

// VERIFICAÇÕES DE SEGURANÇA PARA PRODUÇÃO
const FORCE_PRODUCTION_MODE = getArg("force-production", "false") === "true";
const SKIP_MIGRATION_CHECK = getArg("skip-migration-check", "false") === "true";

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

function runSafely(cmd, env) {
	const fullCmd = `${cmd} --schema ${PRISMA_SCHEMA}`;
	console.log(`🔧 Executando: ${fullCmd}`);
	try {
		execSync(fullCmd, { stdio: "inherit", env });
		return true;
	} catch (error) {
		console.error(`❌ Erro ao executar: ${fullCmd}`);
		console.error(error.message);
		return false;
	}
}

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
			console.log("🧩 pgvector não está instalada.");
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
			if (err.code === "42P04" || /already exists/i.test(err.message)) {
				console.log(`✅ Database '${dbName}' já existe.`);
			} else if (err.code === "42501" || /permission denied/i.test(err.message)) {
				console.error("🔒 Sem permissão para CREATE DATABASE. Verifique as credenciais.");
				throw err;
			} else {
				throw err;
			}
		}
	} else {
		console.log(`✅ Database '${dbName}' já existe.`);
	}
}

async function checkPendingMigrations() {
	try {
		console.log("🔍 Verificando migrações pendentes...");
		const result = execSync(`npx prisma migrate status --schema ${PRISMA_SCHEMA}`, {
			encoding: "utf8",
			env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
		});

		if (result.includes("No pending migrations")) {
			console.log("✅ Nenhuma migração pendente encontrada.");
			return false;
		} else if (result.includes("migrations have not yet been applied")) {
			console.log("📝 Migrações pendentes encontradas.");
			return true;
		} else {
			console.log("ℹ️ Status das migrações indeterminado, prosseguindo com deploy.");
			return true;
		}
	} catch (error) {
		console.warn("⚠️ Não foi possível verificar status das migrações:", error.message);
		return true; // Por segurança, assume que há migrações
	}
}

async function ensurePgVectorEnabled(prisma) {
	try {
		await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
		console.log("✅ Extensão pgvector habilitada.");
	} catch (err) {
		console.error("⚠️ Falha ao habilitar extensão pgvector:", err?.message || err);
		if (VECTOR_REQUIRED) {
			if (/permission denied/i.test(err?.message) || err?.code === "42501") {
				console.error("🔒 Permissão insuficiente para CREATE EXTENSION.");
			} else if (/could not open extension control file/i.test(err?.message) || err?.code === "42704") {
				console.error("📦 A extensão pgvector não está instalada no servidor.");
			}
			throw err;
		} else {
			console.warn("↪️ VECTOR_REQUIRED=false → seguindo sem pgvector.");
		}
	}
}

async function adjustEmbeddingColumnAndIndex(prisma, dims) {
	// Verificar se tabela Intent existe
	const existsTable = await prisma.$queryRaw`SELECT to_regclass('public."Intent"')::text AS reg`;
	if (!existsTable || !existsTable[0] || !existsTable[0].reg) {
		console.log('ℹ️ Tabela "Intent" ainda não existe (será criada pelas migrações).');
		return;
	}

	// Verificar se coluna embedding existe
	const col = await prisma.$queryRaw`
    SELECT a.attname AS name, a.atttypid::regtype::text AS typ
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'Intent' AND a.attname = 'embedding' AND a.attnum > 0 AND NOT a.attisdropped
    LIMIT 1
  `;

	if (!col || col.length === 0) {
		console.log('ℹ️ Coluna "embedding" não existe (será criada pelas migrações).');
		return;
	}

	const typ = String(col[0].typ || "");
	if (!/vector/i.test(typ)) {
		console.log(`🛠️ Ajustando tipo de "embedding" para vector(${dims})...`);
		await prisma.$executeRawUnsafe(`
      ALTER TABLE "Intent"
      ALTER COLUMN "embedding" TYPE vector(${dims}) USING "embedding"::vector
    `);
		console.log("✅ Tipo de coluna ajustado.");
	}

	// Criar índices de vetor se necessário
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

	try {
		if (VECTOR_INDEX_PREFERRED === "hnsw" && !(await hasIndex(idxHnsw))) {
			console.log(`🛠️ Criando índice HNSW...`);
			await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS ${idxHnsw}
        ON "Intent" USING hnsw ("embedding" ${ops})
        WITH (m = ${HNSW_M}, ef_construction = ${HNSW_EF_CONSTRUCTION})
      `);
			console.log("✅ Índice HNSW criado.");
		} else if (VECTOR_INDEX_PREFERRED === "ivfflat" && !(await hasIndex(idxIvf))) {
			console.log(`🛠️ Criando índice IVFFLAT...`);
			await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS ${idxIvf}
        ON "Intent" USING ivfflat ("embedding" ${ops})
        WITH (lists = ${VECTOR_INDEX_LISTS})
      `);
			console.log("✅ Índice IVFFLAT criado.");
		} else {
			console.log("✅ Índices de vetor já existem.");
		}
	} catch (e) {
		console.warn(`⚠️ Falha ao criar índice de vetor: ${e?.message || e}`);
		if (!VECTOR_REQUIRED) {
			console.warn("↪️ Continuando sem índices de vetor.");
		}
	}
}

async function validateProductionEnvironment() {
	console.log("🔒 Validando ambiente de produção...");

	if (process.env.NODE_ENV !== "production" && !FORCE_PRODUCTION_MODE) {
		console.error("❌ Este script é exclusivo para produção!");
		console.error("   Para usar em outros ambientes, adicione --force-production=true");
		process.exit(1);
	}

	if (!process.env.DATABASE_URL) {
		console.error("❌ DATABASE_URL não está definida.");
		process.exit(1);
	}

	const dbUrl = process.env.DATABASE_URL;
	if (!dbUrl.includes("localhost") && !dbUrl.includes("127.0.0.1") && !FORCE_PRODUCTION_MODE) {
		console.log("✅ URL do banco de produção detectada.");
	}

	console.log("✅ Ambiente validado para produção.");
}

// ---------- MAIN ----------
(async () => {
	console.log(`🔧 db-prepare-production (EXCLUSIVO PARA PRODUÇÃO)`);
	console.log(`🔧 Mode: ${MODE}, Run: ${RUN_DB_PREPARE}`);

	// Validações de segurança
	await validateProductionEnvironment();

	const dbUrl = process.env.DATABASE_URL;
	const { adminUrl, db } = parseDbUrl(dbUrl);

	// Se for para pular configuração do DB
	if (RUN_DB_PREPARE === "no") {
		console.log("⏭️ RUN_DB_PREPARE=no → executando apenas prisma generate.");
		const success = runSafely("npx prisma generate", { ...process.env, DATABASE_URL: dbUrl });
		if (success) {
			console.log("🎉 Prisma Client gerado com sucesso.");
		} else {
			console.error("❌ Falha ao gerar Prisma Client.");
			process.exit(1);
		}
		return;
	}

	// 1) Aguardar conexão admin
	const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
	const okAdmin = await waitForConnection(admin, "Postgres (admin)");
	if (!okAdmin) {
		console.error("❌ Falha na conexão com o banco admin.");
		process.exit(1);
	}

	await admin.$connect();
	await logServerInfo(admin);
	await ensureDatabaseExists(admin, db);
	await admin.$disconnect();

	// 2) Conexão com banco alvo
	const app = new PrismaClient({ datasources: { db: { url: dbUrl } } });
	const okApp = await waitForConnection(app, "Postgres (target)");
	if (!okApp) {
		console.error("❌ Falha na conexão com o banco alvo.");
		process.exit(1);
	}

	await app.$connect();
	await logServerInfo(app);

	// 3) Habilitar pgvector
	await ensurePgVectorEnabled(app);
	await app.$disconnect();

	// 4) Verificar se há migrações pendentes ANTES de aplicar
	const hasPendingMigrations = SKIP_MIGRATION_CHECK ? true : await checkPendingMigrations();

	if (!hasPendingMigrations && !SKIP_MIGRATION_CHECK) {
		console.log("✅ Nenhuma migração pendente. Pulando deploy de migrações.");
	} else {
		console.log("🔄 Aplicando migrações pendentes...");
		const env = { ...process.env, DATABASE_URL: dbUrl };
		const success = runSafely("npx prisma migrate deploy", env);

		if (success) {
			console.log("✅ Migrações aplicadas com sucesso.");
		} else {
			console.error("❌ Falha ao aplicar migrações.");
			process.exit(1);
		}
	}

	// 5) Ajustes defensivos para pgvector
	await app.$connect();
	try {
		await adjustEmbeddingColumnAndIndex(app, VECTOR_DIMS);
	} catch (error) {
		console.error("⚠️ Erro nos ajustes de pgvector:", error.message);
		if (VECTOR_REQUIRED) {
			throw error;
		}
	} finally {
		await app.$disconnect();
	}

	// 6) Generate Prisma Client
	console.log("🧩 Gerando Prisma Client...");
	const generateSuccess = runSafely("npx prisma generate", { ...process.env, DATABASE_URL: dbUrl });
	if (!generateSuccess) {
		console.error("❌ Falha ao gerar Prisma Client.");
		process.exit(1);
	}

	// 7) Seed (opcional e cauteloso em produção)
	if (RUN_SEED) {
		console.log("🌱 Executando seed...");
		const seedSuccess = runSafely("npx prisma db seed", { ...process.env, DATABASE_URL: dbUrl });
		if (!seedSuccess) {
			console.warn("⚠️ Seed falhou (continuando).");
		} else {
			console.log("✅ Seed executado com sucesso.");
		}
	}

	console.log("🎉 Banco de produção preparado com sucesso!");
})().catch((err) => {
	console.error("💥 Erro fatal no db-prepare-production:", err);
	process.exit(1);
});
