import type {
	InteractiveMessageElement,
	InteractiveMessageElementType,
	InteractiveMessageNodeData,
} from "@/types/flow-builder";

/**
 * Prefixo para botões do Flow Builder.
 * Usado para identificar botões que fazem parte de um flow visual
 * e devem ser processados pelo FlowOrchestrator em vez do button-processor legado.
 */
export const FLOW_BUTTON_PREFIX = "flow_";
export const FLOW_PAYMENT_PREFIX = "flow_payment_";

function safeId(prefix: string) {
	// Botões do Flow Builder recebem prefixo 'flow_' para priorização no webhook
	// Payment anchor buttons get 'flow_payment_' prefix for auto-resume routing
	const finalPrefix =
		prefix === "button" ? `${FLOW_BUTTON_PREFIX}${prefix}` :
		prefix === "payment" ? `${FLOW_BUTTON_PREFIX}${prefix}` :
		prefix;
	return `${finalPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Gera ID único para elemento do Flow Builder.
 * Garante prefixo 'flow_button_' para botões (necessário para roteamento no webhook).
 * Usar ao duplicar nós/elementos para evitar buttonIds duplicados no flow.
 */
export function generateElementId(type: string): string {
	return safeId(type);
}

export function createInteractiveMessageElement(type: InteractiveMessageElementType, options?: { isPaymentAnchor?: boolean }): InteractiveMessageElement {
	switch (type) {
		case "header_text":
			return { id: safeId("header_text"), type: "header_text", text: "" };
		case "header_image":
			return { id: safeId("header_image"), type: "header_image", url: "", caption: "" };
		case "body":
			return { id: safeId("body"), type: "body", text: "" };
		case "footer":
			return { id: safeId("footer"), type: "footer", text: "" };
		case "button":
			if (options?.isPaymentAnchor) {
				return { id: safeId("payment"), type: "button", title: "Payment Flow", isPaymentAnchor: true };
			}
			return { id: safeId("button"), type: "button", title: "Novo botão", description: "" };
		case "button_copy_code":
			return { id: safeId("button_copy_code"), type: "button_copy_code", title: "Copiar código", couponCode: "" };
		case "button_phone":
			return { id: safeId("button_phone"), type: "button_phone", title: "Ligar", phoneNumber: "" };
		case "button_voice_call":
			return { id: safeId("button_voice_call"), type: "button_voice_call", title: "Ligar WhatsApp", ttlMinutes: 10080 };
		case "button_url":
			return { id: safeId("button_url"), type: "button_url", title: "Acessar", url: "" };
	}
}

export function elementsToLegacyFields(elements: InteractiveMessageElement[]): {
	header?:
		| string
		| {
				type: "IMAGE" | "VIDEO" | "DOCUMENT";
				mediaUrl?: string;
				mediaHandle?: string;
				content?: string;
			};
	body?: string;
	footer?: string;
	buttons?: Array<{ id: string; title: string; description?: string }>;
	ctaUrl?: { title: string; url: string };
} {
	const headerText = elements.find((e) => e.type === "header_text");
	const headerImage = elements.find((e) => e.type === "header_image");
	const body = elements.find((e) => e.type === "body");
	const footer = elements.find((e) => e.type === "footer");
	const buttons = elements
		.filter((e) => e.type === "button")
		.map((e) => ({
			id: e.id,
			title: e.title,
			description: e.description || undefined,
		}));

	// CTA URL button (WhatsApp cta_url interactive message)
	const ctaUrlElement = elements.find((e) => e.type === "button_url");
	const ctaUrl =
		ctaUrlElement && "url" in ctaUrlElement && "title" in ctaUrlElement
			? { title: ctaUrlElement.title, url: ctaUrlElement.url }
			: undefined;

	return {
		header:
			headerText && "text" in headerText
				? headerText.text || undefined
				: headerImage && "url" in headerImage && (headerImage.url || headerImage.mediaHandle)
					? {
						type: "IMAGE",
						mediaUrl: headerImage.url || undefined,
						mediaHandle: headerImage.mediaHandle || undefined,
						content: headerImage.url || undefined,
					}
					: undefined,
		body: body && "text" in body ? body.text || undefined : undefined,
		footer: footer && "text" in footer ? footer.text || undefined : undefined,
		buttons: buttons.length ? buttons : undefined,
		ctaUrl,
	};
}

/**
 * Tipo genérico para dados de nó que podem conter elements.
 * Usado para templates e mensagens interativas compartilharem o mesmo sistema de elementos.
 */
type NodeDataWithElements = {
	elements?: InteractiveMessageElement[];
	message?: InteractiveMessageNodeData["message"];
	header?: string | {
		type?: string;
		content?: string;
		text?: string;
		mediaUrl?: string;
		mediaHandle?: string;
		variables?: string[];
	};
	body?: string | { text?: string; variables?: string[] };
	footer?: string | { text?: string };
	buttons?: Array<{ id: string; title: string; description?: string; text?: string; url?: string }>;
	// Campos específicos de templates
	couponCode?: string;
	buttonText?: string;
	phoneNumber?: string;
};

export function getInteractiveMessageElements(
	data: NodeDataWithElements | InteractiveMessageNodeData | Record<string, unknown>,
): InteractiveMessageElement[] {
	// Type-safe access
	const d = data as NodeDataWithElements;

	if (Array.isArray(d.elements) && d.elements.length > 0) return d.elements;

	// 1) From linked message
	if (d.message) {
		const elements: InteractiveMessageElement[] = [];

		// FIX: Suportar diferentes formatos de header (text, image, video, document)
		const header = d.message.header as
			| { type?: string; text?: string; content?: string; media_url?: string; url?: string }
			| undefined;
		const bodyText = (d.message.body as { text?: string } | undefined)?.text;
		const footerText = (d.message.footer as { text?: string } | undefined)?.text;

		// Header pode ser texto ou mídia (imagem/video/documento)
		if (header?.type === "text") {
			const headerText = header.text || header.content || "";
			if (headerText) elements.push({ id: safeId("header_text"), type: "header_text", text: headerText });
		} else if (header?.type && ["image", "video", "document"].includes(header.type)) {
			const mediaUrl = header.media_url || header.content || header.url || "";
			if (mediaUrl) elements.push({ id: safeId("header_image"), type: "header_image", url: mediaUrl, caption: header.text || "" });
		}

		if (bodyText) elements.push({ id: safeId("body"), type: "body", text: bodyText });
		if (footerText) elements.push({ id: safeId("footer"), type: "footer", text: footerText });

		const action = d.message.action as
			| {
					buttons?: Array<{ id?: string; title?: string; description?: string; reply?: { id: string; title: string } }>;
					sections?: Array<{ rows?: Array<{ id: string; title: string; description?: string }> }>;
			  }
			| undefined;

		// Processar botões (podem ter formato direto ou com reply)
		// SEMPRE regenerar IDs com prefixo flow_ para garantir roteamento correto no webhook
		if (action?.buttons?.length) {
			for (const btn of action.buttons) {
				elements.push({
					id: safeId("button"),
					type: "button",
					title: btn.title || btn.reply?.title || "",
					description: btn.description,
				});
			}
		} else if (action?.sections?.length) {
			// List sections (rows)
			for (const section of action.sections) {
				for (const row of section.rows ?? []) {
					elements.push({
						id: safeId("button"),
						type: "button",
						title: row.title,
						description: row.description,
					});
				}
			}
		}

		return elements;
	}

	// 2) From legacy inline fields
	const legacyElements: InteractiveMessageElement[] = [];

	// Header pode ser string ou objeto { type, content, text, mediaUrl, mediaHandle, variables }
	if (d.header) {
		if (typeof d.header === "string") {
			legacyElements.push({ id: safeId("header_text"), type: "header_text", text: d.header });
		} else if (d.header.type === "IMAGE" && d.header.mediaUrl) {
			legacyElements.push({
				id: safeId("header_image"),
				type: "header_image",
				url: d.header.mediaUrl,
				caption: "",
				mediaHandle: d.header.mediaHandle || undefined,
			});
		} else if (d.header.type === "TEXT" && (d.header.content || d.header.text)) {
			legacyElements.push({ id: safeId("header_text"), type: "header_text", text: d.header.content || d.header.text || "" });
		} else if (d.header.type === "VIDEO" && d.header.mediaUrl) {
			// Video também usa header_image internamente (pode ser renomeado no futuro)
			legacyElements.push({
				id: safeId("header_image"),
				type: "header_image",
				url: d.header.mediaUrl,
				caption: "",
				mediaHandle: d.header.mediaHandle || undefined,
			});
		} else if (d.header.type === "DOCUMENT" && d.header.mediaUrl) {
			legacyElements.push({
				id: safeId("header_image"),
				type: "header_image",
				url: d.header.mediaUrl,
				caption: "",
				mediaHandle: d.header.mediaHandle || undefined,
			});
		}
	}

	// Body pode ser string ou objeto { text, variables }
	const bodyText = typeof d.body === "string" ? d.body : d.body?.text;
	if (bodyText) legacyElements.push({ id: safeId("body"), type: "body", text: bodyText });

	// Footer pode ser string ou objeto { text }
	const footerText = typeof d.footer === "string" ? d.footer : d.footer?.text;
	if (footerText) legacyElements.push({ id: safeId("footer"), type: "footer", text: footerText });

	// Botões normais (QUICK_REPLY)
	// Regenerar IDs sem flow_ prefix SOMENTE se o ID original NÃO tiver o prefixo correto
	for (const b of d.buttons ?? []) {
		// Se tiver URL, é botão URL
		if ("url" in b && b.url) {
			legacyElements.push({
				id: b.id?.startsWith(FLOW_BUTTON_PREFIX) ? b.id : safeId("button_url"),
				type: "button_url",
				title: b.text || b.title,
				url: b.url,
			});
		} else {
			legacyElements.push({
				id: b.id?.startsWith(FLOW_BUTTON_PREFIX) ? b.id : safeId("button"),
				type: "button",
				title: b.title,
				description: b.description,
			});
		}
	}

	// Campos específicos de templates
	if (d.couponCode) {
		legacyElements.push({
			id: safeId("button_copy_code"),
			type: "button_copy_code",
			title: d.buttonText || "Copiar código",
			couponCode: d.couponCode,
		});
	}

	if (d.phoneNumber) {
		legacyElements.push({
			id: safeId("button_phone"),
			type: "button_phone",
			title: d.buttonText || "Ligar",
			phoneNumber: d.phoneNumber,
		});
	}

	return legacyElements;
}

export function getInteractiveMessageButtonElements(elements: InteractiveMessageElement[]) {
	return elements.filter((e) => e.type === "button");
}

export function hasConfiguredBody(elements: InteractiveMessageElement[]): boolean {
	const body = elements.find((e) => e.type === "body");
	return !!(body && "text" in body && body.text.trim().length > 0);
}
