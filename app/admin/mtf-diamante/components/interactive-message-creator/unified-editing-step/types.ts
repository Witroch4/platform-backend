import type {
  InteractiveMessage,
  MessageHeader,
  HeaderType,
  ButtonReaction as CentralButtonReaction,
} from "@/types/interactive-messages";
import type {
  InteractiveButton,
  ButtonReaction as LocalButtonReaction,
} from "../../shared/ButtonManager";

export interface UnifiedEditingStepProps {
  message: InteractiveMessage;
  reactions: CentralButtonReaction[];
  variables?: Array<{ chave: string; valor: string; }>;
  channelType?: string;
  onMessageUpdate: (updates: Partial<InteractiveMessage>) => void;
  onReactionUpdate: (
    buttonId: string,
    reaction: Partial<CentralButtonReaction>
  ) => void;
  onNext: () => void;
  onBack: () => void;
  disabled?: boolean;
  className?: string;
  inboxId?: string;
}

export interface MessageConfigurationProps {
  message: InteractiveMessage;
  onMessageUpdate: (updates: Partial<InteractiveMessage>) => void;
  disabled?: boolean;
  isFieldValid: (field: string) => boolean;
  getFieldErrors: (field: string) => Array<{ message: string }>;
  handleValidationError: (error: any) => void;
  validateField: (field: string, value: any, context: any) => void;
}

export interface HeaderSectionProps {
  message: InteractiveMessage;
  onMessageUpdate: (updates: Partial<InteractiveMessage>) => void;
  disabled?: boolean;
  isFieldValid: (field: string) => boolean;
  headerMediaFiles: any[];
  setHeaderMediaFiles: React.Dispatch<React.SetStateAction<any[]>>;
  handleValidationError: (error: any) => void;
  validateField: (field: string, value: any, context: any) => void;
  channelType?: string;
}

export interface BodySectionProps {
  message: InteractiveMessage;
  onMessageUpdate: (updates: Partial<InteractiveMessage>) => void;
  disabled?: boolean;
  isFieldValid: (field: string) => boolean;
  validationLimits: typeof VALIDATION_LIMITS;
  channelType?: string;
}

export interface FooterSectionProps {
  message: InteractiveMessage;
  onMessageUpdate: (updates: Partial<InteractiveMessage>) => void;
  disabled?: boolean;
  isFieldValid: (field: string) => boolean;
  validationLimits: typeof VALIDATION_LIMITS;
  channelType?: string;
}

export interface ButtonsSectionProps {
  message: InteractiveMessage;
  buttons: InteractiveButton[];
  reactions: CentralButtonReaction[];
  onButtonsChange: (buttons: InteractiveButton[]) => void;
  onReactionChange: (reaction: LocalButtonReaction) => void;
  disabled?: boolean;
  channelType?: string;
  validationLimits: typeof VALIDATION_LIMITS;
  inboxId?: string;
}

export interface CtaUrlSectionProps {
  message: InteractiveMessage;
  isCtaUrl: boolean;
  currentCtaDisplay: string;
  currentCtaUrl: string;
  onCtaDisplayChange: (value: string) => void;
  onCtaUrlChange: (value: string) => void;
  disabled?: boolean;
}

export interface NavigationSectionProps {
  onBack: () => void;
  onNext: () => void;
  disabled?: boolean;
  hasErrors: boolean;
  errorMessages?: string[];
}

// Validation constants
export const VALIDATION_LIMITS = {
  NAME_MAX_LENGTH: 100,
  HEADER_TEXT_MAX_LENGTH: 60,
  BODY_TEXT_MAX_LENGTH: 1024,
  FOOTER_TEXT_MAX_LENGTH: 60,
  BUTTON_MAX_COUNT: 3,
  // Instagram specific limits
  INSTAGRAM_QUICK_REPLIES_MAX_LENGTH: 1000,
} as const;

export type { 
  InteractiveMessage, 
  MessageHeader, 
  HeaderType, 
  CentralButtonReaction, 
  LocalButtonReaction, 
  InteractiveButton 
};
