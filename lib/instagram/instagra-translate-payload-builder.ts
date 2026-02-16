import {
	createInstagramGenericTemplate,
	createInstagramButtonTemplate,
	createInstagramQuickReplies,
	convertWhatsAppButtonsToInstagram,
	convertEnhancedButtonsToInstagram,
	determineInstagramTemplateType,
	validateInstagramTemplate,
	DialogflowFulfillmentMessage,
} from "@/lib/instagram/payload-builder";
import { instagramTranslationLogger } from "@/lib/logging/instagram-translation-logger";
import { logWithCorrelationId } from "@/lib/queue/instagram-translation.queue";
import { sanitizeErrorMessage } from "@/lib/validation/instagram-translation-validation";

/**
 * Build Instagram fulfillment messages from unified interactiveContent (prisma include)
 * - Supports Generic, Button and Quick Replies
 * - Merges Reply Buttons + CTA URL as web_url button
 */
export async function buildInstagramFromInteractiveContent(
	interactiveContent: any,
	correlationId: string,
	logContext: any,
): Promise<DialogflowFulfillmentMessage[]> {
	// Extract body text
	const bodyText = interactiveContent?.body?.text || "";
	if (!bodyText) {
		throw new Error("Body text is required for interactive content");
	}

	// Extract header information
	const hasImage = interactiveContent?.header?.type === "image" && interactiveContent?.header?.content;
	const imageUrl = hasImage ? interactiveContent.header.content : undefined;

	// Extract footer text
	const footerText = interactiveContent?.footer?.text;

	// Determine template type based on stored type or fallback to body length
	let templateType = determineInstagramTemplateType(bodyText, Boolean(hasImage));
	const explicitType = (interactiveContent as any)?.interactiveType as string | undefined;
	if (explicitType === "generic") templateType = "generic";
	else if (explicitType === "button_template" || explicitType === "button") templateType = "button";
	else if (explicitType === "quick_replies") templateType = "quick_replies";
	instagramTranslationLogger.workerTemplateTypeDetected(
		logContext,
		templateType,
		`Body length: ${bodyText.length}, Has image: ${Boolean(hasImage)}`,
	);

	// Convert buttons
	let instagramButtons: any[] = [];
	try {
		const replyButtons = interactiveContent?.actionReplyButton?.buttons || [];
		const replyButtonsCount = Array.isArray(replyButtons) ? replyButtons.length : 0;

		if (replyButtonsCount > 0) {
			// Reuse unified-to-instagram converter from payload builder
			instagramButtons = replyButtons.map((b: any) => {
				// Map unified quick reply/button structure into Instagram button shape
				const btn: any = {
					title: (b.title || b?.reply?.title || "Button").substring(0, 20),
					type: "postback",
					payload: b.id || b?.reply?.id || "default_payload",
				};
				if ((b.type === "url" || b.type === "web_url") && b.url) {
					btn.type = "web_url";
					btn.url = b.url;
					delete btn.payload;
				}
				return btn;
			});
		}

		// Include CTA URL as web_url button when present
		const cta = interactiveContent?.actionCtaUrl;
		if (cta?.url) {
			instagramButtons.push({
				type: "web_url",
				title: (cta.displayText || "Abrir link").substring(0, 20),
				url: cta.url,
			});
		}

		instagramTranslationLogger.workerButtonsConverted(
			logContext,
			(replyButtonsCount || 0) + (cta?.url ? 1 : 0),
			instagramButtons.length,
		);
	} catch (error) {
		logWithCorrelationId("warn", "Error converting unified buttons, using empty array", correlationId, {
			error: sanitizeErrorMessage(error),
		});
		instagramButtons = [];
	}

	let fulfillmentMessages: DialogflowFulfillmentMessage[];

	// Build template based on type
	if (templateType === "generic") {
		fulfillmentMessages = createInstagramGenericTemplate(bodyText, footerText, imageUrl, instagramButtons);
	} else if (templateType === "button") {
		fulfillmentMessages = createInstagramButtonTemplate(bodyText, instagramButtons);
	} else {
		fulfillmentMessages = createInstagramQuickReplies(bodyText, instagramButtons);
	}

	// Validate the generated template
	if (fulfillmentMessages.length > 0) {
		const socialwiseResponse = (fulfillmentMessages[0] as any)?.payload?.socialwiseResponse;
		const template = socialwiseResponse?.payload;
		if (template) {
			const templateValidation = validateInstagramTemplate(template);
			instagramTranslationLogger.workerValidationPerformed(
				logContext,
				"unified_instagram_template",
				templateValidation.isValid,
				templateValidation.errors,
			);
			if (!templateValidation.isValid) {
				logWithCorrelationId("error", "Generated Instagram template validation failed", correlationId, {
					errors: templateValidation.errors,
					template,
					messageFormat: socialwiseResponse.message_format,
				});
				throw new Error(`Generated unified template validation failed: ${templateValidation.errors.join(", ")}`);
			}
		}
	}

	logWithCorrelationId("info", "Interactive content converted successfully", correlationId, {
		templateType,
		bodyLength: bodyText.length,
		buttonsCount: instagramButtons.length,
		hasImage: Boolean(hasImage),
	});

	return fulfillmentMessages;
}
