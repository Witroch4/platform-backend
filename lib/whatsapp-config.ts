import { getPrismaInstance } from "@/lib/connections";

/**
 * Busca configuração do WhatsApp para uma caixa de entrada específica
 * Se não encontrar configuração específica, retorna a configuração padrão
 */
export async function getWhatsAppConfig(usuarioChatwitId: string, inboxId?: string) {
	try {
		let config = null;

		// Se foi especificada uma caixa de entrada, buscar configuração específica
		if (inboxId) {
			const inboxConfig = await getPrismaInstance().chatwitInbox.findFirst({
				where: {
					id: inboxId,
					usuarioChatwitId,
				},
			});

			if (inboxConfig && inboxConfig.whatsappApiKey) {
				return {
					id: inboxConfig.id,
					usuarioChatwitId: inboxConfig.usuarioChatwitId,
					whatsappApiKey: inboxConfig.whatsappApiKey,
					phoneNumberId: inboxConfig.phoneNumberId,
					whatsappBusinessAccountId: inboxConfig.whatsappBusinessAccountId,
					graphApiBaseUrl: "https://graph.facebook.com/v22.0", // Valor padrão
					isActive: true,
					inboxId: inboxConfig.id,
				};
			}
		}

		// Se não encontrou configuração específica, buscar a padrão
		if (!config) {
			config = await getPrismaInstance().whatsAppGlobalConfig.findFirst({
				where: {
					usuarioChatwitId,
				},
			});
		}

		return config;
	} catch (error) {
		console.error("Erro ao buscar configuração do WhatsApp:", error);
		return null;
	}
}

/**
 * Busca todas as configurações do WhatsApp de um usuário
 */
export async function getAllWhatsAppConfigs(usuarioChatwitId: string) {
	try {
		// Buscar configuração global
		const globalConfig = await getPrismaInstance().whatsAppGlobalConfig.findFirst({
			where: {
				usuarioChatwitId,
			},
		});

		// Buscar caixas com configurações específicas
		const inboxesWithConfig = await getPrismaInstance().chatwitInbox.findMany({
			where: {
				usuarioChatwitId,
				whatsappApiKey: { not: null },
			},
			select: {
				id: true,
				nome: true,
				inboxId: true,
				channelType: true,
				whatsappApiKey: true,
				phoneNumberId: true,
				whatsappBusinessAccountId: true,
				usuarioChatwitId: true,
			},
		});

		const configs: any[] = [];

		// Adicionar configuração global se existir
		if (globalConfig) {
			configs.push({
				...globalConfig,
				chatwitInbox: null,
				isActive: true,
			});
		}

		// Adicionar configurações específicas das caixas
		inboxesWithConfig.forEach((inbox) => {
			configs.push({
				id: inbox.id,
				usuarioChatwitId: inbox.usuarioChatwitId,
				whatsappApiKey: inbox.whatsappApiKey,
				phoneNumberId: inbox.phoneNumberId,
				whatsappBusinessAccountId: inbox.whatsappBusinessAccountId,
				graphApiBaseUrl: "https://graph.facebook.com/v22.0",
				isActive: true,
				inboxId: inbox.id,
				chatwitInbox: {
					id: inbox.id,
					nome: inbox.nome,
					inboxId: inbox.inboxId,
					inboxName: inbox.nome,
					channelType: inbox.channelType,
				},
			});
		});

		return configs;
	} catch (error) {
		console.error("Erro ao buscar configurações do WhatsApp:", error);
		return [];
	}
}

/**
 * Verifica se uma configuração está ativa
 */
export function isConfigActive(config: any) {
	return config && config.isActive && config.whatsappApiKey && config.whatsappBusinessAccountId;
}

/**
 * Valida uma configuração do WhatsApp
 */
export function validateWhatsAppConfig(config: any) {
	const errors: string[] = [];

	if (!config.whatsappApiKey) {
		errors.push("Token do WhatsApp é obrigatório");
	}

	if (!config.whatsappBusinessAccountId) {
		errors.push("ID da conta Business do WhatsApp é obrigatório");
	}

	if (!config.graphApiBaseUrl) {
		errors.push("URL base da API do Facebook é obrigatória");
	}

	return {
		isValid: errors.length === 0,
		errors,
	};
}
