import { getPrismaInstance } from "@/lib/connections";
import { leadService } from "@/lib/services/lead-service";
import type { WebhookPayload } from "@/types/webhook";

export interface ProcessChatwitLeadSyncResult {
	leadCreated: boolean;
	leadId: string;
	arquivos: number;
}

function normalizePhoneNumber(phoneNumber: string): string {
	return phoneNumber.replace(/[^\d+]/g, "");
}

async function resolveAppUserId(chatwitAccountId: string): Promise<string> {
	const prisma = getPrismaInstance();
	const existingChatwitAccount = await prisma.account.findUnique({
		where: { id: `CHATWIT_${chatwitAccountId}` },
		select: { userId: true },
	});

	if (existingChatwitAccount?.userId) {
		return existingChatwitAccount.userId;
	}

	const appUser = await prisma.user.findFirst({
		where: {
			accounts: {
				some: {
					providerAccountId: chatwitAccountId,
				},
			},
		},
		select: { id: true },
	});

	if (!appUser) {
		throw new Error(`Usuário do app não encontrado para accountId: ${chatwitAccountId}`);
	}

	return appUser.id;
}

async function upsertUsuarioChatwit(payload: WebhookPayload) {
	const prisma = getPrismaInstance();
	const chatwitAccountId = String(payload.usuario.account.id);
	const token = payload.usuario.CHATWIT_ACCESS_TOKEN?.trim();
	const existingUsuario = await prisma.usuarioChatwit.findFirst({
		where: { chatwitAccountId },
	});

	if (existingUsuario) {
		return prisma.usuarioChatwit.update({
			where: { id: existingUsuario.id },
			data: {
				name: payload.usuario.account.name,
				accountName: payload.usuario.account.name,
				channel: payload.usuario.channel,
				chatwitAccountId,
				chatwitAccessToken: token || existingUsuario.chatwitAccessToken,
			},
		});
	}

	const appUserId = await resolveAppUserId(chatwitAccountId);
	return prisma.usuarioChatwit.create({
		data: {
			appUserId,
			name: payload.usuario.account.name,
			accountName: payload.usuario.account.name,
			channel: payload.usuario.channel,
			chatwitAccountId,
			chatwitAccessToken: token || undefined,
		},
	});
}

async function ensureChatwitAccount(appUserId: string, chatwitAccountId: string) {
	const prisma = getPrismaInstance();
	const accountId = `CHATWIT_${chatwitAccountId}`;

	await prisma.account.upsert({
		where: { id: accountId },
		update: {
			userId: appUserId,
		},
		create: {
			id: accountId,
			userId: appUserId,
			type: "chatwit",
			provider: "chatwit",
			providerAccountId: chatwitAccountId,
		},
	});

	return accountId;
}

function buildLeadOabCreateData(leadId: string, usuarioChatwitId: string, leadUrl?: string | null) {
	return {
		leadId,
		leadUrl: leadUrl || null,
		usuarioChatwitId,
		concluido: false,
		fezRecurso: false,
		manuscritoProcessado: false,
		aguardandoManuscrito: false,
		espelhoProcessado: false,
		aguardandoEspelho: false,
		analiseProcessada: false,
		aguardandoAnalise: false,
		analiseValidada: false,
		consultoriaFase2: false,
		recursoValidado: false,
		aguardandoRecurso: false,
	};
}

export async function processChatwitLeadSync(payload: WebhookPayload): Promise<ProcessChatwitLeadSyncResult> {
	const prisma = getPrismaInstance();
	const chatwitAccountId = String(payload.usuario.account.id);
	const leadSourceId = String(payload.origemLead.source_id);
	const phoneNumber = payload.origemLead.phone_number ? normalizePhoneNumber(payload.origemLead.phone_number) : null;
	const normalizedLeadUrl = payload.origemLead.leadUrl?.trim() || null;
	const usuarioDb = await upsertUsuarioChatwit(payload);
	const chatwitScopedAccountId = await ensureChatwitAccount(usuarioDb.appUserId, chatwitAccountId);
	const leadLookup = await leadService.findOrCreateLead({
		chatwitAccountId,
		chatwitContactId: leadSourceId,
		phoneNumber: payload.origemLead.phone_number || undefined,
		name: payload.origemLead.name || "Lead sem nome",
		avatarUrl: payload.origemLead.thumbnail || undefined,
	});

	const lead = await prisma.lead.update({
		where: { id: leadLookup.lead.id },
		data: {
			name: payload.origemLead.name || "Lead sem nome",
			phone: phoneNumber,
			avatarUrl: payload.origemLead.thumbnail || null,
			userId: usuarioDb.appUserId,
			accountId: chatwitScopedAccountId,
			updatedAt: new Date(),
		},
	});

	const leadOabData = await prisma.leadOabData.upsert({
		where: { leadId: lead.id },
		update: {
			usuarioChatwitId: usuarioDb.id,
			...(normalizedLeadUrl ? { leadUrl: normalizedLeadUrl } : {}),
		},
		create: buildLeadOabCreateData(lead.id, usuarioDb.id, normalizedLeadUrl),
	});

	const arquivos = Array.isArray(payload.origemLead.arquivos)
		? payload.origemLead.arquivos.filter((arquivo) => arquivo?.data_url)
		: [];

	if (arquivos.length > 0) {
		await prisma.arquivoLeadOab.createMany({
			data: arquivos.map((arquivo) => ({
				leadOabDataId: leadOabData.id,
				fileType: arquivo.file_type,
				dataUrl: arquivo.data_url,
				chatwitFileId: arquivo.chatwitFileId,
			})),
			skipDuplicates: true,
		});
	}

	return {
		leadCreated: leadLookup.created,
		leadId: leadOabData.id,
		arquivos: arquivos.length,
	};
}
