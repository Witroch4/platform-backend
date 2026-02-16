/**
 * Instagram Payload Builder for Dialogflow fulfillmentMessages
 * Handles Generic Template and Button Template formatting for Instagram
 */

export interface InstagramGenericElement {
	title: string;
	image_url?: string;
	subtitle?: string;
	buttons: InstagramButton[];
}

export interface InstagramButton {
	type: "web_url" | "postback";
	title: string;
	url?: string;
	payload?: string;
}

export interface InstagramGenericTemplate {
	template_type: "generic";
	elements: InstagramGenericElement[];
}

export interface InstagramButtonTemplate {
	template_type: "button";
	text: string;
	buttons: InstagramButton[];
}

export type InstagramTemplate = InstagramGenericTemplate | InstagramButtonTemplate;

// Socialwise Response Format
export interface SocialwiseResponse {
	message_format: "GENERIC_TEMPLATE" | "BUTTON_TEMPLATE" | "QUICK_REPLIES";
	payload: InstagramTemplate | InstagramQuickReplies;
}

export interface DialogflowFulfillmentMessage {
	payload: {
		socialwiseResponse: SocialwiseResponse;
	};
}

// Quick Replies interfaces
export interface InstagramQuickReply {
	content_type: "text";
	title: string;
	payload: string;
}

export interface InstagramQuickReplies {
	text: string;
	quick_replies: InstagramQuickReply[];
}

/**
 * Create Generic Template payload for Instagram (≤80 character messages)
 */
export function createInstagramGenericTemplate(
	title: string,
	subtitle?: string,
	imageUrl?: string,
	buttons: InstagramButton[] = [],
): DialogflowFulfillmentMessage[] {
	// Validate title length - should only be used for ≤80 character messages
	if (title.length > 80) {
		throw new Error(
			`Generic Template title exceeds 80 characters (${title.length} chars). Use Button Template instead.`,
		);
	}

	// Validate and truncate subtitle to 80 characters if provided
	const truncatedSubtitle = subtitle ? subtitle.substring(0, 80) : undefined;

	// Limit buttons to 3 for Instagram
	const limitedButtons = buttons.slice(0, 3);

	const element: InstagramGenericElement = {
		title: title, // Use original title since we validated it's ≤80 chars
		buttons: limitedButtons,
	};

	// Add subtitle if provided
	if (truncatedSubtitle) {
		element.subtitle = truncatedSubtitle;
	}

	// Add image URL if provided
	if (imageUrl) {
		element.image_url = imageUrl;
	}

	const template: InstagramGenericTemplate = {
		template_type: "generic",
		elements: [element],
	};

	const socialwiseResponse: SocialwiseResponse = {
		message_format: "GENERIC_TEMPLATE",
		payload: template,
	};

	return [
		{
			payload: {
				socialwiseResponse,
			},
		},
	];
}

/**
 * Create Button Template payload for Instagram (81-640 character messages)
 */
export function createInstagramButtonTemplate(
	text: string,
	buttons: InstagramButton[] = [],
): DialogflowFulfillmentMessage[] {
	// Validate text length - should be between 81-640 characters for Button Template
	if (text.length > 640) {
		throw new Error(`Button Template text exceeds 640 characters (${text.length} chars). Use Quick Replies instead.`);
	}

	if (text.length <= 80) {
		throw new Error(
			`Button Template should not be used for messages ≤80 characters (${text.length} chars). Use Generic Template instead.`,
		);
	}

	// Limit buttons to 3 for Instagram
	const limitedButtons = buttons.slice(0, 3);

	const template: InstagramButtonTemplate = {
		template_type: "button",
		text: text, // Use original text since we validated it's within limits
		buttons: limitedButtons,
	};

	const socialwiseResponse: SocialwiseResponse = {
		message_format: "BUTTON_TEMPLATE",
		payload: template,
	};

	return [
		{
			payload: {
				socialwiseResponse,
			},
		},
	];
}

/**
 * Convert WhatsApp buttons to Instagram format
 */
export function convertWhatsAppButtonsToInstagram(whatsappButtons: any[]): InstagramButton[] {
	return whatsappButtons.map((button) => {
		const instagramButton: InstagramButton = {
			title: button.titulo ? button.titulo.substring(0, 20) : "Button", // Instagram button title limit
			type: "postback",
			payload: button.id || "default_payload",
		};

		// Map button types
		if (button.tipo === "web_url" && button.url) {
			instagramButton.type = "web_url";
			instagramButton.url = button.url;
			delete instagramButton.payload;
		}

		return instagramButton;
	});
}

/**
 * Convert enhanced WhatsApp buttons to Instagram format
 */
export function convertEnhancedButtonsToInstagram(enhancedButtons: any[]): InstagramButton[] {
	return enhancedButtons.map((button) => {
		const instagramButton: InstagramButton = {
			title: button.title ? button.title.substring(0, 20) : "Button", // Instagram button title limit
			type: "postback",
			payload: button.id || "default_payload",
		};

		// Map button types based on enhanced button structure
		if (button.type === "url" && button.url) {
			instagramButton.type = "web_url";
			instagramButton.url = button.url;
			delete instagramButton.payload;
		}

		return instagramButton;
	});
}

/**
 * Create Quick Replies payload for Instagram (>640 character messages)
 */
export function createInstagramQuickReplies(
	text: string,
	buttons: InstagramButton[] = [],
): DialogflowFulfillmentMessage[] {
	// Quick Replies can be used for any message length, especially as fallback for >640 character messages
	// No length validation needed - Quick Replies are flexible

	// Convert buttons to quick replies format
	const quickReplies: InstagramQuickReply[] = buttons.slice(0, 13).map((button) => ({
		content_type: "text",
		title: button.title.substring(0, 20), // Instagram limit for quick reply title
		payload: button.payload || button.url || "default_payload",
	}));

	const quickRepliesPayload: InstagramQuickReplies = {
		text: text, // No truncation for quick replies - Instagram supports longer text
		quick_replies: quickReplies,
	};

	const socialwiseResponse: SocialwiseResponse = {
		message_format: "QUICK_REPLIES",
		payload: quickRepliesPayload,
	};

	return [
		{
			payload: {
				socialwiseResponse,
			},
		},
	];
}

/**
 * Create fallback text message for Instagram when conversion fails
 */
export function createInstagramFallbackMessage(
	errorMessage: string = "Desculpe, não foi possível processar sua mensagem no momento.",
): DialogflowFulfillmentMessage[] {
	// Determine appropriate template based on message length
	const templateType = determineInstagramTemplateType(errorMessage);

	if (templateType === "quick_replies") {
		return createInstagramQuickReplies(errorMessage, []);
	} else if (templateType === "generic") {
		return createInstagramGenericTemplate(errorMessage, undefined, undefined, []);
	} else {
		// Button template
		const template: InstagramButtonTemplate = {
			template_type: "button",
			text: errorMessage,
			buttons: [],
		};

		const socialwiseResponse: SocialwiseResponse = {
			message_format: "BUTTON_TEMPLATE",
			payload: template,
		};

		return [
			{
				payload: {
					socialwiseResponse,
				},
			},
		];
	}
}

/**
 * Validate Instagram template constraints
 */
export function validateInstagramTemplate(template: InstagramTemplate | InstagramQuickReplies): {
	isValid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	// Check if it's a Quick Replies payload
	if ("quick_replies" in template) {
		const quickRepliesTemplate = template as InstagramQuickReplies;

		if (!quickRepliesTemplate.text || quickRepliesTemplate.text.length === 0) {
			errors.push("Quick Replies must have text");
		}

		if (quickRepliesTemplate.quick_replies && quickRepliesTemplate.quick_replies.length > 13) {
			errors.push("Quick Replies has more than 13 options (Instagram limit)");
		}

		quickRepliesTemplate.quick_replies?.forEach((reply, index) => {
			if (!reply.title || reply.title.length === 0) {
				errors.push(`Quick Reply ${index} must have a title`);
			}

			if (reply.title && reply.title.length > 20) {
				errors.push(`Quick Reply ${index} title exceeds 20 characters`);
			}

			if (!reply.payload || reply.payload.length === 0) {
				errors.push(`Quick Reply ${index} must have a payload`);
			}
		});

		return {
			isValid: errors.length === 0,
			errors,
		};
	}

	// Handle template types (generic/button)
	const templateWithType = template as InstagramTemplate;

	if (templateWithType.template_type === "generic") {
		const genericTemplate = templateWithType as InstagramGenericTemplate;

		// Check elements
		if (!genericTemplate.elements || genericTemplate.elements.length === 0) {
			errors.push("Generic template must have at least one element");
		}

		genericTemplate.elements.forEach((element, index) => {
			if (!element.title || element.title.length === 0) {
				errors.push(`Element ${index} must have a title`);
			}

			if (element.title && element.title.length > 80) {
				errors.push(`Element ${index} title exceeds 80 characters`);
			}

			if (element.subtitle && element.subtitle.length > 80) {
				errors.push(`Element ${index} subtitle exceeds 80 characters`);
			}

			if (element.buttons && element.buttons.length > 3) {
				errors.push(`Element ${index} has more than 3 buttons`);
			}
		});
	} else if (templateWithType.template_type === "button") {
		const buttonTemplate = templateWithType as InstagramButtonTemplate;

		if (!buttonTemplate.text || buttonTemplate.text.length === 0) {
			errors.push("Button template must have text");
		}

		if (buttonTemplate.text && buttonTemplate.text.length > 640) {
			errors.push("Button template text exceeds 640 characters");
		}

		if (buttonTemplate.buttons && buttonTemplate.buttons.length > 3) {
			errors.push("Button template has more than 3 buttons");
		}
	}

	return {
		isValid: errors.length === 0,
		errors,
	};
}

/**
 * Determine appropriate Instagram template type based on message content
 */
export function determineInstagramTemplateType(
	bodyText: string,
	hasImage: boolean = false,
): "generic" | "button" | "quick_replies" {
	const bodyLength = bodyText.length;

	if (bodyLength > 640) {
		// Use Quick Replies for messages longer than 640 characters
		return "quick_replies";
	}

	if (bodyLength <= 80) {
		return "generic";
	}

	// Messages between 81-640 characters should use Button Template
	return "button";
}
