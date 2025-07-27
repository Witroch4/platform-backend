/**
 * Migration Script for Unified Models
 * Migrates legacy data to the new unified Lead, Template, and ChatwitInbox models
 * 
 * Usage: npx tsx scripts/migrate-to-unified-models.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface MigrationStats {
  leadsCreated: number;
  leadsMigrated: number;
  templatesCreated: number;
  templatesMigrated: number;
  inboxesCreated: number;
  inboxesMigrated: number;
  mappingsCreated: number;
  errors: string[];
}

class UnifiedModelMigration {
  private stats: MigrationStats = {
    leadsCreated: 0,
    leadsMigrated: 0,
    templatesCreated: 0,
    templatesMigrated: 0,
    inboxesCreated: 0,
    inboxesMigrated: 0,
    mappingsCreated: 0,
    errors: [],
  };

  async run(): Promise<MigrationStats> {
    console.log('🚀 Starting migration to unified models...');
    
    try {
      // Step 1: Migrate legacy CaixaEntrada to ChatwitInbox
      await this.migrateCaixaEntradaToInbox();
      
      // Step 2: Migrate legacy leads to unified Lead model
      await this.migrateLegacyLeads();
      
      // Step 3: Migrate legacy templates to unified Template model
      await this.migrateLegacyTemplates();
      
      // Step 4: Migrate legacy mappings to unified models
      await this.migrateLegacyMappings();
      
      // Step 5: Create default configurations
      await this.createDefaultConfigurations();
      
      console.log('✅ Migration completed successfully!');
      this.printStats();
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      this.stats.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return this.stats;
  }

  /**
   * Migrate legacy CaixaEntrada to ChatwitInbox
   */
  private async migrateCaixaEntradaToInbox(): Promise<void> {
    console.log('📦 Migrating CaixaEntrada to ChatwitInbox...');
    
    try {
      // Check if legacy CaixaEntrada table exists
      const legacyCaixas = await this.queryLegacyTable('CaixaEntrada', `
        SELECT 
          id, nome, "inboxId", "channelType", "createdAt", "updatedAt",
          "usuarioChatwitId"
        FROM "CaixaEntrada"
      `);

      if (!legacyCaixas || legacyCaixas.length === 0) {
        console.log('ℹ️  No legacy CaixaEntrada data found');
        return;
      }

      for (const caixa of legacyCaixas) {
        try {
          // Check if already migrated
          const existing = await prisma.chatwitInbox.findFirst({
            where: { inboxId: caixa.inboxId },
          });

          if (existing) {
            console.log(`⏭️  Inbox ${caixa.inboxId} already exists, skipping`);
            continue;
          }

          // Create new ChatwitInbox
          await prisma.chatwitInbox.create({
            data: {
              nome: caixa.nome,
              inboxId: caixa.inboxId,
              channelType: caixa.channelType || 'whatsapp',
              createdAt: caixa.createdAt,
              updatedAt: caixa.updatedAt,
              usuarioChatwitId: caixa.usuarioChatwitId,
              // Initialize with null credentials - will be populated by webhook
              whatsappApiKey: null,
              phoneNumberId: null,
              whatsappBusinessAccountId: null,
            },
          });

          this.stats.inboxesCreated++;
          console.log(`✅ Migrated inbox: ${caixa.nome} (${caixa.inboxId})`);
          
        } catch (error) {
          const errorMsg = `Failed to migrate inbox ${caixa.inboxId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          this.stats.errors.push(errorMsg);
        }
      }

      this.stats.inboxesMigrated = legacyCaixas.length;
      
    } catch (error) {
      console.log('ℹ️  CaixaEntrada table not found or already migrated');
    }
  }

  /**
   * Migrate legacy leads to unified Lead model
   */
  private async migrateLegacyLeads(): Promise<void> {
    console.log('👥 Migrating legacy leads to unified Lead model...');
    
    try {
      // Migrate Instagram leads
      await this.migrateInstagramLeads();
      
      // Migrate OAB leads
      await this.migrateOabLeads();
      
      // Migrate any other legacy lead sources
      await this.migrateOtherLeads();
      
    } catch (error) {
      const errorMsg = `Failed to migrate leads: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      this.stats.errors.push(errorMsg);
    }
  }

  /**
   * Migrate Instagram leads
   */
  private async migrateInstagramLeads(): Promise<void> {
    try {
      // Check for legacy Instagram lead tables
      const legacyInstagramLeads = await this.queryLegacyTable('InstagramLead', `
        SELECT 
          id, name, email, phone, "avatarUrl", "igUserId", "igUsername",
          "isFollower", "lastMessageAt", "isOnline", "createdAt", "updatedAt",
          "userId", "accountId"
        FROM "InstagramLead"
      `);

      if (!legacyInstagramLeads || legacyInstagramLeads.length === 0) {
        console.log('ℹ️  No legacy Instagram leads found');
        return;
      }

      for (const igLead of legacyInstagramLeads) {
        try {
          // Check if already migrated
          const existing = await prisma.lead.findFirst({
            where: {
              source: 'INSTAGRAM',
              sourceIdentifier: igLead.igUserId || igLead.id,
              accountId: igLead.accountId,
            },
          });

          if (existing) {
            console.log(`⏭️  Instagram lead ${igLead.igUserId} already migrated`);
            continue;
          }

          // Create unified Lead with Instagram profile
          const lead = await prisma.lead.create({
            data: {
              name: igLead.name,
              email: igLead.email,
              phone: igLead.phone,
              avatarUrl: igLead.avatarUrl,
              source: 'INSTAGRAM',
              sourceIdentifier: igLead.igUserId || igLead.id,
              tags: [],
              createdAt: igLead.createdAt,
              updatedAt: igLead.updatedAt,
              userId: igLead.userId,
              accountId: igLead.accountId,
              instagramProfile: {
                create: {
                  isFollower: igLead.isFollower || false,
                  lastMessageAt: igLead.lastMessageAt,
                  isOnline: igLead.isOnline || false,
                },
              },
            },
          });

          this.stats.leadsCreated++;
          console.log(`✅ Migrated Instagram lead: ${igLead.name || igLead.igUserId}`);
          
        } catch (error) {
          const errorMsg = `Failed to migrate Instagram lead ${igLead.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          this.stats.errors.push(errorMsg);
        }
      }

      this.stats.leadsMigrated += legacyInstagramLeads.length;
      
    } catch (error) {
      console.log('ℹ️  Instagram lead table not found or already migrated');
    }
  }

  /**
   * Migrate OAB leads
   */
  private async migrateOabLeads(): Promise<void> {
    try {
      // OAB leads are already in LeadOabData, but we need to ensure they have a parent Lead
      const oabData = await prisma.leadOabData.findMany({
        include: {
          lead: true,
        },
      });

      for (const oab of oabData) {
        if (!oab.lead) {
          // Create missing Lead for existing LeadOabData
          try {
            await prisma.lead.create({
              data: {
                id: oab.leadId, // Use the same ID
                source: 'CHATWIT_OAB',
                sourceIdentifier: oab.inscricao || oab.id,
                tags: [],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });

            this.stats.leadsCreated++;
            console.log(`✅ Created missing Lead for OAB data: ${oab.inscricao}`);
          } catch (error) {
            const errorMsg = `Failed to create Lead for OAB data ${oab.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(`❌ ${errorMsg}`);
            this.stats.errors.push(errorMsg);
          }
        }
      }
      
    } catch (error) {
      console.log('ℹ️  OAB lead migration not needed or already completed');
    }
  }

  /**
   * Migrate other legacy lead sources
   */
  private async migrateOtherLeads(): Promise<void> {
    // This method can be extended to handle other legacy lead sources
    console.log('ℹ️  No other legacy lead sources to migrate');
  }

  /**
   * Migrate legacy templates to unified Template model
   */
  private async migrateLegacyTemplates(): Promise<void> {
    console.log('📄 Migrating legacy templates to unified Template model...');
    
    try {
      // Migrate WhatsApp templates
      await this.migrateWhatsAppTemplates();
      
      // Migrate interactive messages
      await this.migrateInteractiveMessages();
      
      // Migrate enhanced interactive messages
      await this.migrateEnhancedInteractiveMessages();
      
    } catch (error) {
      const errorMsg = `Failed to migrate templates: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      this.stats.errors.push(errorMsg);
    }
  }

  /**
   * Migrate WhatsApp templates
   */
  private async migrateWhatsAppTemplates(): Promise<void> {
    try {
      const legacyTemplates = await this.queryLegacyTable('WhatsAppTemplate', `
        SELECT 
          id, "templateId", name, status, category, language, components,
          "qualityScore", "createdAt", "updatedAt", "userId"
        FROM "WhatsAppTemplate"
      `);

      if (!legacyTemplates || legacyTemplates.length === 0) {
        console.log('ℹ️  No legacy WhatsApp templates found');
        return;
      }

      for (const template of legacyTemplates) {
        try {
          // Check if already migrated
          const existing = await prisma.template.findFirst({
            where: {
              name: template.name,
              type: 'WHATSAPP_OFFICIAL',
              createdById: template.userId,
            },
          });

          if (existing) {
            console.log(`⏭️  WhatsApp template ${template.name} already migrated`);
            continue;
          }

          // Create unified Template with WhatsApp official info
          await prisma.template.create({
            data: {
              name: template.name,
              type: 'WHATSAPP_OFFICIAL',
              scope: 'PRIVATE',
              status: 'APPROVED',
              language: template.language || 'pt_BR',
              tags: [],
              isActive: template.status === 'APPROVED',
              createdAt: template.createdAt,
              updatedAt: template.updatedAt,
              createdById: template.userId,
              whatsappOfficialInfo: {
                create: {
                  metaTemplateId: template.templateId,
                  status: template.status,
                  category: template.category,
                  qualityScore: template.qualityScore,
                  components: template.components,
                },
              },
            },
          });

          this.stats.templatesCreated++;
          console.log(`✅ Migrated WhatsApp template: ${template.name}`);
          
        } catch (error) {
          const errorMsg = `Failed to migrate WhatsApp template ${template.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          this.stats.errors.push(errorMsg);
        }
      }

      this.stats.templatesMigrated += legacyTemplates.length;
      
    } catch (error) {
      console.log('ℹ️  WhatsApp template table not found or already migrated');
    }
  }

  /**
   * Migrate interactive messages
   */
  private async migrateInteractiveMessages(): Promise<void> {
    try {
      const legacyMessages = await this.queryLegacyTable('MensagemInterativa', `
        SELECT 
          id, nome, tipo, texto, "headerTipo", "headerConteudo", rodape,
          "createdAt", "updatedAt", "userId"
        FROM "MensagemInterativa"
      `);

      if (!legacyMessages || legacyMessages.length === 0) {
        console.log('ℹ️  No legacy interactive messages found');
        return;
      }

      for (const message of legacyMessages) {
        try {
          // Check if already migrated
          const existing = await prisma.template.findFirst({
            where: {
              name: message.nome || `Interactive Message ${message.id}`,
              type: 'INTERACTIVE_MESSAGE',
            },
          });

          if (existing) {
            console.log(`⏭️  Interactive message ${message.nome} already migrated`);
            continue;
          }

          // Get buttons for this message
          const buttons = await this.queryLegacyTable('BotaoMensagemInterativa', `
            SELECT id, titulo, ordem
            FROM "BotaoMensagemInterativa"
            WHERE "mensagemInterativaId" = '${message.id}'
            ORDER BY ordem
          `);

          // Create unified Template with interactive content
          await prisma.template.create({
            data: {
              name: message.nome || `Interactive Message ${message.id}`,
              type: 'INTERACTIVE_MESSAGE',
              scope: 'PRIVATE',
              status: 'APPROVED',
              language: 'pt_BR',
              tags: [],
              isActive: true,
              createdAt: message.createdAt,
              updatedAt: message.updatedAt,
              createdById: message.userId,
              interactiveContent: {
                create: {
                  header: message.headerTipo && message.headerConteudo ? {
                    create: {
                      type: message.headerTipo,
                      content: message.headerConteudo,
                    },
                  } : undefined,
                  body: {
                    create: {
                      text: message.texto,
                    },
                  },
                  footer: message.rodape ? {
                    create: {
                      text: message.rodape,
                    },
                  } : undefined,
                  actionReplyButton: buttons && buttons.length > 0 ? {
                    create: {
                      buttons: buttons.map((btn: any) => ({
                        id: btn.id,
                        title: btn.titulo,
                        type: 'reply',
                      })),
                    },
                  } : undefined,
                },
              },
            },
          });

          this.stats.templatesCreated++;
          console.log(`✅ Migrated interactive message: ${message.nome}`);
          
        } catch (error) {
          const errorMsg = `Failed to migrate interactive message ${message.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          this.stats.errors.push(errorMsg);
        }
      }

      this.stats.templatesMigrated += legacyMessages.length;
      
    } catch (error) {
      console.log('ℹ️  Interactive message table not found or already migrated');
    }
  }

  /**
   * Migrate enhanced interactive messages
   */
  private async migrateEnhancedInteractiveMessages(): Promise<void> {
    try {
      const enhancedMessages = await this.queryLegacyTable('InteractiveMessage', `
        SELECT 
          id, name, type, "headerType", "headerContent", "bodyText", "footerText",
          "actionData", latitude, longitude, "locationName", "locationAddress",
          "reactionEmoji", "targetMessageId", "stickerMediaId", "stickerUrl",
          "createdAt", "updatedAt", "userId"
        FROM "InteractiveMessage"
      `);

      if (!enhancedMessages || enhancedMessages.length === 0) {
        console.log('ℹ️  No enhanced interactive messages found');
        return;
      }

      for (const message of enhancedMessages) {
        try {
          // Check if already migrated
          const existing = await prisma.template.findFirst({
            where: {
              name: message.name,
              type: 'INTERACTIVE_MESSAGE',
            },
          });

          if (existing) {
            console.log(`⏭️  Enhanced interactive message ${message.name} already migrated`);
            continue;
          }

          // Create unified Template with interactive content
          await prisma.template.create({
            data: {
              name: message.name,
              type: 'INTERACTIVE_MESSAGE',
              scope: 'PRIVATE',
              status: 'APPROVED',
              language: 'pt_BR',
              tags: [],
              isActive: true,
              createdAt: message.createdAt,
              updatedAt: message.updatedAt,
              createdById: message.userId,
              interactiveContent: {
                create: {
                  header: message.headerType && message.headerContent ? {
                    create: {
                      type: message.headerType,
                      content: message.headerContent,
                    },
                  } : undefined,
                  body: {
                    create: {
                      text: message.bodyText,
                    },
                  },
                  footer: message.footerText ? {
                    create: {
                      text: message.footerText,
                    },
                  } : undefined,
                  // Handle different action types based on message.type
                  ...(this.createActionForEnhancedMessage(message)),
                },
              },
            },
          });

          this.stats.templatesCreated++;
          console.log(`✅ Migrated enhanced interactive message: ${message.name}`);
          
        } catch (error) {
          const errorMsg = `Failed to migrate enhanced interactive message ${message.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          this.stats.errors.push(errorMsg);
        }
      }

      this.stats.templatesMigrated += enhancedMessages.length;
      
    } catch (error) {
      console.log('ℹ️  Enhanced interactive message table not found or already migrated');
    }
  }

  /**
   * Create action data for enhanced interactive messages
   */
  private createActionForEnhancedMessage(message: any): any {
    switch (message.type) {
      case 'button':
        return {
          actionReplyButton: message.actionData ? {
            create: {
              buttons: message.actionData,
            },
          } : undefined,
        };
      
      case 'list':
        return {
          actionList: message.actionData ? {
            create: {
              buttonText: message.actionData.buttonText || 'Ver opções',
              sections: message.actionData.sections || [],
            },
          } : undefined,
        };
      
      case 'cta_url':
        return {
          actionCtaUrl: message.actionData ? {
            create: {
              displayText: message.actionData.displayText || 'Clique aqui',
              url: message.actionData.url,
            },
          } : undefined,
        };
      
      case 'location_request':
        return {
          actionLocationRequest: {
            create: {
              requestText: message.actionData?.requestText || 'Compartilhe sua localização',
            },
          },
        };
      
      default:
        return {};
    }
  }

  /**
   * Migrate legacy mappings to unified models
   */
  private async migrateLegacyMappings(): Promise<void> {
    console.log('🔗 Migrating legacy mappings to unified models...');
    
    try {
      // This would migrate any existing intent mappings to the new structure
      // Since the schema already shows MapeamentoIntencao, this might not be needed
      console.log('ℹ️  Mapping migration not needed - using unified models');
      
    } catch (error) {
      const errorMsg = `Failed to migrate mappings: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      this.stats.errors.push(errorMsg);
    }
  }

  /**
   * Create default configurations
   */
  private async createDefaultConfigurations(): Promise<void> {
    console.log('⚙️  Creating default configurations...');
    
    try {
      // Create default WhatsAppGlobalConfig for users who don't have one
      const usersWithoutGlobalConfig = await prisma.usuarioChatwit.findMany({
        where: {
          configuracaoGlobalWhatsApp: null,
        },
      });

      for (const user of usersWithoutGlobalConfig) {
        try {
          await prisma.whatsAppGlobalConfig.create({
            data: {
              usuarioChatwitId: user.id,
              whatsappApiKey: process.env.WHATSAPP_TOKEN || '',
              phoneNumberId: process.env.FROM_PHONE_NUMBER_ID || '',
              whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || '',
              graphApiBaseUrl: 'https://graph.facebook.com/v22.0',
            },
          });

          console.log(`✅ Created default WhatsApp config for user: ${user.name}`);
          
        } catch (error) {
          // Ignore if already exists
          if (!error.message?.includes('unique constraint')) {
            const errorMsg = `Failed to create default config for user ${user.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(`❌ ${errorMsg}`);
            this.stats.errors.push(errorMsg);
          }
        }
      }
      
    } catch (error) {
      const errorMsg = `Failed to create default configurations: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      this.stats.errors.push(errorMsg);
    }
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
    console.log('\n📊 Migration Statistics:');
    console.log(`├── Inboxes: ${this.stats.inboxesCreated} created, ${this.stats.inboxesMigrated} migrated`);
    console.log(`├── Leads: ${this.stats.leadsCreated} created, ${this.stats.leadsMigrated} migrated`);
    console.log(`├── Templates: ${this.stats.templatesCreated} created, ${this.stats.templatesMigrated} migrated`);
    console.log(`├── Mappings: ${this.stats.mappingsCreated} created`);
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
  const migration = new UnifiedModelMigration();
  migration.run()
    .then((stats) => {
      console.log('\n🎉 Migration completed!');
      process.exit(stats.errors.length > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}

export { UnifiedModelMigration };