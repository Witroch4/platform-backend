// app/api/admin/mtf-diamante/disparo/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { z } from "zod";
import { sendTemplateMessage, sanitizeCoupon, formatE164, getWhatsAppConfig, getWhatsAppApiUrl } from "@/lib/whatsapp";

const disparoSchema = z.object({
	templateId: z.string().min(1, "Template é obrigatório"),
	selectedLeads: z.array(z.string()).min(1, "Selecione pelo menos um lead"),
	delayMinutes: z.number().min(0).default(0),
	parameters: z.record(z.any()).optional(),
});

export async function POST(request: Request) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
		}

		const appUserId = session.user.id;
		if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
			return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
		}

		const body = await request.json();
		const { templateId, selectedLeads, delayMinutes, parameters } = disparoSchema.parse(body);

		// Buscar o usuário Chatwit (opcional, pode não existir)
		const usuarioChatwit = await getPrismaInstance().usuarioChatwit.findFirst({
			where: { appUserId: appUserId },
			select: { id: true, name: true },
		});

		console.log(
			`[Disparo Debug] UsuarioChatwit encontrado:`,
			usuarioChatwit ? `${usuarioChatwit.id} (${usuarioChatwit.name})` : "NÃO ENCONTRADO",
		);

		// Debug: Verificar se o template existe (pode ser ID do Prisma ou metaTemplateId)
		console.log(`[Disparo Debug] Buscando template com ID: ${templateId}`);
		console.log(`[Disparo Debug] Usuário atual: ${session.user.id} (${session.user.email})`);

		// Primeiro, tentar buscar por ID direto do Prisma
		let templateExists = await getPrismaInstance().template.findFirst({
			where: { id: templateId },
			select: {
				id: true,
				name: true,
				status: true,
				createdById: true,
				scope: true,
			},
		});

		// Se não encontrar, buscar por metaTemplateId
		if (!templateExists) {
			templateExists = await getPrismaInstance().template.findFirst({
				where: {
					whatsappOfficialInfo: {
						metaTemplateId: templateId,
					},
				},
				select: {
					id: true,
					name: true,
					status: true,
					createdById: true,
					scope: true,
				},
			});
			console.log(`[Disparo Debug] Buscando por metaTemplateId: ${templateExists ? "ENCONTRADO" : "NÃO ENCONTRADO"}`);
		}

		console.log(`[Disparo Debug] Template existe?`, templateExists ? "SIM" : "NÃO");
		if (templateExists) {
			console.log(`[Disparo Debug] Template: ${templateExists.name} (ID: ${templateExists.id})`);
			console.log(`[Disparo Debug] Criado por: ${templateExists.createdById}, Escopo: ${templateExists.scope}`);
			console.log(`[Disparo Debug] IDs coincidem?`, templateExists.createdById === session.user.id ? "SIM" : "NÃO");
		}

		// Buscar template considerando escopo e permissões do usuário
		// Pode ser ID do Prisma ou metaTemplateId do WhatsApp
		const template = await getPrismaInstance().template.findFirst({
			where: {
				OR: [
					// Busca por ID direto do Prisma
					{
						id: templateId,
						OR: [
							{ createdById: session.user.id },
							{ scope: "GLOBAL" },
							...(session.user.role === "ADMIN" || session.user.role === "SUPERADMIN" ? [{}] : []),
						],
					},
					// Busca por metaTemplateId do WhatsApp
					{
						whatsappOfficialInfo: {
							metaTemplateId: templateId,
						},
						OR: [
							{ createdById: session.user.id },
							{ scope: "GLOBAL" },
							...(session.user.role === "ADMIN" || session.user.role === "SUPERADMIN" ? [{}] : []),
						],
					},
				],
			},
			select: {
				id: true,
				name: true,
				status: true,
				scope: true,
				createdById: true,
			},
		});

		if (!template) {
			return NextResponse.json(
				{
					error: `Template com ID/MetaID ${templateId} não encontrado ou sem acesso. ${templateExists ? `Template existe (ID: ${templateExists.id}, criado por: ${templateExists.createdById}, escopo: ${templateExists.scope || "PRIVATE"}) mas usuário não tem acesso.` : "Template não existe no banco de dados."}`,
				},
				{ status: 404 },
			);
		}

		console.log(
			`[Disparo Debug] Template encontrado: ${template.name} (ID: ${template.id}, escopo: ${template.scope}, criado por: ${template.createdById})`,
		);

		if (template.status !== "APPROVED") {
			return NextResponse.json({ error: `Template não está aprovado (Status: ${template.status})` }, { status: 400 });
		}

		// --- CORREÇÃO APLICADA AQUI ---
		// Mapear os números de telefone para uma busca mais flexível, evitando duplicação
		const leadConditions: Array<{ phone: { endsWith: string } } | { id: string }> = [];

		selectedLeads.forEach((leadIdentifier) => {
			const cleanNumber = leadIdentifier.replace(/\D/g, "");
			const isNumeric = /^\d+$/.test(leadIdentifier);

			if (isNumeric && cleanNumber.length >= 10) {
				// Se é um número, busca apenas por telefone
				leadConditions.push({
					phone: { endsWith: cleanNumber.slice(-11) },
				});
			} else {
				// Se não é um número, busca apenas por ID
				leadConditions.push({ id: leadIdentifier });
			}
		});

		const leadsRaw = await getPrismaInstance().lead.findMany({
			where: {
				AND: [
					{ userId: session.user.id }, // Garante que o lead é do usuário
					{ OR: leadConditions }, // Aplica as condições flexíveis de busca
				],
			},
			select: { id: true, name: true, phone: true },
			distinct: ["id"], // Garante que não haverá leads duplicados
		});

		// Remove duplicatas por número de telefone (mantém apenas o primeiro lead de cada número)
		const phoneNumbersSeen = new Set<string>();
		const leads = leadsRaw.filter((lead) => {
			if (!lead.phone) return false;
			const cleanPhone = lead.phone.replace(/\D/g, "");
			if (phoneNumbersSeen.has(cleanPhone)) {
				console.log(
					`[Disparo Debug] Lead duplicado ignorado: ${lead.id} (${lead.phone}) - já existe lead com este número`,
				);
				return false;
			}
			phoneNumbersSeen.add(cleanPhone);
			return true;
		});
		// --- FIM DA CORREÇÃO ---

		if (leads.length === 0) {
			return NextResponse.json({ error: "Nenhum lead válido encontrado na sua base de dados." }, { status: 404 });
		}

		// O restante do código de disparo continua igual
		const disparosData = leads.map((lead) => ({
			templateName: template.name,
			leadId: lead.id,
			status: "PENDING",
			scheduledAt: new Date(Date.now() + delayMinutes * 60 * 1000),
			parameters: parameters || ({} as any),
			userId: appUserId,
		}));

		await getPrismaInstance().disparoMtfDiamante.createMany({
			data: disparosData,
			skipDuplicates: true,
		});

		if (delayMinutes === 0) {
			const resultados = await Promise.allSettled(
				leads.map(async (lead) => {
					try {
						// Buscar o template completo com informações do WhatsApp para analisar variáveis
						const templateCompleto = await getPrismaInstance().template.findFirst({
							where: {
								OR: [
									// Busca por ID direto do Prisma
									{
										id: templateId,
										OR: [
											{ createdById: session.user.id },
											{ scope: "GLOBAL" },
											...(session.user.role === "ADMIN" || session.user.role === "SUPERADMIN" ? [{}] : []),
										],
									},
									// Busca por metaTemplateId do WhatsApp
									{
										whatsappOfficialInfo: {
											metaTemplateId: templateId,
										},
										OR: [
											{ createdById: session.user.id },
											{ scope: "GLOBAL" },
											...(session.user.role === "ADMIN" || session.user.role === "SUPERADMIN" ? [{}] : []),
										],
									},
								],
							},
							include: {
								whatsappOfficialInfo: true, // Incluir informações do WhatsApp
							},
						});

						// Preparar nome do lead
						const nomeDoLead = lead.name || "Cliente";

						// Debug: Verificar o que foi recebido
						console.log(`[Disparo] Lead selecionado: ${lead.name} (ID: ${lead.id}, telefone: ${lead.phone})`);
						console.log(`[Disparo] Parameters recebidos do frontend:`, JSON.stringify(parameters, null, 2));

						// Converter parameters para o formato esperado por sendTemplateMessage
						const sendOpts: any = {};

						// Auto-preencher variáveis com dados do lead
						let components: any[] = [];

						// Para templates do WhatsApp oficial, usar os componentes do WhatsAppOfficialInfo
						if (templateCompleto?.whatsappOfficialInfo?.components) {
							try {
								const rawComponents = templateCompleto.whatsappOfficialInfo.components;
								console.log(`[Disparo] Componentes brutos mudei pra ver se o arquivo é atualizado:`, rawComponents);

								if (Array.isArray(rawComponents)) {
									components = rawComponents;
								} else if (typeof rawComponents === "object" && rawComponents !== null) {
									// Converter objeto com chaves numéricas para array
									const keys = Object.keys(rawComponents).sort((a, b) => parseInt(a) - parseInt(b));
									components = keys.map((key) => (rawComponents as any)[key]);
									console.log(`[Disparo] Convertido objeto para array com ${components.length} componentes`);
								} else {
									components = JSON.parse(JSON.stringify(rawComponents));
								}

								console.log(`[Disparo] Usando componentes do WhatsApp oficial:`, components.length);
							} catch (error) {
								console.error("[Disparo] Erro ao processar componentes do WhatsApp oficial:", error);
							}
						}
						// Fallback para templates simples
						else if (templateCompleto?.simpleReplyText) {
							try {
								components = JSON.parse(templateCompleto.simpleReplyText) as any[];
								console.log(`[Disparo] Usando componentes do simpleReplyText:`, components.length);
							} catch (error) {
								console.error("[Disparo] Erro ao processar simpleReplyText:", error);
							}
						}

						// Processar componentes para encontrar variáveis
						if (components.length > 0) {
							console.log(
								`[Disparo] Componentes encontrados atualizado mudei pra ver se o arquivo é atualizado:`,
								JSON.stringify(components, null, 2),
							);

							const bodyComponent = components.find((c: any) => c.type === "BODY");
							console.log(`[Disparo] Body component:`, bodyComponent);

							if (bodyComponent?.text) {
								const numericPlaceholders = bodyComponent.text.match(/\{\{(\d+)\}\}/g) || [];
								const namedMatches: RegExpMatchArray[] = Array.from(
									bodyComponent.text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g),
								);
								const namedPlaceholders = namedMatches.map((m: RegExpMatchArray) => m[1] as string);

								console.log(
									`[Disparo] Placeholders encontrados:`,
									namedPlaceholders.length > 0 ? namedPlaceholders : numericPlaceholders,
								);

								// Se houver placeholders nomeados, tentar preencher por nome (parameters -> nomeDoLead -> example)
								if (namedPlaceholders.length > 0) {
									const vars: string[] = [];
									const examplesArr: Array<{ param_name?: string; example?: string }> =
										(bodyComponent.example?.body_text_named_params as any[]) || [];

									console.log(`[Disparo] Resolvendo ${namedPlaceholders.length} variáveis nomeadas...`);

									for (const varName of namedPlaceholders) {
										const provided = (parameters as any)?.[varName];
										const exampleVal = examplesArr.find((e) => e?.param_name === varName)?.example;

										console.log(`[Disparo] Variável "${varName}":`, {
											provided,
											exampleVal,
											nomeDoLead,
											nomeDoLeadIsProvided: typeof provided !== "undefined" && provided !== null && provided !== "",
											isNomeLeadVar: varName === "nome_lead",
										});

										// Mapear variáveis conhecidas do lead
										let resolvedValue: string;
										if (typeof provided !== "undefined" && provided !== null && provided !== "") {
											console.log(`[Disparo] ✅ Usando value fornecido: "${provided}"`);
											resolvedValue = String(provided);
										} else if (varName === "nome_lead") {
											// Variável específica: nome_lead deve ser o name do lead, não o example do template
											console.log(`[Disparo] ✅ É nome_lead, usando nomeDoLead: "${nomeDoLead}"`);
											resolvedValue = nomeDoLead;
										} else {
											// Para outras variáveis, usar example ou fallback para nomeDoLead
											console.log(`[Disparo] ✅ Usando example ou fallback: "${exampleVal || nomeDoLead}"`);
											resolvedValue = String(exampleVal || nomeDoLead);
										}

										vars.push(resolvedValue);
									}
									sendOpts.bodyVars = vars;
									console.log(
										`[Disparo] ✅ Preenchimento final BODY: [${vars.join(", ")}], ordem: [${namedPlaceholders.join(", ")}].`,
									);
								} else if (numericPlaceholders.length > 0) {
									// Placeholder numérico -> manter fallback antigo (nomeDoLead x N)
									const autoVars: string[] = [];
									for (let i = 0; i < numericPlaceholders.length; i++) {
										autoVars.push(nomeDoLead);
									}
									sendOpts.bodyVars = autoVars;
									console.log(
										`[Disparo] Auto-preenchendo ${numericPlaceholders.length} variáveis numéricas com: "${nomeDoLead}"`,
									);
								}
							}
						} else {
							console.log(`[Disparo] Nenhum componente encontrado para o template ${templateCompleto?.name}`);
						}

						// Processar parâmetros manuais (sobrescreve auto-preenchimento se fornecido)
						if (parameters && typeof parameters === "object" && Object.keys(parameters).length > 0) {
							// Se parameters é um objeto com chaves numéricas, converter para array
							const paramKeys = Object.keys(parameters).sort((a, b) => Number(a) - Number(b));
							if (paramKeys.length > 0 && paramKeys.every((key) => /^\d+$/.test(key))) {
								sendOpts.bodyVars = paramKeys.map((key) => (parameters as any)[key]);
								console.log(`[Disparo] Usando parâmetros manuais: [${sendOpts.bodyVars.join(", ")}]`);
							} else {
								// Se parameters tem outras propriedades, mapear adequadamente
								if (
									(parameters as any).bodyVars &&
									Array.isArray((parameters as any).bodyVars) &&
									(parameters as any).bodyVars.length > 0
								) {
									sendOpts.bodyVars = (parameters as any).bodyVars;
									console.log(`[Disparo] Usando bodyVars manuais: [${sendOpts.bodyVars.join(", ")}]`);
								}
								if ((parameters as any).headerVar) sendOpts.headerVar = (parameters as any).headerVar;
								if ((parameters as any).headerMedia) sendOpts.headerMedia = (parameters as any).headerMedia;
								if ((parameters as any).buttonOverrides) sendOpts.buttonOverrides = (parameters as any).buttonOverrides;
								if ((parameters as any).couponCode) sendOpts.couponCode = (parameters as any).couponCode;
							}
						}
						console.log(
							`[Disparo] Enviando template: nome="${template.name}", telefone="${lead.phone}", opts:`,
							sendOpts,
						);

						// Construir payload correto para WhatsApp baseado nos componentes
						const whatsappComponents: any[] = [];

						// Processar cada componente
						for (const component of components) {
							// Ignorar entradas inválidas (strings, null, undefined, números)
							if (!component || typeof component !== "object") continue;
							if (typeof (component as any) === "string") continue;

							switch (component.type) {
								case "HEADER":
									if (component.format === "IMAGE") {
										// Buscar a URL pública da imagem no array de componentes
										const imageUrl = (components as any).find(
											(c: any) => typeof c === "string" && c.startsWith("https://"),
										);
										if (imageUrl) {
											whatsappComponents.push({
												type: "header",
												parameters: [
													{
														type: "image",
														image: {
															link: imageUrl,
														},
													},
												],
											});
											console.log(`[Disparo] Adicionado header com imagem: ${imageUrl}`);
										}
									} else if (component.format === "TEXT" && typeof component.text === "string") {
										// Enviar parâmetro de texto para HEADER somente se houver placeholder no header
										const hasPlaceholder = /\{\{[^}]+\}\}/.test(component.text);
										if (hasPlaceholder) {
											// Suporte a variável nomeada no header (parameter_name)
											const headerNameMatch = component.text.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/);
											const headerParamName = headerNameMatch?.[1];
											let headerValue = (parameters as any)?.headerVar;
											if (
												!headerValue &&
												headerParamName &&
												typeof (parameters as any)?.[headerParamName] !== "undefined"
											) {
												headerValue = (parameters as any)[headerParamName];
											}
											if (!headerValue) {
												const headerExample = component.example?.header_text_named_params?.[0]?.example;
												headerValue = headerExample || nomeDoLead;
											}
											if (headerValue) {
												const headerParam: any = { type: "text", text: String(headerValue) };
												if (headerParamName) headerParam.parameter_name = headerParamName;
												whatsappComponents.push({
													type: "header",
													parameters: [headerParam],
												});
												console.log("[Disparo] Adicionado header TEXT com variável (named compatível)");
											}
										}
									}
									break;
								case "BODY":
									// Para templates sem variáveis, não precisa enviar parâmetros
									if (sendOpts.bodyVars && sendOpts.bodyVars.length > 0) {
										// Detectar placeholders nomeados no BODY para enviar parameter_name
										const namedMatches: RegExpMatchArray[] = Array.from(
											(component.text || "").matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g),
										);
										const namedPlaceholders = namedMatches.map((m) => m[1] as string);

										const parameters = sendOpts.bodyVars.map((value: string, index: number) => {
											const param: any = { type: "text", text: value };
											if (namedPlaceholders.length > 0 && namedPlaceholders[index]) {
												param.parameter_name = namedPlaceholders[index];
											}
											return param;
										});

										whatsappComponents.push({
											type: "body",
											parameters,
										});
										console.log(
											`[Disparo] Adicionado body com ${sendOpts.bodyVars.length} variáveis${namedPlaceholders.length > 0 ? " (named)" : ""}`,
										);
									}
									break;
								case "BUTTONS":
									// Processar botões que precisam de parâmetros
									if (component.buttons && Array.isArray(component.buttons)) {
										component.buttons.forEach((button: any, index: number) => {
											if (button.type === "COPY_CODE") {
												const fallback = Array.isArray(button.example) ? button.example[0] : "";
												const chosenCoupon = (parameters as any)?.couponCode || fallback;
												if (chosenCoupon) {
													whatsappComponents.push({
														type: "button",
														sub_type: "copy_code",
														index: String(index),
														parameters: [
															{
																type: "coupon_code",
																coupon_code: sanitizeCoupon(String(chosenCoupon)),
															},
														],
													});
													console.log(
														`[Disparo] Adicionado botão COPY_CODE (índice ${index}) com código: ${chosenCoupon} (fallback: ${fallback ? "sim" : "não"})`,
													);
												}
											}
										});
									}
									break;
								// FOOTER não precisa de parâmetros para templates aprovados
							}
						}

						console.log(`[Disparo] Componentes WhatsApp construídos:`, JSON.stringify(whatsappComponents, null, 2));

						// Usar sendTemplateMessage com componentes corretos
						const customOpts = {
							...sendOpts,
							whatsappComponents,
						};

						// LOG: Payload exato e URL antes do envio (debug local na rota)
						try {
							const cfg = await getWhatsAppConfig(session.user.id);
							const apiUrl = getWhatsAppApiUrl(cfg);
							const toSanitized = formatE164(lead.phone || "");
							const previewPayload = {
								messaging_product: "whatsapp",
								recipient_type: "individual",
								to: toSanitized,
								type: "template",
								template: {
									name: template.name,
									language: { code: "pt_BR" }, // mesma default do sender
									components: customOpts.whatsappComponents,
								},
							};
							const maskedToken = (cfg.whatsappToken || "").length
								? `${(cfg.whatsappToken as string).slice(0, 8)}...(${(cfg.whatsappToken as string).length})`
								: "N/A";
							console.log("[Disparo] Preview Payload mudei pra ver se o arquivo é atualizado", {
								url: apiUrl,
								headers: {
									Authorization: `Bearer ${maskedToken}`,
									"Content-Type": "application/json",
								},
								toRaw: lead.phone,
								toFormatE164: toSanitized,
								payload: JSON.parse(JSON.stringify(previewPayload)),
							});
						} catch (e) {
							console.warn("[Disparo] Preview Payload - Falha ao montar preview:", e);
						}

						const success = await sendTemplateMessage(lead.phone || "", template.name, customOpts);

						console.log(`[Disparo] Resultado do envio: ${success ? "SUCESSO" : "FALHA"}`);
						await getPrismaInstance().disparoMtfDiamante.updateMany({
							where: {
								leadId: lead.id,
								templateName: template.name,
								status: "PENDING",
							},
							data: {
								status: success ? "SENT" : "FAILED",
								sentAt: new Date(),
								errorMessage: success ? null : ("Falha no envio" as any),
							},
						});
						return { success };
					} catch (error) {
						await getPrismaInstance().disparoMtfDiamante.updateMany({
							where: {
								leadId: lead.id,
								templateName: template.name,
								status: "PENDING",
							},
							data: {
								status: "FAILED",
								errorMessage: error instanceof Error ? error.message : ("Erro desconhecido" as any),
							},
						});
						return { success: false };
					}
				}),
			);
			const sucessos = resultados.filter((r) => r.status === "fulfilled" && r.value.success).length;
			return NextResponse.json({
				success: true,
				message: `Disparo concluído: ${sucessos} sucessos, ${leads.length - sucessos} falhas.`,
			});
		} else {
			return NextResponse.json({
				success: true,
				message: `Disparo agendado para ${delayMinutes} minutos.`,
			});
		}
	} catch (error) {
		console.error("[API /disparo] ERRO FATAL:", error);
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: "Dados inválidos", details: error.errors }, { status: 400 });
		}
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

// A função GET não precisa de alteraçõ

export async function GET(request: Request) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
		}

		if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
			return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
		}

		const { searchParams } = new URL(request.url);
		const page = Number.parseInt(searchParams.get("page") || "1");
		const limit = Number.parseInt(searchParams.get("limit") || "10");
		const status = searchParams.get("status");

		const whereClause: any = {
			userId: session.user.id,
		};

		if (status) {
			whereClause.status = status;
		}

		const [disparos, total] = await Promise.all([
			getPrismaInstance().disparoMtfDiamante.findMany({
				where: whereClause,
				orderBy: {
					createdAt: "desc",
				},
				skip: (page - 1) * limit,
				take: limit,
			}),
			getPrismaInstance().disparoMtfDiamante.count({
				where: whereClause,
			}),
		]);

		const totalPages = Math.ceil(total / limit);

		return NextResponse.json({
			success: true,
			data: {
				disparos,
				pagination: {
					page,
					limit,
					total,
					totalPages,
					hasNext: page < totalPages,
					hasPrev: page > 1,
				},
			},
		});
	} catch (error) {
		console.error("Erro ao buscar disparos:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
