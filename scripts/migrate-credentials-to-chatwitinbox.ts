/**
 * Credential Migration Script
 * Migrates WhatsApp credentials from legacy ConfiguracaoWhatsApp to ChatwitInbox structure
 * 
 * Usage: npx tsx scripts/migrate-credentials-to-chatwitinbox.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CredentialMigrationStats {
  inboxesUpdated: number;
  globalConfigsCreated: number;
  fallbackChainsCreated: number;
  errors: string[];
}

class CredentialMigration {
  private stats: CredentialMigrationStats = {
    inboxesUpdated: 0,
    globalConfigsCreated: 0,
    fallbackChainsCreated: 0,
    errors: [],
  };

  async run(): Promise<CredentialMigrationStats> {
    console.log('🔑 Starting credential migration...');
    
    try {
      // Step 1: Migrate legacy ConfiguracaoWhatsApp to WhatsAppGlobalConfig
      await this.migrateToGlobalConfig();
      
      // Step 2: Update ChatwitInbox with credentials from legacy configurations
      await this.updateInboxCredentials();
      
      // Step 3: Create intelligent fallback chains
      await this.createFallbackChains();
      
      // Step 4: Validate all credential configurations
      await this.validateCredentialConfigurations();
      
      console.log('✅ Credential migration completed successfully!');
      this.printStats();
      
    } catch (error) {
      console.error('❌ Credential migration failed:', error);
      this.stats.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return this.stats;
  }

  /**
   * Migrate legacy ConfiguracaoWhatsApp to WhatsAppGlobalConfig
   */
  private async migrateToGlobalConfig(): Promise<void> {
    console.log('🌐 Migrating to WhatsAppGlobalConfig...');
    
    try {
      // Check for legacy ConfiguracaoWhatsApp table
      const legacyConfigs = await this.queryLegacyTable('ConfiguracaoWhatsApp', `
        SELECT 
          id, "phoneNumberId", "whatsappToken", "whatsappBusinessAccountId",
          "fbGraphApiBase", "caixaEntradaId", "createdAt", "updatedAt"
        FROM "ConfiguracaoWhatsApp"
      `);

      if (!legacyConfigs || legacyConfigs.length === 0) {
        console.log('ℹ️  No legacy ConfiguracaoWhatsApp found');
        return;
      }

      // Group configurations by user (via CaixaEntrada)
      const configsByUser = new Map<string, any[]>();
      
      for (const config of legacyConfigs) {
        try {
          // Find the ChatwitInbox for this configuration
          const inbox = await prisma.chatwitInbox.findFirst({
            where: { inboxId: config.caixaEntradaId },
            include: { usuarioChatwit: true },
          });

          if (!inbox) {
            console.log(`⚠️  No ChatwitInbox found for caixaEntradaId: ${config.caixaEntradaId}`);
            continue;
          }

          const userId = inbox.usuarioChatwitId;
          if (!configsByUser.has(userId)) {
            configsByUser.set(userId, []);
          }
          configsByUser.get(userId)!.push({ ...config, inbox });
          
        } catch (error) {
          const errorMsg = `Failed to process config ${config.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          this.stats.errors.push(errorMsg);
        }
      }

      // Create WhatsAppGlobalConfig for each user
      for (const [userId, configs] of configsByUser) {
        try {
          // Check if user already has a global config
          const existingGlobalConfig = await prisma.whatsAppGlobalConfig.findUnique({
            where: { usuarioChatwitId: userId },
          });

          if (existingGlobalConfig) {
            console.log(`⏭️  User ${userId} already has WhatsAppGlobalConfig`);
            continue;
          }

          // Use the first (or most complete) configuration as the global default
          const primaryConfig = this.selectPrimaryConfig(configs);
          
          await prisma.whatsAppGlobalConfig.create({
            data: {
              usuarioChatwitId: userId,
              whatsappApiKey: primaryConfig.whatsappToken,
              phoneNumberId: primaryConfig.phoneNumberId,
              whatsappBusinessAccountId: primaryConfig.whatsappBusinessAccountId,
              graphApiBaseUrl: primaryConfig.fbGraphApiBase || 'https://graph.facebook.com/v22.0',
            },
          });

          this.stats.globalConfigsCreated++;
          console.log(`✅ Created WhatsAppGlobalConfig for user: ${userId}`);
          
        } catch (error) {
          const errorMsg = `Failed to create global config for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          this.stats.errors.push(errorMsg);
        }
      }
      
    } catch (error) {
      console.log('ℹ️  ConfiguracaoWhatsApp table not found or already migrated');
    }
  }

  /**
   * Update ChatwitInbox with credentials from legacy configurations
   */
  private async updateInboxCredentials(): Promise<void> {
    console.log('📥 Updating ChatwitInbox credentials...');
    
    try {
      // Get all legacy configurations
      const legacyConfigs = await this.queryLegacyTable('ConfiguracaoWhatsApp', `
        SELECT 
          id, "phoneNumberId", "whatsappToken", "whatsappBusinessAccountId",
          "fbGraphApiBase", "caixaEntradaId"
        FROM "ConfiguracaoWhatsApp"
      `);

      if (!legacyConfigs || legacyConfigs.length === 0) {
        console.log('ℹ️  No legacy configurations to migrate to inboxes');
        return;
      }

      for (const config of legacyConfigs) {
        try {
          // Find the corresponding ChatwitInbox
          const inbox = await prisma.chatwitInbox.findFirst({
            where: { inboxId: config.caixaEntradaId },
          });

          if (!inbox) {
            console.log(`⚠️  No ChatwitInbox found for caixaEntradaId: ${config.caixaEntradaId}`);
            continue;
          }

          // Update the inbox with credentials if it doesn't already have them
          if (!inbox.whatsappApiKey || !inbox.phoneNumberId || !inbox.whatsappBusinessAccountId) {
            await prisma.chatwitInbox.update({
              where: { id: inbox.id },
              data: {
                whatsappApiKey: config.whatsappToken,
                phoneNumberId: config.phoneNumberId,
                whatsappBusinessAccountId: config.whatsappBusinessAccountId,
              },
            });

            this.stats.inboxesUpdated++;
            console.log(`✅ Updated credentials for inbox: ${inbox.nome} (${inbox.inboxId})`);
          } else {
            console.log(`⏭️  Inbox ${inbox.nome} already has credentials`);
          }
          
        } catch (error) {
          const errorMsg = `Failed to update inbox for config ${config.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          this.stats.errors.push(errorMsg);
        }
      }
      
    } catch (error) {
      console.log('ℹ️  No legacy configurations found for inbox updates');
    }
  }

  /**
   * Create intelligent fallback chains based on user patterns
   */
  private async createFallbackChains(): Promise<void> {
    console.log('🔗 Creating intelligent fallback chains...');
    
    try {
      // Get all users with multiple inboxes
      const usersWithMultipleInboxes = await prisma.usuarioChatwit.findMany({
        include: {
          inboxes: {
            orderBy: { createdAt: 'asc' },
          },
        },
        where: {
          inboxes: {
            some: {},
          },
        },
      });

      for (const user of usersWithMultipleInboxes) {
        if (user.inboxes.length <= 1) continue;

        try {
          // Find the primary inbox (one with credentials or the oldest)
          const primaryInbox = this.findPrimaryInbox(user.inboxes);
          const secondaryInboxes = user.inboxes.filter(inbox => inbox.id !== primaryInbox.id);

          // Set up fallback chains: secondary inboxes -> primary inbox
          for (const secondaryInbox of secondaryInboxes) {
            // Only set fallback if the secondary inbox doesn't have its own credentials
            if (!this.hasCompleteCredentials(secondaryInbox)) {
              await prisma.chatwitInbox.update({
                where: { id: secondaryInbox.id },
                data: {
                  fallbackParaInboxId: primaryInbox.id,
                },
              });

              this.stats.fallbackChainsCreated++;
              console.log(`✅ Created fallback: ${secondaryInbox.nome} -> ${primaryInbox.nome}`);
            }
          }
          
        } catch (error) {
          const errorMsg = `Failed to create fallback chains for user ${user.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          this.stats.errors.push(errorMsg);
        }
      }
      
    } catch (error) {
      const errorMsg = `Failed to create fallback chains: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      this.stats.errors.push(errorMsg);
    }
  }

  /**
   * Validate all credential configurations
   */
  private async validateCredentialConfigurations(): Promise<void> {
    console.log('✅ Validating credential configurations...');
    
    try {
      const { CredentialsFallbackResolver } = await import('../lib/credentials-fallback-resolver');
      
      // Get all inboxes
      const allInboxes = await prisma.chatwitInbox.findMany();
      
      let validConfigurations = 0;
      let invalidConfigurations = 0;

      for (const inbox of allInboxes) {
        try {
          const validation = await CredentialsFallbackResolver.validateFallbackChain(inbox.id);
          
          if (validation.isValid) {
            validConfigurations++;
            console.log(`✅ Valid configuration for inbox: ${inbox.nome}`);
          } else {
            invalidConfigurations++;
            console.log(`❌ Invalid configuration for inbox: ${inbox.nome}`);
            console.log(`   Issues: ${validation.issues.join(', ')}`);
            this.stats.errors.push(`Invalid config for ${inbox.nome}: ${validation.issues.join(', ')}`);
          }
          
        } catch (error) {
          invalidConfigurations++;
          const errorMsg = `Failed to validate inbox ${inbox.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          this.stats.errors.push(errorMsg);
        }
      }

      console.log(`📊 Validation results: ${validConfigurations} valid, ${invalidConfigurations} invalid`);
      
    } catch (error) {
      const errorMsg = `Failed to validate configurations: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      this.stats.errors.push(errorMsg);
    }
  }

  /**
   * Select the primary configuration from multiple configs for a user
   */
  private selectPrimaryConfig(configs: any[]): any {
    // Prefer configurations with complete credentials
    const completeConfigs = configs.filter(config => 
      config.whatsappToken && config.phoneNumberId && config.whatsappBusinessAccountId
    );

    if (completeConfigs.length > 0) {
      return completeConfigs[0];
    }

    // Fallback to the first configuration
    return configs[0];
  }

  /**
   * Find the primary inbox for a user (one with credentials or the oldest)
   */
  private findPrimaryInbox(inboxes: any[]): any {
    // Prefer inbox with complete credentials
    const inboxWithCredentials = inboxes.find(inbox => this.hasCompleteCredentials(inbox));
    
    if (inboxWithCredentials) {
      return inboxWithCredentials;
    }

    // Fallback to the oldest inbox
    return inboxes[0];
  }

  /**
   * Check if an inbox has complete credentials
   */
  private hasCompleteCredentials(inbox: any): boolean {
    return !!(
      inbox.whatsappApiKey &&
      inbox.phoneNumberId &&
      inbox.whatsappBusinessAccountId
    );
  }

  /**
   * Query legacy table with error handling
   */
  private async queryLegacyTable(tableName: string, query: string): Promise<any[] | null> {
    try {
      const result = await prisma.$queryRawUnsafe(query);
      return result as any[];
    } catch (error) {
      console.log(`ℹ️  Table ${tableName} not found or query failed - likely already migrated`);
      return null;
    }
  }

  /**
   * Print migration statistics
   */
  private printStats(): void {
    console.log('\n📊 Credential Migration Statistics:');
    console.log(`├── Global configs created: ${this.stats.globalConfigsCreated}`);
    console.log(`├── Inboxes updated: ${this.stats.inboxesUpdated}`);
    console.log(`├── Fallback chains created: ${this.stats.fallbackChainsCreated}`);
    console.log(`└── Errors: ${this.stats.errors.length}`);
    
    if (this.stats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      this.stats.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migration = new CredentialMigration();
  migration.run()
    .then((stats) => {
      console.log('\n🎉 Credential migration completed!');
      process.exit(stats.errors.length > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('💥 Credential migration failed:', error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}

export { CredentialMigration };