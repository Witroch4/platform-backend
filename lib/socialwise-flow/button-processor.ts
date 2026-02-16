/**
 * SocialWise Flow Button Processor
 * Centralized button detection, processing and response generation
 * Respects webhook-only pattern (no direct API calls)
 */

import { createLogger } from "@/lib/utils/logger";
import {
	getReactionByButtonId,
	formatReactionData,
	getIntentMappingByButtonId,
	ButtonReactionData,
} from "@/lib/button-reaction-queries";
import { METAPayloadBuilder } from "@/lib/socialwise-flow/meta-payload-builder";
import { getPrismaInstance } from "@/lib/connections";
import {
	buildInstagramByIntentRaw,
	buildInstagramByGlobalIntent,
	buildFacebookPageByIntentRaw,
	buildFacebookPageByGlobalIntent,
} from "@/lib/socialwise/templates";
import {
	applyCustomVariablesToComponents,
	resolveTemplateComponents,
	type TemplateComponentLogger,
} from "@/lib/socialwise-flow/template-component-utils";

const logger = createLogger("SocialWiseButtonProcessor");

export interface ButtonDetectionResult {
	isButtonClick: boolean;
	buttonId: string | null;
	buttonTitle: string | null;
	detectionSource: string;
}

export interface ButtonProcessingContext {
	channelType: string;
	userId: string | undefined;
	traceId: string;
	validPayload: any;
}

export interface ButtonReactionResponse {
	action_type: "button_reaction";
	buttonId: string;
	processed: boolean;
	mappingFound: boolean;
	emoji?: string;
	text?: string;
	action?: string; // "handoff", "end_conversation", etc.
	whatsapp?: {
		message_id: string;
		reaction_emoji?: string;
		response_text?: string;
	};
	instagram?: {
		message_id: string;
		reaction_emoji?: string;
		response_text?: string;
	};
	facebook?: {
		message_id: string;
		reaction_emoji?: string;
		response_text?: string;
	};
	error?: string;
	mapped?: {
		whatsapp?: any;
		instagram?: any;
		facebook?: any;
	};
}

/**
 * Detectar cliques de botão de forma robusta para múltiplos canais
 * Usa fallbacks dos campos padrão do context quando socialwise-chatwit não existe
 */
export function detectButtonClick(validPayload: any, channelType: string): ButtonDetectionResult {
	const ca = validPayload.context.message?.content_attributes || {};
	const context = validPayload.context;

	// Dados socialwise-chatwit (opcionais)
	const socialwiseData = context["socialwise-chatwit"];
	const swInteractive = socialwiseData?.message_data?.interactive_data || {};
	const swInstagram = socialwiseData?.message_data?.instagram_data || {};

	let isButtonClick = false;
	let buttonId: string | null = null;
	let buttonTitle: string | null = null;
	let detectionSource = "";

	// Meta Platforms (Instagram + Facebook): detectar postback_payload e quick_reply_payload
	if (channelType.toLowerCase().includes("instagram") || channelType.toLowerCase().includes("facebook")) {
		const interactionType = context?.interaction_type || swInstagram?.interaction_type;
		const platformName = channelType.toLowerCase().includes("instagram") ? "instagram" : "facebook";

		// Meta Postback (botões template)
		if (interactionType === "postback") {
			const postbackPayload = ca?.postback_payload || context?.postback_payload || swInstagram?.postback_payload;

			if (postbackPayload) {
				isButtonClick = true;
				buttonId = postbackPayload;
				buttonTitle = validPayload.message; // O texto do botão sempre está em message
				detectionSource = `${platformName}_postback`;
			}
		}

		// Meta Quick Reply (respostas rápidas)
		if (interactionType === "quick_reply") {
			const quickReplyPayload =
				ca?.quick_reply_payload || context?.quick_reply_payload || swInstagram?.quick_reply_payload;

			if (quickReplyPayload) {
				isButtonClick = true;
				buttonId = quickReplyPayload;
				buttonTitle = validPayload.message; // O texto do botão sempre está em message
				detectionSource = `${platformName}_quick_reply`;
			}
		}
	}

	// WhatsApp: detectar button_reply
	if (channelType.toLowerCase().includes("whatsapp")) {
		// Priority: content_attributes.button_reply > socialwise-chatwit
		const buttonReply = ca?.button_reply;
		const interactionType = ca?.interaction_type || context?.interaction_type;

		if (buttonReply?.id && interactionType === "button_reply") {
			isButtonClick = true;
			buttonId = buttonReply.id;
			buttonTitle = buttonReply.title || validPayload.message; // Fallback para message
			detectionSource = "whatsapp_button_reply";
		}
	}

	// Fallback detection para outros formatos ou legacy
	if (!isButtonClick) {
		// Tentar detectar pelos campos do context
		const fallbackButtonId =
			context?.button_id ||
			context?.postback_payload ||
			swInteractive?.button_id ||
			ca?.interactive_payload?.button_reply?.id;

		if (fallbackButtonId) {
			isButtonClick = true;
			buttonId = fallbackButtonId;
			buttonTitle =
				context?.button_title ||
				swInteractive?.button_title ||
				ca?.interactive_payload?.button_reply?.title ||
				validPayload.message; // Sempre usar message como fallback
			detectionSource = "fallback_detection";
		}
	}

	return {
		isButtonClick,
		buttonId,
		buttonTitle,
		detectionSource,
	};
}

/**
 * Processar clique de botão e retornar resposta estruturada
 */
export async function processButtonClick(
	buttonDetection: ButtonDetectionResult,
	context: ButtonProcessingContext,
	wamid: string,
): Promise<ButtonReactionResponse | null> {
	const { buttonId } = buttonDetection;
	const { channelType, userId, traceId, validPayload } = context;

	if (!buttonId) {
		throw new Error("ButtonId is required for processing");
	}

	logger.info("🚀 Processing button click", {
		buttonId,
		buttonTitle: buttonDetection.buttonTitle,
		channelType,
		detectionSource: buttonDetection.detectionSource,
		traceId,
	});

	try {
		// ⚡ MAPEAMENTO AUTOMÁTICO: @falar_atendente -> handoff nativo
		if (buttonId === "@falar_atendente") {
			logger.info("🚨 HANDOFF AUTOMÁTICO: @falar_atendente detectado", {
				buttonId,
				channelType,
				traceId,
			});

			return {
				action_type: "button_reaction",
				buttonId: buttonId,
				processed: true,
				mappingFound: true,
				action: "handoff",
			};
		}

		// Buscar reação usando button-reaction-queries
		const buttonReaction = await getReactionByButtonId(buttonId, userId || "");

		if (buttonReaction) {
			logger.info("✅ Button reaction found", {
				buttonId,
				reactionId: buttonReaction.id,
				actionType: buttonReaction.actionType,
				hasEmoji: !!buttonReaction.actionPayload.emoji,
				hasTextReaction: !!buttonReaction.actionPayload.textReaction,
				hasAction: !!buttonReaction.actionPayload.action,
				traceId,
			});

			// Base response com reações emoji/text/action
			const response = formatReactionData(buttonReaction, channelType, wamid) as ButtonReactionResponse;

			// Se houver ação send_*, anexar payload mapeado mantendo as reações
			const actionStr = (buttonReaction.actionPayload as any)?.action as string | undefined;
			const parsed = parseActionCommand(actionStr);
			if (parsed) {
				const mapped = await buildActionSendPayload(parsed, channelType, wamid, validPayload, traceId, buttonId);
				if (mapped) {
					response.mapped = { ...(response.mapped || {}), ...mapped };
					logger.info("📦 Built send payload from action (merged with reactions)", {
						kind: parsed.kind,
						id: parsed.id,
						channelType,
						traceId,
					});
				}
			}

			logger.info("🎯 Button reaction response prepared", {
				buttonId,
				hasEmoji: !!response.emoji,
				hasText: !!response.text,
				hasAction: !!response.action,
				actionType: response.action_type,
				traceId,
			});

			return response;
		} else {
			// Se não houver reação registrada, verificar se existe mapeamento direto de intenção
			if (userId) {
				// 🔒 CRÍTICO: Extrair inboxId do payload para isolar por caixa
				const webhookInboxId = extractExternalInboxId(validPayload);

				console.log("[SocialWiseButtonProcessor] 🔒 Extracting inboxId for isolation", {
					buttonId,
					webhookInboxId,
					userId,
					traceId,
				});

				const intentMapping = await getIntentMappingByButtonId(buttonId, userId, webhookInboxId || undefined);

				if (intentMapping) {
					logger.info("🧭 Intent mapping found for button", {
						buttonId,
						mappingId: intentMapping.id,
						actionType: intentMapping.actionType,
						inboxId: intentMapping.inboxId,
						mappedInboxId: intentMapping.inbox?.inboxId,
						webhookInboxId,
						traceId,
					});

					// Reaproveitar estrutura padrão de resposta e anexar payload mapeado
					const intentResponse = formatReactionData(intentMapping, channelType, wamid) as ButtonReactionResponse;

					const intentMappedPayload = await buildIntentMappingSendPayload(
						intentMapping,
						channelType,
						wamid,
						validPayload,
						traceId,
						buttonId,
					);

					if (intentMappedPayload) {
						intentResponse.mapped = {
							...(intentResponse.mapped || {}),
							...intentMappedPayload,
						};

						logger.info("📬 Intent mapping payload prepared", {
							buttonId,
							mappingId: intentMapping.id,
							hasWhatsApp: !!intentResponse.mapped?.whatsapp,
							hasInstagram: !!intentResponse.mapped?.instagram,
							hasFacebook: !!intentResponse.mapped?.facebook,
							traceId,
						});

						return intentResponse;
					}

					logger.warn("Intent mapping found but payload build failed, continuing to LLM processing", {
						buttonId,
						mappingId: intentMapping.id,
						traceId,
					});
				}
			}

			// Sem mapeamento: retorna null para permitir fallback para LLM
			logger.info("⚠️ No button reaction found, continuing to LLM processing", {
				buttonId,
				channelType,
				userId,
				traceId,
			});

			return null; // Permite fallback para SocialWise Flow Processor
		}
	} catch (error) {
		logger.error("❌ Error processing button click", {
			error: error instanceof Error ? error.message : String(error),
			buttonId,
			channelType,
			traceId,
		});

		// Fallback para erro
		return {
			action_type: "button_reaction",
			buttonId: buttonId,
			emoji: "👍",
			processed: true,
			mappingFound: false,
			error: "processing_failed",
		};
	}
}

/**
 * Parse action commands like: send_template:<id> or send_interactive:<id>
 */
function parseActionCommand(action?: string): { kind: "send_template" | "send_interactive"; id: string } | null {
	if (!action || typeof action !== "string") return null;
	const s = action.trim();
	if (s.startsWith("send_template:")) {
		return { kind: "send_template", id: s.slice("send_template:".length) };
	}
	if (s.startsWith("send_interactive:")) {
		return { kind: "send_interactive", id: s.slice("send_interactive:".length) };
	}
	return null;
}

/**
 * Build channel-specific payload for send_* actions
 */
async function buildActionSendPayload(
	parsed: { kind: "send_template" | "send_interactive"; id: string },
	channelType: string,
	wamid: string,
	validPayload: any,
	traceId: string,
	originalButtonId: string,
	customVariables?: Record<string, any>,
): Promise<{ whatsapp?: any; instagram?: any; facebook?: any } | null> {
	const inboxId = extractInboxIdFromPayload(validPayload);
	const externalInboxId = extractExternalInboxId(validPayload) || inboxId;
	if (!inboxId) {
		logger.warn("No inboxId resolved from payload; cannot build variables context", { traceId });
	}

	const lowerChannel = (channelType || "").toLowerCase();
	const normalizedIntent = normalizeButtonIntent(originalButtonId);
	const contactContext = {
		contactName:
			validPayload?.context?.contact?.name ||
			validPayload?.context?.contact_name ||
			validPayload?.context?.contact?.full_name,
		contactPhone:
			validPayload?.context?.contact?.phone_number ||
			validPayload?.context?.contact_phone ||
			validPayload?.context?.contact?.whatsapp,
	};

	if (normalizedIntent && externalInboxId && lowerChannel.includes("instagram")) {
		let mapped = await buildInstagramByIntentRaw(normalizedIntent, externalInboxId, contactContext);
		if (!mapped) {
			mapped = await buildInstagramByGlobalIntent(normalizedIntent, externalInboxId, contactContext);
		}
		if (mapped?.instagram) {
			return { instagram: mapped.instagram };
		}
	}

	if (normalizedIntent && externalInboxId && lowerChannel.includes("facebook")) {
		let mapped = await buildFacebookPageByIntentRaw(normalizedIntent, externalInboxId, contactContext);
		if (!mapped) {
			mapped = await buildFacebookPageByGlobalIntent(normalizedIntent, externalInboxId, contactContext);
		}
		if (mapped?.facebook) {
			return { facebook: mapped.facebook };
		}
	}

	try {
		const prisma = getPrismaInstance();
		// Try resolve template by id or metaTemplateId
		const template = await prisma.template.findFirst({
			where:
				parsed.kind === "send_template"
					? {
							OR: [{ id: parsed.id }, { whatsappOfficialInfo: { is: { metaTemplateId: parsed.id } } }],
						}
					: { id: parsed.id },
			include: {
				whatsappOfficialInfo: true,
				interactiveContent: {
					include: {
						header: true,
						body: true,
						footer: true,
						actionCtaUrl: true,
						actionReplyButton: true,
						actionList: true,
						actionFlow: true,
						actionLocationRequest: true,
					},
				},
			},
		});

		if (!template) {
			logger.warn("Template not found for action send", { parsed, traceId });
			return null;
		}

		if (template.whatsappOfficialInfo?.id) {
			const raw = await prisma.whatsAppOfficialInfo.findUnique({
				where: { id: template.whatsappOfficialInfo.id },
				select: { components: true },
			});
			if (raw?.components) {
				template.whatsappOfficialInfo.components = raw.components;
			}
		}

		const builder = new METAPayloadBuilder();

		// Extract webhook context for variable resolution
		// Payload structure: context.contact.name / context.contact.phone_number
		const webhookContext = {
			contactPhone:
				validPayload?.context?.contact?.phone_number ||
				validPayload?.context?.contact_phone ||
				validPayload?.context?.contact_source,
			contactName: validPayload?.context?.contact?.name || validPayload?.context?.contact_name,
			wamid: validPayload?.context?.wamid || validPayload?.context?.message?.source_id,
		};

		if (inboxId) {
			await builder.setVariablesFromInboxId(String(inboxId), webhookContext);
		}
		builder.setChannelType(channelType);

		const lower = (channelType || "").toLowerCase();

		if (lower.includes("whatsapp")) {
			// Build WhatsApp payloads
			if (parsed.kind === "send_template" && template.whatsappOfficialInfo) {
				const wi: any = template.whatsappOfficialInfo as any;
				const componentLogger: TemplateComponentLogger = {
					debug: (message, context) => {
						if (typeof logger.debug === "function") {
							logger.debug(message, { traceId, ...context });
						}
					},
					warn: (message, context) => {
						logger.warn(message, { traceId, ...context });
					},
				};

				componentLogger.debug?.("WhatsApp official template data", {
					templateId: template.id,
					hasComponents: !!wi?.components,
					componentKeys: wi?.components ? Object.keys(wi.components) : undefined,
					customVariablesProvided: !!customVariables,
				});

				const language: string = wi && typeof wi.language === "string" ? wi.language : "pt_BR";
				let components: any[] = resolveTemplateComponents(wi?.components, { logger: componentLogger });
				if (!components.length && wi?.components?.components) {
					components = resolveTemplateComponents(wi.components.components, { logger: componentLogger });
				}

				if (customVariables && components.length > 0) {
					components = applyCustomVariablesToComponents(
						components,
						customVariables,
						webhookContext.contactPhone || "",
						{ logger: componentLogger },
					);
				}

				const metaTemplateId: string | undefined =
					typeof wi?.metaTemplateId === "string" ? wi.metaTemplateId : undefined;
				const payload = await builder.buildTemplatePayload(
					template.name || "default",
					language,
					components,
					metaTemplateId,
				);
				return { whatsapp: payload } as any;
			}
			if (parsed.kind === "send_interactive" && template.interactiveContent) {
				const interactive = await builder.buildInteractiveMessagePayload(template.interactiveContent);
				return { whatsapp: { type: "interactive", interactive } } as any;
			}
		} else if (lower.includes("instagram") || lower.includes("facebook")) {
			// Build full Instagram/Facebook payload according to type
			if (parsed.kind === "send_interactive" && template.interactiveContent) {
				const ic: any = template.interactiveContent;
				const bodyText = String(ic?.body?.text || "");
				const explicit = String(ic?.interactiveType || "").toLowerCase();
				const rawButtons: any[] = Array.isArray(ic?.actionReplyButton?.buttons) ? ic.actionReplyButton.buttons : [];
				const hasImage = ic?.header?.type === "image" && !!ic?.header?.content;
				const hasGenericPayload =
					Array.isArray((ic as any)?.genericPayload?.elements) && (ic as any).genericPayload.elements.length > 0;
				const hasCarousel = hasGenericPayload || ic?.actionCarousel || explicit === "carousel";

				// Handle carousel type
				if (hasCarousel && (hasGenericPayload || ic?.actionCarousel?.elements)) {
					const rawElements = hasGenericPayload ? (ic as any).genericPayload.elements : ic.actionCarousel.elements;
					const elements = Array.isArray(rawElements) ? rawElements.slice(0, 10) : [];
					const carouselElements = elements.map((element: any) => {
						const mappedElement: any = {
							title: String(element.title || "").slice(0, 80),
						};

						if (element.subtitle) {
							mappedElement.subtitle = String(element.subtitle).slice(0, 80);
						}

						if (element.image_url) {
							mappedElement.image_url = String(element.image_url);
						}

						if (element.default_action?.url) {
							mappedElement.default_action = {
								type: "web_url",
								url: String(element.default_action.url),
							};
						}

						if (element.buttons && Array.isArray(element.buttons)) {
							mappedElement.buttons = element.buttons.slice(0, 3).map((btn: any) => {
								const title = String(btn.title || "").slice(0, 20);
								if ((btn?.type === "url" || btn?.type === "web_url") && btn?.url) {
									return { type: "web_url", title, url: btn.url };
								}
								return { type: "postback", title, payload: btn.id || btn.payload || title };
							});
						}

						return mappedElement;
					});

					const full = {
						message_format: "GENERIC_TEMPLATE",
						template_type: "generic",
						elements: carouselElements,
					};
					return lower.includes("instagram") ? { instagram: full } : { facebook: full };
				}

				// Detect IG type
				const hasQuickReplyShape = rawButtons.some((b: any) => String(b?.content_type || "").toLowerCase() === "text");
				let igType: "QUICK_REPLIES" | "BUTTON_TEMPLATE" | "GENERIC_TEMPLATE" = "BUTTON_TEMPLATE";
				if (explicit === "quick_replies") igType = "QUICK_REPLIES";
				else if (explicit === "generic") igType = "GENERIC_TEMPLATE";
				else if (hasQuickReplyShape) igType = "QUICK_REPLIES";
				else if (hasImage && rawButtons.length > 2) igType = "GENERIC_TEMPLATE";

				if (igType === "QUICK_REPLIES") {
					const quickReplies = rawButtons.slice(0, 13).map((b: any) => {
						const title = String(b?.title || b?.reply?.title || "").slice(0, 20);
						const payload = String(b?.payload || b?.id || b?.reply?.id || "")
							.replace(/\s+/g, "_")
							.toLowerCase();
						return {
							content_type: "text",
							title,
							payload: payload ? (payload.startsWith("@") ? payload : `@${payload}`) : "@opcao",
						};
					});
					const full = { message_format: "QUICK_REPLIES", text: bodyText, quick_replies: quickReplies };
					return lower.includes("instagram") ? { instagram: full } : { facebook: full };
				}

				// Map to Button Template-like shape
				const mappedButtons = rawButtons.slice(0, 3).map((b: any) => {
					const title = String(b?.title || b?.reply?.title || "").slice(0, 20);
					const id = b?.id || b?.reply?.id || b?.payload || title;
					if ((b?.type === "url" || b?.type === "web_url") && b?.url) {
						return { type: "web_url", title, url: b.url };
					}
					return { type: "postback", title, payload: id };
				});

				if (igType === "GENERIC_TEMPLATE") {
					const element: any = {
						title: bodyText.slice(0, 80),
					};

					// Add subtitle from footer if available
					if (ic?.footer?.text) {
						element.subtitle = String(ic.footer.text).slice(0, 80);
					}

					// Add image_url if available
					if (hasImage && ic?.header?.content) {
						element.image_url = ic.header.content;
					}

					// Add buttons
					element.buttons = mappedButtons;

					const full = {
						message_format: "GENERIC_TEMPLATE",
						template_type: "generic",
						elements: [element],
					};
					return lower.includes("instagram") ? { instagram: full } : { facebook: full };
				}

				const full = {
					message_format: "BUTTON_TEMPLATE",
					template_type: "button",
					text: bodyText,
					buttons: mappedButtons,
				};
				return lower.includes("instagram") ? { instagram: full } : { facebook: full };
			}
			if (parsed.kind === "send_template") {
				const info = { message_format: "TEMPLATE_INFO", name: template.name || "Template" };
				return lower.includes("instagram") ? { instagram: info } : { facebook: info };
			}
		}

		return null;
	} catch (e) {
		logger.error("Failed to build action payload", { error: e instanceof Error ? e.message : String(e), traceId });
		return null;
	}
}

/**
 * Build payload from intent mapping configuration
 */
async function buildIntentMappingSendPayload(
	intentMapping: ButtonReactionData,
	channelType: string,
	wamid: string,
	validPayload: any,
	traceId: string,
	originalButtonId: string,
): Promise<{ whatsapp?: any; instagram?: any; facebook?: any } | null> {
	const templateId = (intentMapping.actionPayload as any)?.templateId;
	const customVariables = (intentMapping.actionPayload as any)?.customVariables;

	if (!templateId || typeof templateId !== "string") {
		logger.warn("Intent mapping missing templateId", {
			mappingId: intentMapping.id,
			buttonId: intentMapping.buttonId,
			traceId,
		});
		return null;
	}

	const attempts: Array<{ kind: "send_template" | "send_interactive"; id: string }> = [
		{ kind: "send_interactive", id: templateId },
		{ kind: "send_template", id: templateId },
	];

	for (const attempt of attempts) {
		const mapped = await buildActionSendPayload(
			attempt,
			channelType,
			wamid,
			validPayload,
			traceId,
			originalButtonId,
			customVariables,
		);

		if (mapped) {
			return mapped;
		}
	}

	logger.warn("Failed to construct payload for intent mapping", {
		mappingId: intentMapping.id,
		templateId,
		buttonId: intentMapping.buttonId,
		traceId,
	});

	return null;
}

/**
 * Extract Chatwit inbox external id from payload
 */
function extractInboxIdFromPayload(validPayload: any): string | null {
	try {
		const context = validPayload?.context || {};
		const socialwise = context["socialwise-chatwit"] || {};
		const id = socialwise?.inbox_data?.id || context?.inbox?.id;
		return id ? String(id) : null;
	} catch {
		return null;
	}
}

function extractExternalInboxId(validPayload: any): string | null {
	try {
		const context = validPayload?.context || {};
		const socialwise = context["socialwise-chatwit"] || {};
		const external =
			context?.inbox_id ||
			context?.inbox?.inbox_id ||
			socialwise?.inbox_data?.inbox_id ||
			socialwise?.inbox_data?.external_id;
		const fallback = socialwise?.inbox_data?.id || context?.inbox?.id;
		const value = external ?? fallback;
		return value ? String(value) : null;
	} catch {
		return null;
	}
}

function normalizeButtonIntent(buttonId: string): string {
	let plain = String(buttonId || "").trim();
	if (!plain) return "";
	if (plain.toLowerCase().startsWith("intent:")) {
		plain = plain.slice("intent:".length).trim();
	}
	if (plain.startsWith("@")) {
		plain = plain.slice(1).trim();
	}
	return plain;
}

/**
 * Função principal: detectar e processar clique de botão
 */
export async function handleButtonInteraction(
	validPayload: any,
	channelType: string,
	userId: string | undefined,
	wamid: string,
	traceId: string,
): Promise<ButtonReactionResponse | null> {
	// Detectar clique de botão
	const buttonDetection = detectButtonClick(validPayload, channelType);

	if (!buttonDetection.isButtonClick || !buttonDetection.buttonId) {
		return null; // Não é um clique de botão
	}

	// Processar clique
	const context: ButtonProcessingContext = {
		channelType,
		userId,
		traceId,
		validPayload,
	};

	return await processButtonClick(buttonDetection, context, wamid);
}
