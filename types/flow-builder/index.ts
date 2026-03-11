/**
 * Flow Builder Types - Central Export
 *
 * Re-exports all types from modular files for backward compatibility.
 * Import from "@/types/flow-builder" works the same as before.
 */

// =============================================================================
// ENUMS & STATUS TYPES
// =============================================================================

export {
	FlowNodeType,
	type FlowNodeExecutionStatus,
	type TemplateApprovalStatus,
	type TemplateNodeMode,
	type TemplateCategory,
	type MediaType,
	type InstagramButtonType,
} from "./enums";

// =============================================================================
// INTERACTIVE MESSAGE ELEMENTS
// =============================================================================

export {
	type InteractiveMessageElementType,
	type InteractiveMessageElementBase,
	type InteractiveMessageHeaderTextElement,
	type InteractiveMessageHeaderImageElement,
	type InteractiveMessageBodyElement,
	type InteractiveMessageFooterElement,
	type InteractiveMessageButtonElement,
	type InteractiveMessageButtonCopyCodeElement,
	type InteractiveMessageButtonPhoneElement,
	type InteractiveMessageButtonUrlElement,
	type InteractiveMessageButtonVoiceCallElement,
	type InteractiveMessageElement,
	FLOWBUILDER_ELEMENT_MIME,
	type ElementPaletteItem,
	INTERACTIVE_MESSAGE_ELEMENT_ITEMS,
	SHARED_ELEMENT_ITEMS,
} from "./elements";

// =============================================================================
// NODE DATA INTERFACES
// =============================================================================

export {
	type FlowNodeDataBase,
	type StartNodeData,
	type InteractiveMessageNodeData,
	type TextMessageNodeData,
	type MediaNodeData,
	type EmojiReactionNodeData,
	type TextReactionNodeData,
	type HandoffNodeData,
	type AddTagNodeData,
	type EndConversationNodeData,
	type DelayNodeData,
	type TemplateNodeData,
	type WhatsAppTemplateNodeData,
	type ButtonTemplateNodeData,
	type CouponTemplateNodeData,
	type ChatwitActionNodeData,
	type CallTemplateNodeData,
	type UrlTemplateNodeData,
	type WaitForReplyNodeData,
	type FlowNodeData,
} from "./nodes";

// =============================================================================
// WHATSAPP TEMPLATES
// =============================================================================

export {
	type TemplateButtonType,
	type TemplateButton,
	type TemplateHeader,
	type TemplateBody,
	type TemplateFooter,
	type MetaTemplateComponents,
	WHATSAPP_TEMPLATE_LIMITS,
	BUTTON_TEMPLATE_LIMITS,
	COUPON_TEMPLATE_LIMITS,
	CALL_TEMPLATE_LIMITS,
	URL_TEMPLATE_LIMITS,
	type TemplatePaletteItem,
	type TemplateElementType,
	type TemplateElementItem,
	TEMPLATE_ELEMENT_MIME,
} from "./templates";

// =============================================================================
// INSTAGRAM/FACEBOOK
// =============================================================================

export {
	type QuickReplyItem,
	type QuickRepliesNodeData,
	type CarouselCardButton,
	type CarouselCard,
	type CarouselNodeData,
	INSTAGRAM_VALIDATION,
} from "./instagram";

// =============================================================================
// CANVAS & GRAPH
// =============================================================================

export {
	type FlowNode,
	type FlowEdgeData,
	type FlowEdge,
	type FlowViewport,
	type FlowCanvas,
	type FlowCanvasState,
	type SaveFlowCanvasRequest,
	type FlowCanvasResponse,
	type ButtonReactionPayload,
	type StartNode,
	type InteractiveMessageNode,
	type EmojiReactionNode,
	type TextReactionNode,
	type HandoffNode,
} from "./canvas";

// =============================================================================
// PALETTE
// =============================================================================

export {
	type PaletteItem,
	PALETTE_ITEMS,
	INSTAGRAM_PALETTE_ITEMS,
	TEMPLATE_PALETTE_ITEMS,
	TEMPLATE_ELEMENT_ITEMS,
	TEMPLATE_SPECIAL_BUTTON_ITEMS,
	getDefaultLabel,
} from "./palette";

// =============================================================================
// CONSTANTS
// =============================================================================

export {
	CHANNEL_CHAR_LIMITS,
	type ChannelType,
	getCharLimit,
	FLOW_CANVAS_CONSTANTS,
	NODE_COLORS,
} from "./constants";

// =============================================================================
// HELPERS
// =============================================================================

export { createFlowNode, createFlowEdge, createEmptyFlowCanvas, validateFlowCanvas } from "./helpers";

// =============================================================================
// EXPORT/IMPORT
// =============================================================================

export {
	type FlowExportMeta,
	type N8nConnectionTarget,
	type N8nConnectionsMap,
	type FlowNodeExport,
	type FlowExportFormat,
	type FlowImportValidation,
} from "./export";
