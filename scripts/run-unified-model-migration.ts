/**
 * Unified Model Migration Runner
 * Orchestrates the complete migration to unified models
 * 
 * Usage: npx tsx scripts/run-unified-model-migration.ts [--dry-run] [--force]
 */

import { PrismaClient } from "@prisma/client";
import { UnifiedModelMigration } from "./migrate-to-unified-models";
import { CredentialMigration } from "./migrate-credentials-to-chatwitinbox";

const prisma = new PrismaClient();

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
    console.log('🚀 Starting unified model migration process...');
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
        console.log('🔍 Dry run mode - skipping actual migrations');
      }

      // Step 4: Post-migration validation
      await this.performPostMigrationValidation();

      // Step 5: Generate migration report
      await this.generateMigrationReport();

      console.log('✅ Migration process completed successfully!');

    } catch (error) {
      console.error('❌ Migration process failed:', error);
      
      if (!this.options.dryRun) {
        console.log('🔄 Consider running rollback procedures if needed');
      }
      
      throw error;
    }
  }

  /**
   * Perform pre-migration checks
   */
  private async performPreMigrationChecks(): Promise<void> {
    console.log('🔍 Performing pre-migration checks...');

    // Check database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ Database connection successful');
    } catch (error) {
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Check if migrations are needed
    const migrationNeeded = await this.checkIfMigrationNeeded();
    
    if (!migrationNeeded && !this.options.force) {
      console.log('ℹ️  No migration needed - database appears to be already using unified models');
      console.log('   Use --force flag to run migration anyway');
      return;
    }

    // Check for required environment variables
    const requiredEnvVars = ['DATABASE_URL'];
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missingEnvVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    }

    // Check disk space (basic check)
    try {
      const stats = await this.getDatabaseStats();
      console.log(`📊 Database stats: ${stats.tableCount} tables, estimated ${stats.recordCount} records`);
    } catch (error) {
      console.warn('⚠️  Could not retrieve database stats:', error);
    }

    console.log('✅ Pre-migration checks completed');
  }

  /**
   * Check if migration is needed
   */
  private async checkIfMigrationNeeded(): Promise<boolean> {
    try {
      // Check for legacy tables
      const legacyTables = [
        'CaixaEntrada',
        'WhatsAppTemplate', 
        'MensagemInterativa',
        'ConfiguracaoWhatsApp',
        'InstagramLead'
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
      console.warn('⚠️  Could not check for legacy tables:', error);
   