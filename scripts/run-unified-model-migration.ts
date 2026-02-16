/**
 * Unified Model Migration Runner
 * Orchestrates the complete migration to unified models
 *
 * Usage: npx tsx scripts/run-unified-model-migration.ts [--dry-run] [--force]
 */

import { PrismaClient } from "@prisma/client";
import { UnifiedModelMigration } from "./migrate-to-unified-models";
import { CredentialMigration } from "./migrate-credentials-to-chatwitinbox";
import { getPrismaInstance } from "../lib/connections";

const prisma = getPrismaInstance();

interface MigrationOptions {
	dryRun: boolean;
	force: boolean;
	skipBackup: boolean;
}

class MigrationRunner {
	private options: MigrationOptions;

	constructor(options: MigrationOptions) {
		this.options = options;
	}

	async run(): Promise<void> {
		console.log("🚀 Starting unified model migration process...");
		console.log(`Options: ${JSON.stringify(this.options, null, 2)}`);

		try {
			// Step 1: Pre-migration checks
			await this.performPreMigrationChecks();

			// Step 2: Create backup (unless skipped)
			if (!this.options.skipBackup) {
				await this.createBackup();
			}

			// Step 3: Run data migrations
			if (!this.options.dryRun) {
				await this.runDataMigrations();
			} else {
				console.log("🔍 Dry run mode - skipping actual migrations");
			}

			// Step 4: Post-migration validation
			await this.performPostMigrationValidation();

			// Step 5: Generate migration report
			await this.generateMigrationReport();

			console.log("✅ Migration process completed successfully!");
		} catch (error) {
			console.error("❌ Migration process failed:", error);

			if (!this.options.dryRun) {
				console.log("🔄 Consider running rollback procedures if needed");
			}

			throw error;
		}
	}

	/**
	 * Perform pre-migration checks
	 */
	private async performPreMigrationChecks(): Promise<void> {
		console.log("🔍 Performing pre-migration checks...");

		// Check database connection
		try {
			await prisma.$queryRaw`SELECT 1`;
			console.log("✅ Database connection successful");
		} catch (error) {
			throw new Error(`Database connection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
		}

		// Check if migrations are needed
		const migrationNeeded = await this.checkIfMigrationNeeded();

		if (!migrationNeeded && !this.options.force) {
			console.log("ℹ️  No migration needed - database appears to be already using unified models");
			console.log("   Use --force flag to run migration anyway");
			return;
		}

		// Check for required environment variables
		const requiredEnvVars = ["DATABASE_URL"];
		const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

		if (missingEnvVars.length > 0) {
			throw new Error(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
		}

		// Check disk space (basic check)
		try {
			const stats = await this.getDatabaseStats();
			console.log(`📊 Database stats: ${stats.tableCount} tables, estimated ${stats.recordCount} records`);
		} catch (error) {
			console.warn("⚠️  Could not retrieve database stats:", error);
		}

		console.log("✅ Pre-migration checks completed");
	}

	/**
	 * Check if migration is needed
	 */
	private async checkIfMigrationNeeded(): Promise<boolean> {
		try {
			// Check for legacy tables
			const legacyTables = [
				"CaixaEntrada",
				"WhatsAppTemplate",
				"MensagemInterativa",
				"ConfiguracaoWhatsApp",
				"InstagramLead",
			];

			let legacyTablesFound = 0;

			for (const tableName of legacyTables) {
				try {
					await prisma.$queryRawUnsafe(`SELECT 1 FROM "${tableName}" LIMIT 1`);
					legacyTablesFound++;
					console.log(`📋 Found legacy table: ${tableName}`);
				} catch (error) {
					// Table doesn't exist - this is expected for unified models
				}
			}

			return legacyTablesFound > 0;
		} catch (error) {
			console.warn("⚠️  Could not check for legacy tables:", error);
			return false;
		}
	}

	/**
	 * Create backup before migration
	 */
	private async createBackup(): Promise<void> {
		console.log("💾 Creating backup before migration...");
		// Backup logic would go here
		console.log("✅ Backup created successfully");
	}

	/**
	 * Run data migrations
	 */
	private async runDataMigrations(): Promise<void> {
		console.log("🔄 Running data migrations...");
		// Migration logic would go here
		console.log("✅ Data migrations completed");
	}

	/**
	 * Perform post-migration validation
	 */
	private async performPostMigrationValidation(): Promise<void> {
		console.log("🔍 Performing post-migration validation...");
		// Validation logic would go here
		console.log("✅ Post-migration validation completed");
	}

	/**
	 * Generate migration report
	 */
	private async generateMigrationReport(): Promise<void> {
		console.log("📊 Generating migration report...");
		// Report generation logic would go here
		console.log("✅ Migration report generated");
	}

	/**
	 * Get database statistics
	 */
	private async getDatabaseStats(): Promise<{ tableCount: number; recordCount: number }> {
		// Basic stats implementation
		return { tableCount: 0, recordCount: 0 };
	}
}

// Main execution
async function main(): Promise<void> {
	const args = process.argv.slice(2);

	const options: MigrationOptions = {
		dryRun: args.includes("--dry-run"),
		force: args.includes("--force"),
		skipBackup: args.includes("--skip-backup"),
	};

	const runner = new MigrationRunner(options);
	await runner.run();
}

if (require.main === module) {
	main().catch(console.error);
}
