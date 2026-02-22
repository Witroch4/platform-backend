/**
 * ChatwitConversationResolver — Busca/cria contato + conversa no Chatwit
 *
 * Usado por campanhas onde não há conversa pré-existente (conversationId: 0).
 * Garante que o template/mensagem tenha uma conversa válida antes de enviar.
 *
 * Fluxo:
 *   1. Buscar contato por phone_number
 *   2. Se não existe, criar contato
 *   3. Criar conversa (ConversationBuilder faz lookup automático se já existe)
 *   4. Retornar conversationId + displayId
 *
 * NOTA: Usa o token do UsuarioChatwit (não do Agent Bot) porque o Bot
 * não tem acesso a contacts/search. Documentado no contrato §13 como melhoria.
 */

import axios, { type AxiosError } from "axios";
import log from "@/lib/log";

export interface ResolvedConversation {
	contactId: number;
	conversationId: number;
	displayId: number;
}

interface ChatwitContact {
	id: number;
	name: string;
	phone_number: string;
}

interface ChatwitConversation {
	id: number;
	display_id: number;
	inbox_id: number;
	contact_id: number;
	status: string;
}

export class ChatwitConversationResolver {
	private baseUrl: string;
	private token: string;

	constructor(baseUrl: string, token: string) {
		this.baseUrl = baseUrl;
		this.token = token;
	}

	/**
	 * Resolve (busca ou cria) contato + conversa para um telefone.
	 * Retorna conversationId e displayId prontos para enviar mensagens.
	 */
	async resolve(
		accountId: number,
		inboxId: number,
		phone: string,
		contactName?: string,
	): Promise<ResolvedConversation> {
		// 1. Buscar contato por telefone
		let contact = await this.searchContact(accountId, phone);

		// 2. Criar contato se não existe
		if (!contact) {
			contact = await this.createContact(accountId, inboxId, phone, contactName);
		}

		// 3. Criar conversa (Chatwit faz lookup automático se inbox.lock_to_single_conversation)
		const conversation = await this.createConversation(accountId, inboxId, contact.id);

		log.info("[ChatwitConversationResolver] Conversa resolvida", {
			contactId: contact.id,
			conversationId: conversation.id,
			displayId: conversation.display_id,
			phone,
		});

		return {
			contactId: contact.id,
			conversationId: conversation.id,
			displayId: conversation.display_id,
		};
	}

	private async searchContact(accountId: number, phone: string): Promise<ChatwitContact | null> {
		try {
			const res = await axios.get(
				`${this.baseUrl}/api/v1/accounts/${accountId}/contacts/search`,
				{
					params: { q: phone, include_contacts: true },
					headers: this.headers(),
					timeout: 10_000,
				},
			);

			const contacts = res.data?.payload as ChatwitContact[] | undefined;
			if (contacts && contacts.length > 0) {
				// Buscar match exato por phone_number
				const exact = contacts.find((c) => c.phone_number === phone || c.phone_number === phone.replace("+", ""));
				return exact ?? contacts[0];
			}

			return null;
		} catch (err) {
			const axiosErr = err as AxiosError;
			log.warn("[ChatwitConversationResolver] Erro ao buscar contato", {
				phone,
				status: axiosErr.response?.status,
				error: axiosErr.message,
			});
			return null;
		}
	}

	private async createContact(
		accountId: number,
		inboxId: number,
		phone: string,
		name?: string,
	): Promise<ChatwitContact> {
		const res = await axios.post(
			`${this.baseUrl}/api/v1/accounts/${accountId}/contacts`,
			{
				name: name || phone,
				phone_number: phone,
				inbox_id: inboxId,
			},
			{
				headers: this.headers(),
				timeout: 10_000,
			},
		);

		const contact = res.data?.payload?.contact as ChatwitContact | undefined;
		if (!contact) {
			throw new Error(`Falha ao criar contato: resposta inesperada do Chatwit`);
		}

		log.info("[ChatwitConversationResolver] Contato criado", {
			contactId: contact.id,
			phone,
		});

		return contact;
	}

	private async createConversation(
		accountId: number,
		inboxId: number,
		contactId: number,
	): Promise<ChatwitConversation> {
		const res = await axios.post(
			`${this.baseUrl}/api/v1/accounts/${accountId}/conversations`,
			{
				inbox_id: inboxId,
				contact_id: contactId,
			},
			{
				headers: this.headers(),
				timeout: 10_000,
			},
		);

		// A resposta pode ser uma conversa existente (se lock_to_single) ou nova
		const conversation = res.data as ChatwitConversation | undefined;
		if (!conversation?.id) {
			throw new Error(`Falha ao criar conversa: resposta inesperada do Chatwit`);
		}

		return conversation;
	}

	private headers() {
		return {
			api_access_token: this.token,
			"Content-Type": "application/json",
		};
	}
}
