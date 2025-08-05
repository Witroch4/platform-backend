#!/usr/bin/env tsx

import { PrismaClient, LeadSource, EspecialidadeJuridica } from '@prisma/client';

const prisma = getPrismaInstance();

interface MigrationStats {
  usersMigrated: number;
  leadsMigrated: number;
  leadOabDataMigrated: number;
  arquivoLeadOabMigrated: number;
  errors: string[];
}

interface OldLeadChatwit {
  id: string;
  sourceId: string;
  name: string;
  nomeReal: string;
  phoneNumber: string;
  email: string;
  thumbnail: string;
  concluido: boolean;
  anotacoes: string;
  pdfUnificado: string;
  imagensConvertidas: string;
  leadUrl: string;
  fezRecurso: boolean;
  datasRecurso: string;
  provaManuscrita: any;
  manuscritoProcessado: boolean;
  aguardandoManuscrito: boolean;
  espelhoCorrecao: string;
  textoDOEspelho: any;
  espelhoProcessado: boolean;
  aguardandoEspelho: boolean;
  analiseUrl: string;
  argumentacaoUrl: string;
  analiseProcessada: boolean;
  aguardandoAnalise: boolean;
  analisePreliminar: any;
  analiseValidada: boolean;
  consultoriaFase2: boolean;
  recursoPreliminar: any;
  recursoValidado: boolean;
  recursoUrl: string;
  recursoArgumentacaoUrl: string;
  aguardandoRecurso: boolean;
  seccional: string;
  areaJuridica: string;
  notaFinal: number;
  situacao: string;
  inscricao: string;
  examesParticipados: any;
  espelhoBibliotecaId: string;
  especialidade: string;
  createdAt: Date;
  updatedAt: Date;
  usuarioId: string;
}

interface OldArquivoLeadChatwit {
  id: string;
  fileType: string;
  dataUrl: string;
  pdfConvertido: string;
  leadId: string;
}

class DataMigrator {
  private stats: MigrationStats = {
    usersMigrated: 0,
    leadsMigrated: 0,
    leadOabDataMigrated: 0,
    arquivoLeadOabMigrated: 0,
    errors: []
  };

  private defaultAccountId: string | null = null;
  private defaultUserId: string | null = null;

  private log(message: string, color: 'cyan' | 'green' | 'red' | 'yellow' | 'gray' = 'gray') {
    const colors = {
      cyan: '\x1b[36m',
      green: '\x1b[32m',
      red: '\x1b[31m',
      yellow: '\x1b[33m',
      gray: '\x1b[90m',
      reset: '\x1b[0m'
    };
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  async createDefaultUserAndAccount(): Promise<void> {
    this.log('👤 Criando usuário e conta padrão...', 'cyan');
    
    try {
      // Verificar se já existe um usuário
      const existingUsers = await prisma.user.findMany();
      
      if (existingUsers.length === 0) {
        // Criar um usuário padrão
        const defaultUser = await prisma.user.create({
          data: {
            name: 'Usuário Padrão',
            email: 'default@example.com',
            role: 'USER'
          }
        });
        this.defaultUserId = defaultUser.id;
        this.log('   ✅ Usuário padrão criado', 'green');
      } else {
        this.defaultUserId = existingUsers[0].id;
        this.log(`   ⚠️ Usando usuário existente: ${existingUsers[0].name}`, 'yellow');
      }

      // Verificar se já existe uma conta
      const existingAccounts = await prisma.$queryRaw<any[]>`
        SELECT id FROM accounts LIMIT 1
      `;

      if (existingAccounts.length === 0) {
        // Criar uma conta padrão
        await prisma.$executeRaw`
          INSERT INTO accounts (id, "userId", type, provider, "providerAccountId", "createdAt", "updatedAt")
          VALUES ('default-account', ${this.defaultUserId}, 'oauth', 'default', 'default', NOW(), NOW())
        `;
        this.defaultAccountId = 'default-account';
        this.log('   ✅ Conta padrão criada', 'green');
      } else {
        this.defaultAccountId = existingAccounts[0].id;
        this.log(`   ⚠️ Usando conta existente: ${this.defaultAccountId}`, 'yellow');
      }
    } catch (error) {
      this.stats.errors.push(`Erro ao criar usuário/conta padrão: ${error}`);
      this.log(`❌ Erro ao criar usuário/conta padrão: ${error}`, 'red');
    }
  }

  async migrateUsers(): Promise<void> {
    this.log('👥 Migrando usuários...', 'cyan');
    
    try {
      // Buscar usuários do banco restaurado
      const oldUsers = await prisma.user.findMany();
      
      for (const oldUser of oldUsers) {
        try {
          // Verificar se já existe no novo schema
          const existingUser = await prisma.user.findUnique({
            where: { id: oldUser.id }
          });

          if (!existingUser) {
            // Criar usuário no novo schema
            await prisma.user.create({
              data: {
                id: oldUser.id,
                name: oldUser.name,
                email: oldUser.email,
                emailVerified: oldUser.emailVerified,
                image: oldUser.image,
                role: oldUser.role,
                createdAt: oldUser.createdAt,
                updatedAt: oldUser.updatedAt
              }
            });
            this.stats.usersMigrated++;
            this.log(`   ✅ Usuário migrado: ${oldUser.name}`, 'green');
          } else {
            this.log(`   ⚠️ Usuário já existe: ${oldUser.name}`, 'yellow');
          }
        } catch (error) {
          this.stats.errors.push(`Erro ao migrar usuário ${oldUser.name}: ${error}`);
          this.log(`   ❌ Erro ao migrar usuário ${oldUser.name}: ${error}`, 'red');
        }
      }
    } catch (error) {
      this.stats.errors.push(`Erro geral ao migrar usuários: ${error}`);
      this.log(`❌ Erro geral ao migrar usuários: ${error}`, 'red');
    }
  }

  async migrateLeads(): Promise<void> {
    this.log('🎯 Migrando leads...', 'cyan');
    
    if (!this.defaultAccountId) {
      this.log('❌ Conta padrão não foi criada. Abortando migração de leads.', 'red');
      return;
    }
    
    try {
      // Buscar LeadChatwit do banco restaurado usando SQL direto
      const oldLeadChatwits = await prisma.$queryRaw<OldLeadChatwit[]>`
        SELECT * FROM "LeadChatwit"
      `;

      this.log(`   📊 Encontrados ${oldLeadChatwits.length} leads para migrar`, 'gray');

      for (const oldLead of oldLeadChatwits) {
        try {
          // Verificar se já existe no novo schema usando SQL direto
          const existingLeads = await prisma.$queryRaw<any[]>`
            SELECT "igSenderId" FROM "Lead" WHERE "igSenderId" = ${oldLead.id}
          `;

          if (existingLeads.length === 0) {
            // Criar Lead principal no novo schema usando SQL direto (com campos obrigatórios)
            await prisma.$executeRaw`
              INSERT INTO "Lead" ("igSenderId", "name", "email", "whatsapp", "seguidor", "isOnline", "accountId", "createdAt", "updatedAt")
              VALUES (${oldLead.id}, ${oldLead.name || oldLead.nomeReal}, ${oldLead.email}, ${oldLead.phoneNumber}, false, false, ${this.defaultAccountId}, ${oldLead.createdAt}, ${oldLead.updatedAt})
            `;

            // Criar LeadOabData
            const leadOabData = await prisma.leadOabData.create({
              data: {
                leadId: oldLead.id,
                nomeReal: oldLead.nomeReal,
                concluido: oldLead.concluido,
                anotacoes: oldLead.anotacoes,
                pdfUnificado: oldLead.pdfUnificado,
                imagensConvertidas: oldLead.imagensConvertidas,
                leadUrl: oldLead.leadUrl,
                fezRecurso: oldLead.fezRecurso,
                datasRecurso: oldLead.datasRecurso,
                provaManuscrita: oldLead.provaManuscrita,
                manuscritoProcessado: oldLead.manuscritoProcessado,
                aguardandoManuscrito: oldLead.aguardandoManuscrito,
                espelhoCorrecao: oldLead.espelhoCorrecao,
                textoDOEspelho: oldLead.textoDOEspelho,
                espelhoProcessado: oldLead.espelhoProcessado,
                aguardandoEspelho: oldLead.aguardandoEspelho,
                analiseUrl: oldLead.analiseUrl,
                argumentacaoUrl: oldLead.argumentacaoUrl,
                analiseProcessada: oldLead.analiseProcessada,
                aguardandoAnalise: oldLead.aguardandoAnalise,
                analisePreliminar: oldLead.analisePreliminar,
                analiseValidada: oldLead.analiseValidada,
                consultoriaFase2: oldLead.consultoriaFase2,
                recursoPreliminar: oldLead.recursoPreliminar,
                recursoValidado: oldLead.recursoValidado,
                recursoUrl: oldLead.recursoUrl,
                recursoArgumentacaoUrl: oldLead.recursoArgumentacaoUrl,
                aguardandoRecurso: oldLead.aguardandoRecurso,
                seccional: oldLead.seccional,
                areaJuridica: oldLead.areaJuridica,
                notaFinal: oldLead.notaFinal,
                situacao: oldLead.situacao,
                inscricao: oldLead.inscricao,
                examesParticipados: oldLead.examesParticipados,
                especialidade: oldLead.especialidade ? (oldLead.especialidade as EspecialidadeJuridica) : null,
                espelhoBibliotecaId: oldLead.espelhoBibliotecaId,
                usuarioChatwitId: oldLead.usuarioId
              }
            });

            // Buscar arquivos do lead usando SQL direto
            const oldArquivos = await prisma.$queryRaw<OldArquivoLeadChatwit[]>`
              SELECT * FROM "ArquivoLeadChatwit" WHERE "leadId" = ${oldLead.id}
            `;

            // Migrar arquivos
            for (const oldArquivo of oldArquivos) {
              try {
                await prisma.arquivoLeadOab.create({
                  data: {
                    id: oldArquivo.id,
                    fileType: oldArquivo.fileType,
                    dataUrl: oldArquivo.dataUrl,
                    pdfConvertido: oldArquivo.pdfConvertido,
                    leadOabDataId: leadOabData.id
                  }
                });
                this.stats.arquivoLeadOabMigrated++;
              } catch (error) {
                this.stats.errors.push(`Erro ao migrar arquivo ${oldArquivo.id}: ${error}`);
              }
            }

            this.stats.leadsMigrated++;
            this.stats.leadOabDataMigrated++;
            this.log(`   ✅ Lead migrado: ${oldLead.name} (${oldArquivos.length} arquivos)`, 'green');
          } else {
            this.log(`   ⚠️ Lead já existe: ${oldLead.name}`, 'yellow');
          }
        } catch (error) {
          this.stats.errors.push(`Erro ao migrar lead ${oldLead.name}: ${error}`);
          this.log(`   ❌ Erro ao migrar lead ${oldLead.name}: ${error}`, 'red');
        }
      }
    } catch (error) {
      this.stats.errors.push(`Erro geral ao migrar leads: ${error}`);
      this.log(`❌ Erro geral ao migrar leads: ${error}`, 'red');
    }
  }

  async migrateUsuarioChatwit(): Promise<void> {
    this.log('💬 Migrando UsuarioChatwit...', 'cyan');
    
    try {
      const oldUsuarioChatwits = await prisma.usuarioChatwit.findMany();
      
      for (const oldUsuario of oldUsuarioChatwits) {
        try {
          const existingUsuario = await prisma.usuarioChatwit.findUnique({
            where: { id: oldUsuario.id }
          });

          if (!existingUsuario) {
            await prisma.usuarioChatwit.create({
              data: {
                id: oldUsuario.id,
                appUserId: oldUsuario.appUserId,
                name: oldUsuario.name,
                availableName: oldUsuario.availableName,
                accountName: oldUsuario.accountName,
                channel: oldUsuario.channel,
                chatwitAccessToken: oldUsuario.chatwitAccessToken,
                chatwitAccountId: oldUsuario.chatwitAccountId,
                createdAt: oldUsuario.createdAt,
                updatedAt: oldUsuario.updatedAt
              }
            });
            this.log(`   ✅ UsuarioChatwit migrado: ${oldUsuario.name}`, 'green');
          } else {
            this.log(`   ⚠️ UsuarioChatwit já existe: ${oldUsuario.name}`, 'yellow');
          }
        } catch (error) {
          this.stats.errors.push(`Erro ao migrar UsuarioChatwit ${oldUsuario.name}: ${error}`);
          this.log(`   ❌ Erro ao migrar UsuarioChatwit ${oldUsuario.name}: ${error}`, 'red');
        }
      }
    } catch (error) {
      this.stats.errors.push(`Erro geral ao migrar UsuarioChatwit: ${error}`);
      this.log(`❌ Erro geral ao migrar UsuarioChatwit: ${error}`, 'red');
    }
  }

  async migrateNotifications(): Promise<void> {
    this.log('🔔 Migrando notificações...', 'cyan');
    
    try {
      const oldNotifications = await prisma.notification.findMany();
      
      for (const oldNotification of oldNotifications) {
        try {
          const existingNotification = await prisma.notification.findUnique({
            where: { id: oldNotification.id }
          });

          if (!existingNotification) {
            await prisma.notification.create({
              data: {
                id: oldNotification.id,
                title: oldNotification.title,
                message: oldNotification.message,
                type: oldNotification.type,
                read: oldNotification.read,
                userId: oldNotification.userId,
                createdAt: oldNotification.createdAt,
                updatedAt: oldNotification.updatedAt
              }
            });
            this.log(`   ✅ Notificação migrada: ${oldNotification.title}`, 'green');
          } else {
            this.log(`   ⚠️ Notificação já existe: ${oldNotification.title}`, 'yellow');
          }
        } catch (error) {
          this.stats.errors.push(`Erro ao migrar notificação ${oldNotification.id}: ${error}`);
          this.log(`   ❌ Erro ao migrar notificação ${oldNotification.id}: ${error}`, 'red');
        }
      }
    } catch (error) {
      this.stats.errors.push(`Erro geral ao migrar notificações: ${error}`);
      this.log(`❌ Erro geral ao migrar notificações: ${error}`, 'red');
    }
  }

  async migrate(): Promise<void> {
    this.log('🔄 Iniciando migração de dados para o novo schema...', 'cyan');
    
    try {
      // Criar usuário e conta padrão primeiro
      await this.createDefaultUserAndAccount();
      
      // Migrar na ordem correta (dependências primeiro)
      await this.migrateUsers();
      await this.migrateUsuarioChatwit();
      await this.migrateLeads();
      await this.migrateNotifications();

      // Resumo final
      this.log('\n📊 Resumo da Migração:', 'cyan');
      this.log(`   👥 Usuários migrados: ${this.stats.usersMigrated}`, 'gray');
      this.log(`   🎯 Leads migrados: ${this.stats.leadsMigrated}`, 'gray');
      this.log(`   📋 LeadOabData migrados: ${this.stats.leadOabDataMigrated}`, 'gray');
      this.log(`   📎 ArquivoLeadOab migrados: ${this.stats.arquivoLeadOabMigrated}`, 'gray');
      
      if (this.stats.errors.length > 0) {
        this.log(`\n❌ Erros encontrados: ${this.stats.errors.length}`, 'red');
        this.stats.errors.forEach(error => {
          this.log(`   - ${error}`, 'red');
        });
      }

      this.log('\n✅ Migração concluída!', 'green');
      
    } catch (error) {
      this.log(`❌ Erro fatal durante migração: ${error}`, 'red');
      throw error;
    }
  }
}

// Função principal
async function main() {
  const migrator = new DataMigrator();
  await migrator.migrate();
}

// Executar se for o arquivo principal
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
}

export { DataMigrator };