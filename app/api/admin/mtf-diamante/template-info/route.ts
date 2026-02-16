// app/api/admin/mtf-diamante/template-info/route.ts
import { NextResponse, NextRequest } from "next/server";
import axios from "axios";
import { auth } from "@/auth";
import { mtfDiamanteConfig } from "@/app/config/mtf-diamante";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();
import { downloadMetaMediaAndUploadToMinio, isMetaMediaUrl } from "@/lib/whatsapp-media";

// Disable Next.js cache for this endpoint - always fetch fresh data
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Função auxiliar para obter as configurações da API do WhatsApp.
 * Tenta carregar do banco de dados primeiro, depois das variáveis de ambiente.
 *  - FB_GRAPH_API_BASE (ex.: https://graph.facebook.com/v22.0)
 *  - WHATSAPP_BUSINESS_ID (deve ser o ID da conta do WhatsApp, WABA)
 *  - WHATSAPP_TOKEN (Token do System User com as permissões necessárias)
 */
async function getWhatsAppApiConfig(userId?: string) {
	// Tentar carregar do banco de dados primeiro
	if (userId) {
		try {
			const usuarioChatwit = await prisma.usuarioChatwit.findUnique({
				where: { appUserId: userId },
			});

			if (usuarioChatwit) {
				const dbConfig = await prisma.whatsAppGlobalConfig.findFirst({
					where: {
						usuarioChatwitId: usuarioChatwit.id,
					},
				});

				if (dbConfig && dbConfig.whatsappApiKey) {
					console.log("[TemplateInfo] ✅ Usando configuração do banco de dados (salva no painel) para WhatsApp");
					console.log(`[TemplateInfo] Conta Business ID: ${dbConfig.whatsappBusinessAccountId}`);
					return {
						fbGraphApiBase: dbConfig.graphApiBaseUrl || "https://graph.facebook.com/v22.0",
						whatsappBusinessAccountId: dbConfig.whatsappBusinessAccountId,
						whatsappToken: dbConfig.whatsappApiKey,
					};
				}
			}
		} catch (error) {
			console.error("[TemplateInfo] Erro ao buscar config do banco:", error);
			// Continuar com variáveis de ambiente como fallback
		}
	}

	// Fallback para variáveis de ambiente
	console.log("[TemplateInfo] ⚠️ Usando configuração das variáveis de ambiente (.env)");
	const envConfig = {
		fbGraphApiBase: process.env.FB_GRAPH_API_BASE || "https://graph.facebook.com/v22.0",
		whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || "294585820394901",
		whatsappToken: process.env.WHATSAPP_TOKEN || mtfDiamanteConfig.whatsappToken || "",
	};
	console.log(`[TemplateInfo] Conta Business ID: ${envConfig.whatsappBusinessAccountId}`);
	return envConfig;
}

/**
 * Função para obter detalhes do template diretamente da API do WhatsApp
 * e sincronizá‑lo no banco de dados.
 * @param templateId ID do template
 * @param userId ID do usuário
 * @param forceRefresh Se true, força o download da mídia mesmo se já existir no MinIO
 */
async function getWhatsAppTemplateDetailsFromAPI(templateId: string, userId: string, forceRefresh = false) {
	const config = await getWhatsAppApiConfig(userId);

	// Buscar o template específico diretamente pela sua ID
	console.log(`[TemplateInfo] Buscando template específico: ${templateId}`);
	const directUrl = `${config.fbGraphApiBase}/${templateId}?fields=id,name,status,category,language,components,sub_category,quality_score,correct_category,cta_url_link_tracking_opted_out,library_template_name,message_send_ttl_seconds,parameter_format,previous_category`;

	console.log(`[TemplateInfo] URL requisitada: ${directUrl.replace(config.whatsappToken || "***", "***")}`);

	let response;
	let lastError: any;

	// Retry logic: tenta até 3 vezes em caso de erro 400/500
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			response = await axios.get(directUrl, {
				headers: {
					Authorization: `Bearer ${config.whatsappToken}`,
					"Content-Type": "application/json",
				},
				timeout: 15000, // 15s timeout
			});
			break; // Success, exit retry loop
		} catch (error: any) {
			lastError = error;
			const status = error.response?.status;

			// Não retry em erros de autenticação ou permissão
			if ([401, 403, 404].includes(status)) {
				throw error;
			}

			// Retry em erros temporários
			if ([400, 408, 429, 500, 502, 503, 504].includes(status) && attempt < 3) {
				const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // exponential backoff
				console.log(
					`[TemplateInfo] Tentativa ${attempt} falhou com status ${status}. Aguardando ${waitTime}ms antes de retry...`,
				);
				await new Promise((resolve) => setTimeout(resolve, waitTime));
				continue;
			}

			// Erros que não devem retry
			throw error;
		}
	}

	// Se todas as tentativas falharam
	if (!response) {
		throw lastError || new Error("Falha ao buscar template após 3 tentativas");
	}

	if (!response.data || !response.data.id) {
		throw new Error("Template não retornou dados válidos");
	}

	const templateFromApi = response.data;
	console.log(`[TemplateInfo] Template encontrado diretamente: ${templateFromApi.name}`);
	templateFromApi.id = templateFromApi.id || templateId; // Garantir que id existe

	// --- LÓGICA OTIMIZADA DE SINCRONIZAÇÃO DE MÍDIA ---
	let publicMediaUrl: string | null = null;

	// Primeiro, verificar se já existe uma URL pública no banco de dados
	const existingTemplate = await prisma.template.findFirst({
		where: {
			whatsappOfficialInfo: {
				metaTemplateId: templateId,
			},
			createdById: userId,
		},
		include: {
			whatsappOfficialInfo: true,
		},
	});

	const headerComponent = templateFromApi.components?.find(
		(c: any) => c.type === "HEADER" && ["IMAGE", "VIDEO", "DOCUMENT"].includes(c.format),
	);

	if (headerComponent) {
		console.log(
			`[TemplateInfo] Header component encontrado para template ${templateFromApi.name}:`,
			JSON.stringify(headerComponent, null, 2),
		);

		// Tentar múltiplas localizações para a URL da mídia
		const mediaUrlFromMeta =
			headerComponent.example?.header_handle?.[0] ||
			headerComponent.example?.header_url?.[0] ||
			headerComponent.url ||
			headerComponent.example?.url ||
			null;

		console.log(`[TemplateInfo] URL de mídia extraída: ${mediaUrlFromMeta}`);

		// Verificar se existe URL pública válida no banco
		const existingPublicUrl =
			existingTemplate?.whatsappOfficialInfo?.components &&
			typeof existingTemplate.whatsappOfficialInfo.components === "object" &&
			"publicMediaUrl" in existingTemplate.whatsappOfficialInfo.components
				? (existingTemplate.whatsappOfficialInfo.components.publicMediaUrl as string | null)
				: null;

		// Se já existe uma URL pública válida no MinIO E não está sendo forçada atualização, usar ela
		if (existingPublicUrl && !isMetaMediaUrl(existingPublicUrl) && !forceRefresh) {
			publicMediaUrl = existingPublicUrl;
			console.log(`[TemplateInfo] Usando mídia já armazenada no MinIO: ${publicMediaUrl}`);
		}
		// Se forceRefresh OU (a URL é null OU é da Meta), tentar baixar e fazer upload
		else if (
			mediaUrlFromMeta &&
			isMetaMediaUrl(mediaUrlFromMeta) &&
			(forceRefresh || !existingPublicUrl || isMetaMediaUrl(existingPublicUrl))
		) {
			try {
				console.log(
					`[TemplateInfo] ${forceRefresh ? "Refresh forçado," : existingPublicUrl === null ? "URL null detectada, tentando" : "URL da Meta detectada,"} fazer download e upload para MinIO...`,
				);
				publicMediaUrl = await downloadMetaMediaAndUploadToMinio(
					mediaUrlFromMeta,
					templateId,
					templateFromApi.name,
					userId,
				);
				console.log(`[TemplateInfo] Mídia sincronizada para o MinIO: ${publicMediaUrl}`);
			} catch (e) {
				console.error("[TemplateInfo] Falha ao sincronizar mídia para o MinIO:", e);
				// Se falhar, manter a URL existente se houver e não for null
				if (existingPublicUrl) {
					publicMediaUrl = existingPublicUrl;
				}
			}
		}
		// Se não há URL da Meta mas existe URL externa válida, usar ela
		else if (mediaUrlFromMeta && !isMetaMediaUrl(mediaUrlFromMeta)) {
			publicMediaUrl = mediaUrlFromMeta;
			console.log(`[TemplateInfo] Usando mídia externa: ${publicMediaUrl}`);
		}
		// Se não há mediaUrlFromMeta, verificar se há URL salva (mesmo que null)
		else if (!mediaUrlFromMeta) {
			console.log(
				`[TemplateInfo] ⚠️ Nenhum header_handle encontrado no componente HEADER do template ${templateFromApi.name}`,
			);
			publicMediaUrl = existingPublicUrl;
		}
	}
	// --- FIM DA LÓGICA OTIMIZADA ---

	try {
		// Atualizar ou criar o template no banco de dados
		const componentsWithMedia = {
			...templateFromApi.components,
			publicMediaUrl: publicMediaUrl,
		};

		if (existingTemplate) {
			// Atualizar template existente
			await prisma.template.update({
				where: { id: existingTemplate.id },
				data: {
					name: templateFromApi.name,
					status: templateFromApi.status as any,
					language: templateFromApi.language || "pt_BR",
					whatsappOfficialInfo: {
						update: {
							status: templateFromApi.status,
							category: templateFromApi.category,
							components: componentsWithMedia,
						},
					},
				},
			});
		} else {
			// Criar novo template
			await prisma.template.create({
				data: {
					name: templateFromApi.name,
					status: templateFromApi.status as any,
					language: templateFromApi.language || "pt_BR",
					type: "WHATSAPP_OFFICIAL" as any,
					scope: "PRIVATE" as any,
					createdById: userId,
					whatsappOfficialInfo: {
						create: {
							metaTemplateId: templateId,
							status: templateFromApi.status,
							category: templateFromApi.category,
							components: componentsWithMedia,
						},
					},
				},
			});
		}

		console.log(`Template ${templateFromApi.name} sincronizado no banco de dados.`);
	} catch (dbError) {
		console.error("Erro ao salvar template no banco:", dbError);
	}

	templateFromApi.publicMediaUrl = publicMediaUrl;
	return templateFromApi;
}

/**
 * Endpoint GET /api/admin/mtf-diamante/template-info
 * Recebe o parâmetro de query "template" (ID do template) e retorna os detalhes.
 * Apenas usuários autenticados com role ADMIN têm acesso.
 *
 * Query params opcionais:
 * - forceRefresh: true para forçar atualização da mídia mesmo se já existir no MinIO
 */
export async function GET(req: Request) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}
		if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
			return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
		}
		const url = new URL(req.url);
		const templateId = url.searchParams.get("templateId") || url.searchParams.get("template");
		const forceRefresh = url.searchParams.get("forceRefresh") === "true";

		if (!templateId) {
			return NextResponse.json({ error: "ID do template não fornecido" }, { status: 400 });
		}

		// Primeiro, tentar buscar do banco de dados local
		const localTemplate = await prisma.template.findUnique({
			where: { id: templateId },
			include: {
				whatsappOfficialInfo: true,
			},
		});

		if (localTemplate && !forceRefresh) {
			return NextResponse.json({
				success: true,
				...localTemplate,
				template: localTemplate, // Para compatibilidade
			});
		}

		// Se não encontrar localmente OU se forceRefresh, buscar da API
		const template = await getWhatsAppTemplateDetailsFromAPI(templateId, session.user.id, forceRefresh);
		if (!template) {
			return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
		}
		return NextResponse.json({
			success: true,
			template: {
				...template,
				publicMediaUrl: template.publicMediaUrl,
			},
		});
	} catch (error: any) {
		console.error("Erro ao buscar informações do template:", error);
		console.error("[TemplateInfo] Error details:", {
			status: error.response?.status,
			statusText: error.response?.statusText,
			data: error.response?.data,
			message: error.message,
		});

		// Retornar erro específico da API do WhatsApp
		if (error.response?.status === 400) {
			return NextResponse.json(
				{
					error:
						"Falha ao buscar template da API do WhatsApp (400 Bad Request). O ID do template pode estar inválido ou as credenciais podem estar expiradas.",
					details: error.response?.data?.error || error.message,
				},
				{ status: 400 },
			);
		}

		if (error.response?.status === 401) {
			return NextResponse.json(
				{
					error: "Token do WhatsApp expirado ou inválido. Reautentique seu WhatsApp Business Account.",
					details: error.response?.data?.error || error.message,
				},
				{ status: 401 },
			);
		}

		if (error.response?.status === 403) {
			return NextResponse.json(
				{
					error: "Token do WhatsApp sem permissão. Verifique se o token tem as permissões necessárias.",
					details: error.response?.data?.error || error.message,
				},
				{ status: 403 },
			);
		}

		if (error.response?.status === 429) {
			return NextResponse.json(
				{
					error: "Limite de requisições da API do WhatsApp atingido. Tente novamente em alguns minutos.",
					details: error.response?.data?.error || error.message,
				},
				{ status: 429 },
			);
		}

		return NextResponse.json(
			{
				error: error.message || "Erro ao buscar informações do template",
				details: error.response?.data?.error,
			},
			{ status: error.response?.status || 500 },
		);
	}
}
