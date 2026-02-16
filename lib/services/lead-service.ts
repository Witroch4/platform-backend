/**
 * LeadService - Serviço unificado para criação e busca de leads
 * Suporta deduplicação cross-source (recebearquivos + socialwiseflow)
 */

import { getPrismaInstance } from "@/lib/connections";
import { LeadSource, type Lead, type Chat } from "@prisma/client";

export interface FindOrCreateLeadOptions {
	// Identificadores primários (pelo menos um obrigatório)
	phoneNumber?: string;
	chatwitContactId?: string;

	// Contexto
	chatwitAccountId: string;
	inboxId?: string;

	// Dados de enriquecimento
	name?: string;
	email?: string;
	avatarUrl?: string;
}

export interface LeadWithChat {
	lead: Lead;
	chat: Chat;
	created: boolean;
}

export class LeadService {
	private get prisma() {
		return getPrismaInstance();
	}

	/**
	 * Busca ou cria um lead por telefone OU Chatwit contact ID
	 * Suporta ambas as fontes: recebearquivos (OAB) e socialwiseflow (WhatsApp)
	 */
	async findOrCreateLead(options: FindOrCreateLeadOptions): Promise<LeadWithChat> {
		const accountId = `CHATWIT_${options.chatwitAccountId}`;

		// Estratégia 1: Tentar encontrar por telefone (cross-source)
		if (options.phoneNumber) {
			const normalizedPhone = this.normalizePhone(options.phoneNumber);
			const existingByPhone = await this.prisma.lead.findFirst({
				where: {
					phone: normalizedPhone,
					accountId,
				},
			});

			if (existingByPhone) {
				const chat = await this.findOrCreateChat(existingByPhone.id, accountId);
				return { lead: existingByPhone, chat, created: false };
			}
		}

		// Estratégia 2: Tentar encontrar por Chatwit contact ID (sourceIdentifier)
		if (options.chatwitContactId) {
			const existingByContactId = await this.prisma.lead.findFirst({
				where: {
					sourceIdentifier: options.chatwitContactId,
					accountId,
				},
			});

			if (existingByContactId) {
				const chat = await this.findOrCreateChat(existingByContactId.id, accountId);
				return { lead: existingByContactId, chat, created: false };
			}
		}

		// 🔒 VALIDAÇÃO: Verificar se Account existe antes de criar Lead (prevenir FK error)
		const accountExists = await this.prisma.account.findUnique({
			where: { id: accountId },
			select: { id: true },
		});

		if (!accountExists) {
			console.error("🚨 ERRO: Tentativa de criar Lead com Account inexistente", {
				accountId,
				chatwitAccountId: options.chatwitAccountId,
				solucao: [
					"1. Criar Account com id=%s no banco de dados",
					"2. Ou vincular inbox a uma Account existente",
					"3. Verificar tabela UsuarioChatwit para chatwitAccountId correto"
				],
				phoneNumber: options.phoneNumber,
				chatwitContactId: options.chatwitContactId,
			});
			throw new Error(
				`Account ${accountId} não existe. Impossível criar Lead. Configure a Account primeiro ou vincule a inbox a uma Account válida.`
			);
		}

		// Criar novo lead com source apropriado
		const source = options.inboxId ? LeadSource.WHATSAPP_SOCIAL_FLOW : LeadSource.CHATWIT_OAB;
		const sourceIdentifier = options.chatwitContactId || options.phoneNumber || `auto_${Date.now()}`;

		const newLead = await this.prisma.lead.create({
			data: {
				name: options.name || "Lead sem nome",
				phone: options.phoneNumber ? this.normalizePhone(options.phoneNumber) : null,
				email: options.email,
				avatarUrl: options.avatarUrl,
				source,
				sourceIdentifier: String(sourceIdentifier),
				accountId,
				tags: [],
			},
		});

		const chat = await this.findOrCreateChat(newLead.id, accountId);
		return { lead: newLead, chat, created: true };
	}

	/**
	 * Busca lead existente por telefone
	 */
	async findLeadByPhone(phoneNumber: string, accountId: string): Promise<Lead | null> {
		const normalizedPhone = this.normalizePhone(phoneNumber);
		return this.prisma.lead.findFirst({
			where: {
				phone: normalizedPhone,
				accountId,
			},
		});
	}

	/**
	 * Busca lead existente por sourceIdentifier
	 */
	async findLeadBySourceIdentifier(sourceIdentifier: string, accountId: string): Promise<Lead | null> {
		return this.prisma.lead.findFirst({
			where: {
				sourceIdentifier,
				accountId,
			},
		});
	}

	/**
	 * Atualiza o updatedAt do lead para refletir atividade recente
	 */
	async touchLead(leadId: string): Promise<void> {
		await this.prisma.lead.update({
			where: { id: leadId },
			data: { updatedAt: new Date() },
		});
	}

	/**
	 * Busca ou cria Chat para um lead
	 */
	private async findOrCreateChat(leadId: string, accountId: string): Promise<Chat> {
		const existing = await this.prisma.chat.findUnique({
			where: { leadId_accountId: { leadId, accountId } },
		});

		if (existing) return existing;

		return this.prisma.chat.create({
			data: { leadId, accountId },
		});
	}

	/**
	 * Normaliza número de telefone para formato consistente
	 */
	private normalizePhone(phone: string): string {
		// Remove tudo exceto números e '+'
		return phone.replace(/[^\d+]/g, "");
	}
}

// Singleton para uso em toda a aplicação
export const leadService = new LeadService();
