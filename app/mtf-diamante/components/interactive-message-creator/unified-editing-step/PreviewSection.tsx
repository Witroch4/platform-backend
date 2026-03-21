"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";
import { InteractivePreview } from "../../shared/InteractivePreview";
import { resolveVariables } from "./utils";
import type { InteractiveMessage, CentralButtonReaction } from "./types";

interface PreviewSectionProps {
	message: InteractiveMessage;
	variables: Array<{ chave: string; valor: string }>;
	channelType?: string;
	reactions?: CentralButtonReaction[];
	onReactionChange?: (buttonId: string, reaction: { emoji?: string; textResponse?: string; action?: string }) => void;
	inboxId?: string;
}

export const PreviewSection: React.FC<PreviewSectionProps> = React.memo(
	({ message, variables, channelType, reactions = [], onReactionChange, inboxId }) => {
		// Create a resolved version of the message for preview - optimized for performance
		const resolvedMessage = React.useMemo((): InteractiveMessage => {
			// Skip variable resolution if no variables to improve performance
			if (!variables?.length) {
				return message;
			}

			const headerContentSafe = message.header
				? message.header.type === "text"
					? resolveVariables(message.header.content || "", variables)
					: message.header.content || ""
				: "";
			const bodyText = resolveVariables(message.body.text, variables);
			const footerText = message.footer ? resolveVariables(message.footer.text, variables) : undefined;

			return {
				...message,
				header: message.header ? { ...message.header, content: headerContentSafe } : undefined,
				body: { ...message.body, text: bodyText },
				footer: message.footer ? { ...message.footer, text: footerText || "" } : undefined,
			};
		}, [message, variables]);

		// Convert reactions to the format expected by InteractivePreview
		const convertedReactions = React.useMemo(() => {
			return reactions.map((reaction) => ({
				id: reaction.id || `reaction-${reaction.buttonId}`,
				buttonId: reaction.buttonId,
				messageId: reaction.messageId || "preview-message",
				type: reaction.type || "emoji",
				emoji: reaction.emoji || (reaction as any).emoji,
				textResponse: reaction.textResponse || (reaction as any).textReaction,
				action: reaction.action || (reaction as any).action,
				isActive: reaction.isActive ?? true,
			}));
		}, [reactions]);

		return (
			<div className="sticky top-6">
				<Card>
					<CardHeader className="pb-4">
						<div className="flex items-center justify-between">
							<CardTitle className="text-base flex items-center gap-2">
								<Eye className="h-4 w-4" />
								Preview
							</CardTitle>
							<Badge variant="outline" className="text-xs">
								Real-time
							</Badge>
						</div>
						<p className="text-sm text-muted-foreground">See how your message will appear to recipients</p>
					</CardHeader>
					<CardContent>
						<InteractivePreview
							message={resolvedMessage}
							reactions={convertedReactions}
							showReactionConfig={true}
							showReactionIndicators={true}
							onButtonReactionChange={onReactionChange}
							title="Interactive Preview"
							className="w-full"
							inboxId={inboxId}
							templateName={message.name}
							channelType={channelType}
						/>
					</CardContent>
				</Card>
			</div>
		);
	},
);

PreviewSection.displayName = "PreviewSection";
