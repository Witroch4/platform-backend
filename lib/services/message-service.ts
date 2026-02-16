/**
 * MessageService - Serviço para persistência de mensagens com idempotência
 * Suporta mensagens de leads e respostas do bot
 */

import { getPrismaInstance } from "@/lib/connections";
import type { Message, Prisma } from "@prisma/client";

export interface SaveMessageOptions {
	chatId: string;
	content: string;
	isFromLead: boolean;
	externalId?: string; // wamid para idempotência
	messageType?: string;
	metadata?: Record<string, unknown>;
}

export interface MessageWithPagination {
	messages: Message[];
	hasMore: boolean;
	nextCursor?: string;
	totalCount: number;
}

export class MessageService {
	private get prisma() {
		return getPrismaInstance();
	}

	/**
	 * Salva mensagem com idempotência via upsert (1 query ao invés de 2).
	 * Usa @@unique([chatId, externalId]) para detectar duplicatas.
	 * Retorna null se mensagem duplicada (mesmo externalId).
	 */
	async saveMessage(options: SaveMessageOptions): Promise<Message | null> {
		const data = {
			chatId: options.chatId,
			content: options.content,
			isFromLead: options.isFromLead,
			externalId: options.externalId || null,
			messageType: options.messageType || "text",
			metadata: (options.metadata as Prisma.JsonObject) || null,
		};

		// Sem externalId: criar direto (sem idempotência possível)
		if (!options.externalId) {
			return this.prisma.message.create({ data });
		}

		// Com externalId: upsert idempotente usando @@unique([chatId, externalId])
		try {
			const msg = await this.prisma.message.upsert({
				where: {
					chatId_externalId: {
						chatId: options.chatId,
						externalId: options.externalId,
					},
				},
				create: data,
				update: {}, // Não atualizar se já existe
			});

			// Se updatedAt == createdAt, é nova; caso contrário, duplicata
			if (msg.updatedAt.getTime() !== msg.createdAt.getTime()) {
				console.log(`[MessageService] Mensagem duplicada detectada: ${options.externalId}`);
				return null;
			}

			return msg;
		} catch (error) {
			// Race condition: outra instância criou entre check e create
			if (error instanceof Error && error.message.includes("Unique constraint")) {
				console.log(`[MessageService] Mensagem duplicada (race): ${options.externalId}`);
				return null;
			}
			throw error;
		}
	}

	/**
	 * Busca mensagens de um chat com paginação cursor-based
	 */
	async getMessages(chatId: string, options: { limit?: number; cursor?: string } = {}): Promise<MessageWithPagination> {
		const limit = options.limit || 50;

		const messages = await this.prisma.message.findMany({
			where: { chatId },
			orderBy: { createdAt: "desc" },
			take: limit + 1,
			...(options.cursor && {
				cursor: { id: options.cursor },
				skip: 1,
			}),
		});

		const hasMore = messages.length > limit;
		const result = hasMore ? messages.slice(0, -1) : messages;

		// Contagem total
		const totalCount = await this.prisma.message.count({
			where: { chatId },
		});

		return {
			messages: result.reverse(), // Ordem cronológica
			hasMore,
			nextCursor: hasMore ? result[0]?.id : undefined,
			totalCount,
		};
	}

	/**
	 * Busca mensagens por leadId (via Chat)
	 */
	async getMessagesByLeadId(
		leadId: string,
		options: { limit?: number; cursor?: string } = {},
	): Promise<MessageWithPagination> {
		const chat = await this.prisma.chat.findFirst({
			where: { leadId },
			select: { id: true },
		});

		if (!chat) {
			return {
				messages: [],
				hasMore: false,
				nextCursor: undefined,
				totalCount: 0,
			};
		}

		return this.getMessages(chat.id, options);
	}

	/**
	 * Contagem de mensagens para um lead
	 */
	async getMessageCount(leadId: string): Promise<number> {
		const chat = await this.prisma.chat.findFirst({
			where: { leadId },
			select: { id: true },
		});

		if (!chat) return 0;

		return this.prisma.message.count({
			where: { chatId: chat.id },
		});
	}

	/**
	 * Busca última mensagem de um lead
	 */
	async getLastMessage(leadId: string): Promise<Message | null> {
		const chat = await this.prisma.chat.findFirst({
			where: { leadId },
			select: { id: true },
		});

		if (!chat) return null;

		return this.prisma.message.findFirst({
			where: { chatId: chat.id },
			orderBy: { createdAt: "desc" },
		});
	}
}

// Singleton para uso em toda a aplicação
export const messageService = new MessageService();
