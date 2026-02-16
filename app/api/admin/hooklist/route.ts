// app/api/admin/hooklist/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import axios from "axios";

const prisma = getPrismaInstance();

/**
 * GET - Lista hooks do Chatwit (versão simplificada)
 */
export async function GET(request: NextRequest): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const baseURL = process.env.CHATWIT_BASE_URL;
		const globalAccessToken = process.env.CHATWIT_ACCESS_TOKEN;

		console.log(`[HookList API] Testando conexão com Chatwit...`);

		if (!baseURL) {
			return NextResponse.json({ error: "CHATWIT_BASE_URL não configurado" }, { status: 500 });
		}

		if (!globalAccessToken) {
			return NextResponse.json({ error: "CHATWIT_ACCESS_TOKEN não configurado" }, { status: 500 });
		}

		// Buscar usuários Chatwit para mapeamento
		const usuariosChatwit = await prisma.usuarioChatwit.findMany({
			where: {
				chatwitAccessToken: { not: null },
			},
			select: {
				id: true,
				name: true,
				accountName: true,
				chatwitAccountId: true,
				chatwitAccessToken: true,
				appUserId: true,
			},
		});

		console.log(`[HookList API] Encontrados ${usuariosChatwit.length} usuários Chatwit`);

		// Buscar informações dos usuários do app
		const appUsers = await prisma.user.findMany({
			where: {
				id: { in: usuariosChatwit.map((u) => u.appUserId) },
			},
			select: {
				id: true,
				name: true,
				email: true,
			},
		});

		const userMap = new Map(appUsers.map((u) => [u.id, u]));
		const allHooks: any[] = [];
		const errors: any[] = [];

		try {
			// Requisição simples: buscar contas
			console.log(`[HookList API] Fazendo requisição para: ${baseURL}/api/v1/accounts`);

			const accountsResponse = await axios.get(`${baseURL}/api/v1/accounts`, {
				headers: {
					api_access_token: globalAccessToken,
					"Content-Type": "application/json",
				},
				timeout: 10000,
			});

			const allAccounts = accountsResponse.data.payload || [];
			console.log(`[HookList API] Encontradas ${allAccounts.length} contas`);

			// Processar apenas a primeira conta para teste
			if (allAccounts.length > 0) {
				const account = allAccounts[0];
				console.log(`[HookList API] Processando conta: ${account.name} (ID: ${account.id})`);

				try {
					// Buscar apps da primeira conta
					const appsResponse = await axios.get(`${baseURL}/api/v1/accounts/${account.id}/integrations/apps`, {
						headers: {
							api_access_token: globalAccessToken,
							"Content-Type": "application/json",
						},
						timeout: 10000,
					});

					const apps = appsResponse.data.payload || [];
					console.log(`[HookList API] Encontrados ${apps.length} apps na conta ${account.name}`);

					// Processar apps
					for (const app of apps) {
						if (app.hooks && Array.isArray(app.hooks)) {
							console.log(`[HookList API] App ${app.id} tem ${app.hooks.length} hooks`);

							for (const hook of app.hooks) {
								const hookInboxId = hook.inbox?.id || hook.inbox_id;
								const hookInboxName = hook.inbox?.name || "N/A";

								// Verificar se o usuário local tem acesso a esta conta
								const usuarioLocal = usuariosChatwit.find((u) => u.chatwitAccountId === account.id.toString());

								allHooks.push({
									// Dados do usuário
									usuarioId: usuarioLocal?.id || "external",
									usuarioName: usuarioLocal?.name || account.name,
									usuarioEmail: usuarioLocal
										? userMap.get(usuarioLocal.appUserId)?.email || ""
										: "external@chatwit.com",
									accountId: account.id.toString(),
									accountName: account.name,

									// Dados da caixa
									inboxId: hookInboxId,
									inboxName: hookInboxName,
									inboxChannel: "N/A",

									// Dados do app
									appId: app.id,
									appName: app.name || app.id,

									// Dados do hook
									hookId: hook.id,
									hookStatus: hook.status,
									hookInboxId: hookInboxId,
									hookInboxName: hookInboxName,
									hookSettings: hook.settings,
									hookCreatedAt: hook.created_at,
									hookUpdatedAt: hook.updated_at,

									// Dados específicos do Dialogflow
									isDialogflow: app.id === "dialogflow",
									projectId: hook.settings?.project_id,
									region: hook.settings?.region,
									agentName: hook.settings?.agent_name,
									hasCredentials: !!hook.settings?.credentials,

									// Informações adicionais
									isLocalUser: !!usuarioLocal,
									isExternalUser: !usuarioLocal,

									// Timestamp da busca
									fetchedAt: new Date().toISOString(),
								});
							}
						}
					}
				} catch (accountError: any) {
					const errorInfo = {
						accountId: account.id,
						accountName: account.name,
						error: accountError.message,
						status: accountError.response?.status,
						data: accountError.response?.data,
					};

					errors.push(errorInfo);
					console.error(`[HookList API] Erro ao processar conta ${account.name}:`, accountError.message);
				}
			}
		} catch (error: any) {
			const errorInfo = {
				error: error.message,
				status: error.response?.status,
				data: error.response?.data,
			};

			errors.push(errorInfo);
			console.error(`[HookList API] Erro na requisição:`, error.message);
		}

		// Estatísticas
		const stats = {
			totalUsuarios: usuariosChatwit.length,
			totalContas: new Set(allHooks.map((h) => h.accountId)).size,
			totalCaixas: new Set(allHooks.map((h) => h.inboxId)).size,
			totalHooks: allHooks.length,
			hooksDialogflow: allHooks.filter((h) => h.isDialogflow).length,
			hooksAtivos: allHooks.filter((h) => h.hookStatus === true).length,
			hooksInativos: allHooks.filter((h) => h.hookStatus === false).length,
			hooksExternos: allHooks.filter((h) => h.isExternalUser).length,
			hooksLocais: allHooks.filter((h) => h.isLocalUser).length,
			totalErrors: errors.length,
		};

		console.log(`[HookList API] Resumo: ${stats.totalHooks} hooks encontrados, ${stats.totalErrors} erros`);

		return NextResponse.json({
			success: true,
			stats,
			hooks: allHooks,
			errors,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("[HookList API] Erro geral:", error);
		return NextResponse.json(
			{ error: "Erro interno do servidor", details: error instanceof Error ? error.message : "Erro desconhecido" },
			{ status: 500 },
		);
	}
}
