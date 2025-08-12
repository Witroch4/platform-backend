import { getPrismaInstance } from './connections';
const prisma = getPrismaInstance();
import { LeadSource, Lead, LeadInstagramProfile, LeadOabData } from '@prisma/client';

// Extended lead interface with related data
export interface ExtendedLead extends Lead {
  instagramProfile?: LeadInstagramProfile | null;
  oabData?: LeadOabData | null;
}

// Lead creation data interface
export interface LeadCreationData {
  contactPhone: string;
  contactSource: string;
  messageId: number;
  accountId: number;
  accountName: string;
  wamid: string;
  inboxId: string;
  // Optional enrichment data
  name?: string;
  email?: string;
  avatarUrl?: string;
  tags?: string[];
}

// Lead update data interface
export interface LeadUpdateData {
  name?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  tags?: string[];
  // Instagram-specific updates
  instagramProfile?: {
    isFollower?: boolean;
    lastMessageAt?: Date;
    isOnline?: boolean;
  };
  // OAB-specific updates
  oabData?: {
    concluido?: boolean;
    anotacoes?: string;
    seccional?: string;
    areaJuridica?: string;
    notaFinal?: number;
    situacao?: string;
    inscricao?: string;
  };
}

// Lead search filters
export interface LeadSearchFilters {
  source?: LeadSource;
  accountId?: string;
  userId?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  // Instagram-specific filters
  isFollower?: boolean;
  isOnline?: boolean;
  // OAB-specific filters
  concluido?: boolean;
  seccional?: string;
  areaJuridica?: string;
}

// Lead search result with pagination
export interface LeadSearchResult {
  leads: ExtendedLead[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export class UnifiedLeadManager {
  /**
   * Resolve or create legacy Chatwit Account.id pattern: 'CHATWIT_{chatwitAccountId}' using inboxId.
   * Ensures an Account row exists with that id, linked to the same app user.
   */
  private static async resolveOrCreateChatwitAccountIdFromInbox(inboxId: string, fallbackNumericAccountId?: number): Promise<string | null> {
    try {
      // Find ChatwitInbox by external inboxId (e.g., '4') and include usuarioChatwit
      const inbox = await prisma.chatwitInbox.findFirst({
        where: { inboxId: inboxId },
        include: { usuarioChatwit: true },
      });

      if (!inbox || !inbox.usuarioChatwit?.appUserId) {
        return null;
      }

      const chatwitAccountId = inbox.usuarioChatwit.chatwitAccountId || (fallbackNumericAccountId !== undefined ? String(fallbackNumericAccountId) : null);
      if (!chatwitAccountId) return null;

      const chatwitAccountPk = `CHATWIT_${chatwitAccountId}`;

      // Ensure Account exists with this id
      let account = await prisma.account.findUnique({ where: { id: chatwitAccountPk } });
      if (!account) {
        account = await prisma.account.create({
          data: {
            id: chatwitAccountPk,
            userId: inbox.usuarioChatwit.appUserId,
            type: 'chatwit',
            provider: 'chatwit',
            providerAccountId: chatwitAccountId,
          },
        });
      }

      return account.id;
    } catch (error) {
      console.error('[UnifiedLeadManager] Failed to resolve Chatwit Account.id from inbox', {
        inboxId,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }
  /**
   * Find lead using contact_source for identification
   */
  static async findLeadByContactSource(
    contactSource: string,
    accountId: number,
    inboxId?: string
  ): Promise<ExtendedLead | null> {
    try {
      const leadSource = this.mapContactSourceToLeadSource(contactSource);
      const sourceIdentifier = contactSource;

      // Resolve legacy Chatwit account id (CHATWIT_{id}) if possible
      const chatwitAccountPk = inboxId
        ? await this.resolveOrCreateChatwitAccountIdFromInbox(inboxId, accountId)
        : null;

      let lead: ExtendedLead | null = null;
      if (chatwitAccountPk) {
        lead = await prisma.lead.findFirst({
          where: {
            source: leadSource,
            sourceIdentifier,
            accountId: chatwitAccountPk,
          },
          include: {
            instagramProfile: true,
            oabData: {
              include: {
                usuarioChatwit: true,
                arquivos: true,
                espelhoBiblioteca: true,
              },
            },
            user: true,
            account: true,
          },
        });
      }

      // If not found with real account id, try without filtering by account (to catch legacy/null account leads)
      if (!lead) {
        lead = await prisma.lead.findFirst({
          where: {
            source: leadSource,
            sourceIdentifier,
          },
          include: {
            instagramProfile: true,
            oabData: {
              include: {
                usuarioChatwit: true,
                arquivos: true,
                espelhoBiblioteca: true,
              },
            },
            user: true,
            account: true,
          },
        });
      }

      if (lead) {
        console.log(`[UnifiedLeadManager] Found lead by contact source: ${contactSource}`, {
          leadId: lead.id,
          source: lead.source,
          sourceIdentifier: lead.sourceIdentifier,
        });
      }

      return lead;
    } catch (error) {
      console.error(`[UnifiedLeadManager] Error finding lead by contact source: ${contactSource}`, {
        error: error instanceof Error ? error.message : error,
        accountId,
      });
      return null;
    }
  }

  /**
   * Create lead with proper source and sourceIdentifier
   */
  static async createLead(data: LeadCreationData): Promise<ExtendedLead> {
    try {
      const leadSource = this.mapContactSourceToLeadSource(data.contactSource);
      const sourceIdentifier = data.contactSource;

      // Resolve or create Chatwit account id (CHATWIT_{id}) from inbox
      const chatwitAccountPk = await this.resolveOrCreateChatwitAccountIdFromInbox(data.inboxId, data.accountId);

      // Prepare lead creation data
      const leadData: any = {
        name: data.name,
        email: data.email,
        phone: data.contactPhone,
        avatarUrl: data.avatarUrl,
        source: leadSource,
        sourceIdentifier,
        tags: data.tags || [],
        // Only set accountId if we resolved or created a valid Chatwit account id
        ...(chatwitAccountPk ? { accountId: chatwitAccountPk } : {}),
      };

      // Add source-specific data
      if (leadSource === LeadSource.INSTAGRAM) {
        leadData.instagramProfile = {
          create: {
            isFollower: false,
            lastMessageAt: new Date(),
            isOnline: true,
          },
        };
      } else if (leadSource === LeadSource.CHATWIT_OAB) {
        // For OAB leads, we need to find the UsuarioChatwit
        // Prefer resolver via inboxId
        let usuarioChatwit = await prisma.usuarioChatwit.findFirst({
          where: { inboxes: { some: { inboxId: data.inboxId } } },
        });
        if (!usuarioChatwit) {
          usuarioChatwit = await prisma.usuarioChatwit.findFirst({
            where: { chatwitAccountId: data.accountId.toString() },
          });
        }

        if (usuarioChatwit) {
          leadData.oabData = {
            create: {
              usuarioChatwitId: usuarioChatwit.id,
              concluido: false,
              anotacoes: `Lead criado via webhook - WAMID: ${data.wamid}`,
            },
          };
        }
      }

      const lead = await prisma.lead.create({
        data: leadData,
        include: {
          instagramProfile: true,
          oabData: {
            include: {
              usuarioChatwit: true,
              arquivos: true,
              espelhoBiblioteca: true,
            },
          },
          user: true,
          account: true,
        },
      });

      console.log(`[UnifiedLeadManager] Created new lead: ${lead.id}`, {
        source: leadSource,
        sourceIdentifier,
        accountId: data.accountId,
        contactPhone: data.contactPhone,
      });

      return lead;
    } catch (error) {
      console.error('[UnifiedLeadManager] Error creating lead:', {
        error: error instanceof Error ? error.message : error,
        data,
      });
      throw error;
    }
  }

  /**
   * Update lead with message metadata (wamid, account info)
   */
  static async updateLeadWithMessageMetadata(
    leadId: string,
    metadata: {
      wamid: string;
      messageId: number;
      accountId: number;
      accountName: string;
      contactPhone?: string;
    }
  ): Promise<ExtendedLead> {
    try {
      const updateData: any = {
        updatedAt: new Date(),
      };

      // Update phone if provided
      if (metadata.contactPhone) {
        updateData.phone = metadata.contactPhone;
      }

      const lead = await prisma.lead.update({
        where: { id: leadId },
        data: updateData,
        include: {
          instagramProfile: true,
          oabData: {
            include: {
              usuarioChatwit: true,
              arquivos: true,
              espelhoBiblioteca: true,
            },
          },
          user: true,
          account: true,
        },
      });

      // Update source-specific data
      if (lead.source === LeadSource.INSTAGRAM && lead.instagramProfile) {
        await prisma.leadInstagramProfile.update({
          where: { leadId },
          data: {
            lastMessageAt: new Date(),
            isOnline: true,
          },
        });
      } else if (lead.source === LeadSource.CHATWIT_OAB && lead.oabData) {
        // Add message metadata to annotations
        const newAnnotation = `Mensagem recebida - WAMID: ${metadata.wamid}, Account: ${metadata.accountName} (${metadata.accountId})`;
        const currentAnnotations = lead.oabData.anotacoes || '';
        const updatedAnnotations = currentAnnotations 
          ? `${currentAnnotations}\n${newAnnotation}`
          : newAnnotation;

        await prisma.leadOabData.update({
          where: { leadId },
          data: {
            anotacoes: updatedAnnotations,
          },
        });
      }

      console.log(`[UnifiedLeadManager] Updated lead with message metadata: ${leadId}`, {
        wamid: metadata.wamid,
        messageId: metadata.messageId,
        accountId: metadata.accountId,
      });

      return lead;
    } catch (error) {
      console.error(`[UnifiedLeadManager] Error updating lead with message metadata: ${leadId}`, {
        error: error instanceof Error ? error.message : error,
        metadata,
      });
      throw error;
    }
  }

  /**
   * Find or create lead using contact_source for identification
   */
  static async findOrCreateLead(data: LeadCreationData): Promise<{
    lead: ExtendedLead;
    created: boolean;
  }> {
    try {
      // First, try to find existing lead
      const existingLead = await this.findLeadByContactSource(
        data.contactSource,
        data.accountId
      );

      if (existingLead) {
        // Update existing lead with message metadata
        const updatedLead = await this.updateLeadWithMessageMetadata(
          existingLead.id,
          {
            wamid: data.wamid,
            messageId: data.messageId,
            accountId: data.accountId,
            accountName: data.accountName,
            contactPhone: data.contactPhone,
          }
        );

        return { lead: updatedLead, created: false };
      }

      // Create new lead
      const newLead = await this.createLead(data);
      return { lead: newLead, created: true };

    } catch (error) {
      console.error('[UnifiedLeadManager] Error in findOrCreateLead:', {
        error: error instanceof Error ? error.message : error,
        data,
      });
      throw error;
    }
  }

  /**
   * Add lead data enrichment from webhook payload
   */
  static async enrichLeadFromWebhookPayload(
    leadId: string,
    payload: {
      contact_phone?: string;
      contact_name?: string;
      contact_email?: string;
      contact_avatar?: string;
      additional_data?: Record<string, any>;
    }
  ): Promise<ExtendedLead> {
    try {
      const updateData: any = {
        updatedAt: new Date(),
      };

      // Enrich basic lead data
      if (payload.contact_name) updateData.name = payload.contact_name;
      if (payload.contact_email) updateData.email = payload.contact_email;
      if (payload.contact_phone) updateData.phone = payload.contact_phone;
      if (payload.contact_avatar) updateData.avatarUrl = payload.contact_avatar;

      const lead = await prisma.lead.update({
        where: { id: leadId },
        data: updateData,
        include: {
          instagramProfile: true,
          oabData: {
            include: {
              usuarioChatwit: true,
              arquivos: true,
              espelhoBiblioteca: true,
            },
          },
          user: true,
          account: true,
        },
      });

      // Enrich source-specific data
      if (payload.additional_data) {
        if (lead.source === LeadSource.INSTAGRAM && lead.instagramProfile) {
          const instagramData = payload.additional_data.instagram || {};
          if (instagramData.is_follower !== undefined || instagramData.is_online !== undefined) {
            await prisma.leadInstagramProfile.update({
              where: { leadId },
              data: {
                ...(instagramData.is_follower !== undefined && { isFollower: instagramData.is_follower }),
                ...(instagramData.is_online !== undefined && { isOnline: instagramData.is_online }),
                lastMessageAt: new Date(),
              },
            });
          }
        } else if (lead.source === LeadSource.CHATWIT_OAB && lead.oabData) {
          const oabData = payload.additional_data.oab || {};
          const updateOabData: any = {};

          if (oabData.seccional) updateOabData.seccional = oabData.seccional;
          if (oabData.area_juridica) updateOabData.areaJuridica = oabData.area_juridica;
          if (oabData.inscricao) updateOabData.inscricao = oabData.inscricao;
          if (oabData.situacao) updateOabData.situacao = oabData.situacao;

          if (Object.keys(updateOabData).length > 0) {
            await prisma.leadOabData.update({
              where: { leadId },
              data: updateOabData,
            });
          }
        }
      }

      console.log(`[UnifiedLeadManager] Enriched lead from webhook payload: ${leadId}`, {
        enrichedFields: Object.keys(updateData),
        hasAdditionalData: !!payload.additional_data,
      });

      return lead;
    } catch (error) {
      console.error(`[UnifiedLeadManager] Error enriching lead from webhook payload: ${leadId}`, {
        error: error instanceof Error ? error.message : error,
        payload,
      });
      throw error;
    }
  }

  /**
   * Search leads with filters and pagination
   */
  static async searchLeads(
    filters: LeadSearchFilters = {},
    page: number = 1,
    pageSize: number = 20
  ): Promise<LeadSearchResult> {
    try {
      const skip = (page - 1) * pageSize;
      
      // Build where clause
      const where: any = {};

      if (filters.source) where.source = filters.source;
      if (filters.accountId) where.accountId = filters.accountId;
      if (filters.userId) where.userId = filters.userId;
      if (filters.phone) where.phone = { contains: filters.phone, mode: 'insensitive' };
      if (filters.email) where.email = { contains: filters.email, mode: 'insensitive' };
      if (filters.tags && filters.tags.length > 0) {
        where.tags = { hasSome: filters.tags };
      }
      if (filters.createdAfter) where.createdAt = { gte: filters.createdAfter };
      if (filters.createdBefore) {
        where.createdAt = where.createdAt 
          ? { ...where.createdAt, lte: filters.createdBefore }
          : { lte: filters.createdBefore };
      }

      // Add source-specific filters
      if (filters.isFollower !== undefined || filters.isOnline !== undefined) {
        where.instagramProfile = {};
        if (filters.isFollower !== undefined) where.instagramProfile.isFollower = filters.isFollower;
        if (filters.isOnline !== undefined) where.instagramProfile.isOnline = filters.isOnline;
      }

      if (filters.concluido !== undefined || filters.seccional || filters.areaJuridica) {
        where.oabData = {};
        if (filters.concluido !== undefined) where.oabData.concluido = filters.concluido;
        if (filters.seccional) where.oabData.seccional = { contains: filters.seccional, mode: 'insensitive' };
        if (filters.areaJuridica) where.oabData.areaJuridica = { contains: filters.areaJuridica, mode: 'insensitive' };
      }

      // Execute queries
      const [leads, total] = await Promise.all([
        prisma.lead.findMany({
          where,
          include: {
            instagramProfile: true,
            oabData: {
              include: {
                usuarioChatwit: true,
                arquivos: true,
                espelhoBiblioteca: true,
              },
            },
            user: true,
            account: true,
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.lead.count({ where }),
      ]);

      const hasMore = skip + leads.length < total;

      console.log(`[UnifiedLeadManager] Search completed`, {
        filters,
        page,
        pageSize,
        total,
        returned: leads.length,
        hasMore,
      });

      return {
        leads,
        total,
        page,
        pageSize,
        hasMore,
      };
    } catch (error) {
      console.error('[UnifiedLeadManager] Error searching leads:', {
        error: error instanceof Error ? error.message : error,
        filters,
        page,
        pageSize,
      });
      throw error;
    }
  }

  /**
   * Update lead data
   */
  static async updateLead(leadId: string, data: LeadUpdateData): Promise<ExtendedLead> {
    try {
      // Prepare main lead update data
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
      if (data.tags !== undefined) updateData.tags = data.tags;

      // Update main lead record
      const lead = await prisma.lead.update({
        where: { id: leadId },
        data: updateData,
        include: {
          instagramProfile: true,
          oabData: {
            include: {
              usuarioChatwit: true,
              arquivos: true,
              espelhoBiblioteca: true,
            },
          },
          user: true,
          account: true,
        },
      });

      // Update source-specific data
      if (data.instagramProfile && lead.instagramProfile) {
        await prisma.leadInstagramProfile.update({
          where: { leadId },
          data: data.instagramProfile,
        });
      }

      if (data.oabData && lead.oabData) {
        await prisma.leadOabData.update({
          where: { leadId },
          data: data.oabData,
        });
      }

      console.log(`[UnifiedLeadManager] Updated lead: ${leadId}`, {
        updatedFields: Object.keys(updateData),
        hasInstagramUpdate: !!data.instagramProfile,
        hasOabUpdate: !!data.oabData,
      });

      return lead;
    } catch (error) {
      console.error(`[UnifiedLeadManager] Error updating lead: ${leadId}`, {
        error: error instanceof Error ? error.message : error,
        data,
      });
      throw error;
    }
  }

  /**
   * Delete lead (soft delete by setting inactive)
   */
  static async deleteLead(leadId: string): Promise<void> {
    try {
      // Instead of hard delete, we could add an isActive field
      // For now, we'll do a hard delete but log it
      await prisma.lead.delete({
        where: { id: leadId },
      });

      console.log(`[UnifiedLeadManager] Deleted lead: ${leadId}`);
    } catch (error) {
      console.error(`[UnifiedLeadManager] Error deleting lead: ${leadId}`, {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get lead statistics by source
   */
  static async getLeadStatistics(accountId?: string): Promise<{
    total: number;
    bySource: Record<LeadSource, number>;
    recentCount: number; // Last 7 days
  }> {
    try {
      const where: any = {};
      if (accountId) where.accountId = accountId;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [total, bySource, recentCount] = await Promise.all([
        prisma.lead.count({ where }),
        prisma.lead.groupBy({
          by: ['source'],
          where,
          _count: { id: true },
        }),
        prisma.lead.count({
          where: {
            ...where,
            createdAt: { gte: sevenDaysAgo },
          },
        }),
      ]);

      const sourceStats: Record<LeadSource, number> = {
        [LeadSource.INSTAGRAM]: 0,
        [LeadSource.CHATWIT_OAB]: 0,
        [LeadSource.MANUAL]: 0,
      };

      bySource.forEach(group => {
        sourceStats[group.source] = group._count.id;
      });

      console.log(`[UnifiedLeadManager] Generated lead statistics`, {
        total,
        bySource: sourceStats,
        recentCount,
        accountId,
      });

      return {
        total,
        bySource: sourceStats,
        recentCount,
      };
    } catch (error) {
      console.error('[UnifiedLeadManager] Error getting lead statistics:', {
        error: error instanceof Error ? error.message : error,
        accountId,
      });
      throw error;
    }
  }

  /**
   * Map contact_source from webhook to LeadSource enum
   */
  private static mapContactSourceToLeadSource(contactSource: string): LeadSource {
    const source = contactSource.toLowerCase();
    
    if (source.includes('instagram') || source.includes('ig')) {
      return LeadSource.INSTAGRAM;
    }
    
    if (source.includes('oab') || source.includes('chatwit')) {
      return LeadSource.CHATWIT_OAB;
    }
    
    // Default to manual for unknown sources
    return LeadSource.MANUAL;
  }
}

// Export utility functions for common operations
export async function findLeadByContactSource(
  contactSource: string,
  accountId: number
): Promise<ExtendedLead | null> {
  return UnifiedLeadManager.findLeadByContactSource(contactSource, accountId);
}

export async function createLeadFromWebhook(data: LeadCreationData): Promise<ExtendedLead> {
  return UnifiedLeadManager.createLead(data);
}

export async function findOrCreateLeadFromWebhook(data: LeadCreationData): Promise<{
  lead: ExtendedLead;
  created: boolean;
}> {
  return UnifiedLeadManager.findOrCreateLead(data);
}

export async function enrichLeadFromPayload(
  leadId: string,
  payload: {
    contact_phone?: string;
    contact_name?: string;
    contact_email?: string;
    contact_avatar?: string;
    additional_data?: Record<string, any>;
  }
): Promise<ExtendedLead> {
  return UnifiedLeadManager.enrichLeadFromWebhookPayload(leadId, payload);
}

export async function searchLeadsWithFilters(
  filters: LeadSearchFilters = {},
  page: number = 1,
  pageSize: number = 20
): Promise<LeadSearchResult> {
  return UnifiedLeadManager.searchLeads(filters, page, pageSize);
}

export async function getLeadStats(accountId?: string) {
  return UnifiedLeadManager.getLeadStatistics(accountId);
}