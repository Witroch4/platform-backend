// Re-export types from the centralized type system
export type {
	InteractiveMessageType,
	InteractiveMessage,
	QuickReplyButton,
	ListSection,
	ListRow,
	MessageHeader,
	MessageBody,
	MessageFooter,
	MessageAction,
	CtaUrlAction,
	FlowAction,
	LocationRequestAction,
	ButtonReaction,
	InteractiveMessageCreatorProps,
	CreateInteractiveMessageRequest,
	UpdateInteractiveMessageRequest,
	InteractiveMessageResponse,
} from "@/types/interactive-messages";

// Legacy compatibility - deprecated, use types from @/types/interactive-messages instead
/** @deprecated Use FlowAction from @/types/interactive-messages */
export interface FlowParameters {
	flow_message_version: string;
	flow_token: string;
	flow_id: string;
	flow_cta: string;
	flow_action: "navigate" | "data_exchange";
	flow_action_payload?: {
		screen?: string;
		data?: Record<string, any>;
	};
}
