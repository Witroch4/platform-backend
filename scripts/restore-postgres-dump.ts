#!/usr/bin/env tsx

import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

interface RestoreOptions {
	dumpFile?: string;
	dbName?: string;
	dbUser?: string;
	dbPassword?: string;
	dbHost?: string;
	dbPort?: string;
}

class PostgresRestorer {
	private options: Required<RestoreOptions>;

	constructor(options: RestoreOptions = {}) {
		this.options = {
			dumpFile: options.dumpFile || "faceApp_backup_2025-07-28_00_00_01_1MB.sql.gz",
			dbName: options.dbName || "socialWise",
			dbUser: options.dbUser || "postgres",
			dbPassword: options.dbPassword || "postgres",
			dbHost: options.dbHost || "localhost",
			dbPort: options.dbPort || "5432",
		};
	}

	private log(message: string, color: "cyan" | "green" | "red" | "yellow" | "gray" = "gray") {
		const colors = {
			cyan: "\x1b[36m",
			green: "\x1b[32m",
			red: "\x1b[31m",
			yellow: "\x1b[33m",
			gray: "\x1b[90m",
			reset: "\x1b[0m",
		};
		console.log(`${colors[color]}${message}${colors.reset}`);
	}

	private executeCommand(command: string, options: { cwd?: string; stdio?: any } = {}): string {
		try {
			return execSync(command, {
				encoding: "utf8",
				stdio: options.stdio || "pipe",
				cwd: options.cwd || process.cwd(),
			});
		} catch (error: any) {
			if (error.status !== 0) {
				throw new Error(`Comando falhou: ${command}\n${error.message}`);
			}
			return error.stdout || "";
		}
	}

	private async waitForPostgres(): Promise<void> {
		this.log("🔍 Verificando conectividade com PostgreSQL...", "cyan");

		const maxAttempts = 30;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				this.executeCommand("docker exec chatwit_postgres pg_isready -h localhost -p 5432 -U postgres");
				this.log("✅ PostgreSQL está pronto!", "green");
				return;
			} catch (error) {
				if (attempt >= maxAttempts) {
					throw new Error(`Timeout: PostgreSQL não respondeu em ${maxAttempts} tentativas`);
				}
				this.log(`⏳ Aguardando PostgreSQL... (tentativa ${attempt}/${maxAttempts})`, "yellow");
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		}
	}

	private checkDockerContainer(): void {
		this.log("🔍 Verificando se o container PostgreSQL está rodando...", "cyan");

		try {
			const containerStatus = this.executeCommand(
				'docker ps --filter "name=chatwit_postgres" --format "table {{.Names}}\t{{.Status}}"',
			);

			if (!containerStatus.includes("chatwit_postgres")) {
				throw new Error("Container não encontrado");
			}
		} catch (error) {
			this.log("❌ Container PostgreSQL não está rodando!", "red");
			this.log("🚀 Iniciando containers Docker...", "yellow");

			this.executeCommand("docker compose -f docker-compose-dev.yml up -d postgres");
			this.log("⏳ Aguardando PostgreSQL inicializar...", "yellow");

			// Aguardar um pouco para o container inicializar
			setTimeout(() => {}, 10000);
		}
	}

	private backupCurrentDatabase(): void {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
		const currentBackup = `backups/pre-restore-backup_${timestamp}.sql.gz`;

		this.log(`💾 Fazendo backup do banco atual: ${currentBackup}`, "cyan");

		try {
			this.executeCommand(
				`docker exec chatwit_postgres pg_dump -h localhost -U ${this.options.dbUser} -d ${this.options.dbName} --no-owner --no-privileges | gzip > ${currentBackup}`,
			);
			this.log("✅ Backup do banco atual criado com sucesso", "green");
		} catch (error) {
			this.log("⚠️ Não foi possível fazer backup do banco atual (pode estar vazio)", "yellow");
		}
	}

	private recreateDatabase(): void {
		this.log("🗑️ Dropar e recriar banco de dados...", "cyan");

		try {
			// Terminar conexões ativas
			this.executeCommand(
				`docker exec chatwit_postgres psql -h localhost -U ${this.options.dbUser} -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${this.options.dbName}' AND pid <> pg_backend_pid();"`,
			);

			// Dropar banco se existir
			this.executeCommand(
				`docker exec chatwit_postgres psql -h localhost -U ${this.options.dbUser} -d postgres -c "DROP DATABASE IF EXISTS \\"${this.options.dbName}\\";"`,
			);

			// Criar novo banco
			this.executeCommand(
				`docker exec chatwit_postgres psql -h localhost -U ${this.options.dbUser} -d postgres -c "CREATE DATABASE \\"${this.options.dbName}\\";"`,
			);

			this.log("✅ Banco de dados recriado com sucesso", "green");
		} catch (error) {
			throw new Error(`Erro ao recriar banco de dados: ${error}`);
		}
	}

	private async restoreDump(): Promise<void> {
		const backupPath = join("backups", this.options.dumpFile);

		if (!existsSync(backupPath)) {
			this.log(`❌ Arquivo de backup não encontrado: ${backupPath}`, "red");
			this.log("📁 Arquivos disponíveis em backups:", "yellow");

			try {
				const files = this.executeCommand('Get-ChildItem backups -Name "*.sql.gz"', { cwd: process.cwd() });
				files
					.split("\n")
					.filter(Boolean)
					.forEach((file) => {
						this.log(`   - ${file}`, "gray");
					});
			} catch (error) {
				this.log("   Nenhum arquivo .sql.gz encontrado", "gray");
			}

			throw new Error("Arquivo de backup não encontrado");
		}

		this.log(`✅ Arquivo de backup encontrado: ${backupPath}`, "green");
		this.log(`📥 Restaurando dump do arquivo: ${this.options.dumpFile}`, "cyan");

		try {
			// Para Windows, usar uma abordagem mais simples
			// Copiar o arquivo para dentro do container
			const containerBackupPath = `/tmp/${this.options.dumpFile}`;

			this.log("📋 Copiando arquivo para o container...", "cyan");
			this.executeCommand(`docker cp ${backupPath} chatwit_postgres:${containerBackupPath}`);

			// Descompactar dentro do container
			this.log("📦 Descompactando arquivo...", "cyan");
			this.executeCommand(`docker exec chatwit_postgres gunzip -f ${containerBackupPath}`);

			// Restaurar o arquivo descompactado
			const sqlFile = this.options.dumpFile.replace(".gz", "");
			const containerSqlPath = `/tmp/${sqlFile}`;

			this.log("🔄 Restaurando dump...", "cyan");
			this.executeCommand(
				`docker exec chatwit_postgres psql -h localhost -U ${this.options.dbUser} -d ${this.options.dbName} -f ${containerSqlPath}`,
			);

			this.log("✅ Restauração concluída com sucesso!", "green");
		} catch (error) {
			throw new Error(`Erro durante a restauração: ${error}`);
		}
	}

	private applyPrismaMigrations(): void {
		this.log("🔧 Aplicando migrações do Prisma...", "cyan");

		try {
			this.executeCommand("npx prisma migrate deploy");
			this.log("✅ Migrações aplicadas com sucesso", "green");
		} catch (error) {
			this.log("⚠️ Nenhuma migração pendente ou erro ao aplicar migrações", "yellow");
		}
	}

	private regeneratePrismaClient(): void {
		this.log("🔧 Regenerando Prisma Client...", "cyan");

		try {
			this.executeCommand("npx prisma generate");
			this.log("✅ Prisma Client regenerado com sucesso", "green");
		} catch (error) {
			throw new Error(`Erro ao regenerar Prisma Client: ${error}`);
		}
	}

	private restartApplication(): void {
		this.log("🚀 Reiniciando aplicação...", "cyan");

		try {
			this.executeCommand("docker compose -f docker-compose-dev.yml up -d app");

			// Verificar status
			this.log("📊 Verificando status dos containers...", "cyan");
			setTimeout(() => {
				try {
					const status = this.executeCommand("docker compose -f docker-compose-dev.yml ps");
					console.log(status);
				} catch (error) {
					this.log("⚠️ Erro ao verificar status dos containers", "yellow");
				}
			}, 5000);
		} catch (error) {
			this.log("⚠️ Erro ao reiniciar aplicação", "yellow");
		}
	}

	async restore(): Promise<void> {
		try {
			this.log("🔄 Iniciando restauração do banco de dados PostgreSQL...", "cyan");

			// Verificar e iniciar container se necessário
			this.checkDockerContainer();

			// Aguardar PostgreSQL estar pronto
			await this.waitForPostgres();

			// Parar aplicação para evitar conflitos
			this.log("🛑 Parando aplicação para evitar conflitos...", "yellow");
			try {
				this.executeCommand("docker compose -f docker-compose-dev.yml stop app");
			} catch (error) {
				// Ignorar erro se app não estiver rodando
			}

			// Fazer backup do banco atual
			this.backupCurrentDatabase();

			// Recriar banco
			this.recreateDatabase();

			// Restaurar dump
			await this.restoreDump();

			// Aplicar migrações do Prisma
			this.applyPrismaMigrations();

			// Regenerar Prisma Client
			this.regeneratePrismaClient();

			// Reiniciar aplicação
			this.restartApplication();

			// Resumo final
			this.log("\n🎉 Restauração concluída!", "green");
			this.log("📋 Resumo:", "cyan");
			this.log(`   - Backup restaurado: ${this.options.dumpFile}`, "gray");
			this.log(`   - Banco recriado: ${this.options.dbName}`, "gray");
			this.log("   - Aplicação reiniciada", "gray");

			this.log("\n🌐 Acesse:", "cyan");
			this.log("   - Aplicação: http://localhost:3000", "gray");
			this.log("   - Prisma Studio: http://localhost:5555", "gray");
		} catch (error) {
			this.log(`❌ Erro durante a restauração: ${error}`, "red");
			process.exit(1);
		}
	}
}

// Função principal
async function main() {
	const args = process.argv.slice(2);
	const dumpFile = args[0] || "faceApp_backup_2025-07-28_00_00_01_1MB.sql.gz";

	const restorer = new PostgresRestorer({ dumpFile });
	await restorer.restore();
}

// Executar se for o arquivo principal
if (require.main === module) {
	main().catch((error) => {
		console.error("❌ Erro fatal:", error);
		process.exit(1);
	});
}

export { PostgresRestorer };
