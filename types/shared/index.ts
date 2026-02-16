import type { User as PrismaUser } from "@prisma/client";

type User = PrismaUser;

export type { User };

// Re-export interactive message types for easy access
export type {
	InteractiveMessage,
	InteractiveMessageType,
	MessageHeader,
	MessageBody,
	MessageFooter,
	MessageAction,
	QuickReplyButton,
	ListSection,
	ListRow,
	ButtonReaction,
	CtaUrlAction,
	FlowAction,
	LocationRequestAction,
	InteractiveMessageCreatorProps,
	CreateInteractiveMessageRequest,
	UpdateInteractiveMessageRequest,
	InteractiveMessageResponse,
	ButtonReactionResponse,
	ValidationResult,
	MessageValidationContext,
} from "../interactive-messages";

export type {
	ValidationError,
	ValidationErrorType,
	FieldValidationResult,
	MessageValidationResult,
	ValidationContext,
	ValidationRules,
	ButtonValidationResult,
	ListValidationResult,
	MediaValidationResult,
	UrlValidationResult,
	ValidationState,
	UseValidationReturn,
} from "../validation";

export {
	isInteractiveMessage,
	isValidMessageType,
	hasHeader,
	hasAction,
	isButtonAction,
	isListAction,
	isCtaUrlAction,
	isFlowAction,
	isLocationRequestAction,
	isCompleteMessage,
	isCompatibleWithButtonReactions,
	requiresMediaUpload,
} from "../type-guards";
