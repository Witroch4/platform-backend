"use client";

import type React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";

import { toast } from "sonner";
import { useVariableManager } from "@/hooks/useVariableManager";
import type {
  InteractiveMessage,
  InteractiveMessageCreatorProps,
  InteractiveMessageType,
  ButtonReaction,
  MessageAction,
} from "@/types/interactive-messages";
import { StepIndicator } from "./interactive-message-creator/StepIndicator";
import { TypeSelectionStep } from "./interactive-message-creator/TypeSelectionStep";
import { UnifiedEditingStep } from "./interactive-message-creator/UnifiedEditingStep";
import { ReviewStep } from "./interactive-message-creator/ReviewStep";
import type { MinIOMediaFile } from "./shared/MinIOMediaUpload";

// Define the step type according to the design requirements
type WorkflowStep = "type-selection" | "configuration" | "preview";

// Define the unified state structure for the workflow
interface InteractiveMessageState {
  currentStep: WorkflowStep;
  message: InteractiveMessage;
  reactions: ButtonReaction[];
  uploadedFiles: MinIOMediaFile[];
  saving: boolean;
  errors: Record<string, string>;
}

export const InteractiveMessageCreator: React.FC<
  InteractiveMessageCreatorProps
> = ({ caixaId, onSave, editingMessage }) => {

  const { variables, loading: variablesLoading } = useVariableManager();

  // Initialize state with proper defaults
  const [state, setState] = useState<InteractiveMessageState>({
    currentStep: "type-selection",
    message: {
      name: "",
      type: "button",
      body: { text: "" },
      isActive: true,
    },
    reactions: [],
    uploadedFiles: [],
    saving: false,
    errors: {},
  });

  // Load existing message data when editing
  useEffect(() => {
    if (editingMessage) {
      setState(prev => ({
        ...prev,
        currentStep: "configuration", // Skip type selection when editing
        message: { ...editingMessage },
      }));
      
      // Load existing reactions if available
      loadExistingReactions(editingMessage.id);
    }
  }, [editingMessage]);

  // Auto-populate footer with company name if available
  useEffect(() => {
    if (!variablesLoading && variables.length > 0 && !state.message.footer?.text) {
      const companyNameVar = variables.find(v => v.chave === 'nome_do_escritorio_rodape');
      if (companyNameVar?.valor) {
        updateMessage({ footer: { text: companyNameVar.valor } });
      }
    }
  }, [variables, variablesLoading, state.message.footer?.text]);

  // Handle file uploads for header media
  useEffect(() => {
    if (state.uploadedFiles.length > 0 && state.message.header?.type) {
      const latestFile = state.uploadedFiles[state.uploadedFiles.length - 1];
      if (
        latestFile.url &&
        latestFile.progress === 100 &&
        (!state.message.header.mediaUrl || state.message.header.mediaUrl !== latestFile.url)
      ) {
        updateMessage({ 
          header: { 
            ...state.message.header, 
            mediaUrl: latestFile.url,
            content: latestFile.url 
          } 
        });
      }
    }
  }, [state.uploadedFiles, state.message.header?.type]);

  // Load existing reactions for editing mode
  const loadExistingReactions = useCallback(async (messageId?: string) => {
    if (!messageId) return;

    try {
      const response = await fetch(`/api/admin/mtf-diamante/button-reactions?messageId=${messageId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.reactions) {
          setState(prev => ({ ...prev, reactions: data.reactions }));
        }
      }
    } catch (error) {
      console.error('Failed to load existing reactions:', error);
    }
  }, []);

  // Unified state update functions
  const updateMessage = useCallback((updates: Partial<InteractiveMessage>) => {
    setState(prev => ({
      ...prev,
      message: { ...prev.message, ...updates },
      errors: { ...prev.errors, message: '' } // Clear message errors on update
    }));
  }, []);

  const updateReaction = useCallback((buttonId: string, reaction: Partial<ButtonReaction>) => {
    setState(prev => {
      const existingIndex = prev.reactions.findIndex(r => r.buttonId === buttonId);
      let updatedReactions: ButtonReaction[];

      if (existingIndex >= 0) {
        // Update existing reaction
        updatedReactions = [...prev.reactions];
        updatedReactions[existingIndex] = { ...updatedReactions[existingIndex], ...reaction };
      } else {
        // Add new reaction
        const newReaction: ButtonReaction = {
          id: `reaction-${buttonId}-${Date.now()}`,
          buttonId,
          messageId: prev.message.id || '',
          type: reaction.type || 'emoji',
          emoji: reaction.type === 'emoji' ? reaction.emoji : undefined,
          textResponse: reaction.type === 'text' ? reaction.textResponse : undefined,
          isActive: true,
          ...reaction
        };
        updatedReactions = [...prev.reactions, newReaction];
      }

      return {
        ...prev,
        reactions: updatedReactions
      };
    });
  }, []);

  const setCurrentStep = useCallback((step: WorkflowStep) => {
    setState(prev => ({ ...prev, currentStep: step }));
  }, []);

  const setUploadedFiles = useCallback((files: MinIOMediaFile[] | ((prev: MinIOMediaFile[]) => MinIOMediaFile[])) => {
    setState(prev => ({
      ...prev,
      uploadedFiles: typeof files === 'function' ? files(prev.uploadedFiles) : files
    }));
  }, []);

  // Step navigation handlers
  const handleTypeSelection = useCallback((type: InteractiveMessageType) => {
    updateMessage({ type });
    setCurrentStep("configuration");
  }, [updateMessage, setCurrentStep]);

  const handleNextToReview = useCallback(() => {
    // Validate before proceeding to review
    const errors: Record<string, string> = {};
    
    if (!state.message.name.trim()) {
      errors.name = 'Message name is required';
    }
    
    if (!state.message.body.text.trim()) {
      errors.body = 'Message body is required';
    }

    if (Object.keys(errors).length > 0) {
      setState(prev => ({ ...prev, errors }));
      toast.error('Please fix validation errors before proceeding');
      return;
    }

    setCurrentStep("preview");
  }, [state.message.name, state.message.body.text, setCurrentStep]);

  const handleBackToConfiguration = useCallback(() => {
    setCurrentStep("configuration");
  }, [setCurrentStep]);

  const handleBackToTypeSelection = useCallback(() => {
    setCurrentStep("type-selection");
  }, [setCurrentStep]);

  // Save handler using the unified API endpoint
  const handleSave = useCallback(async (savedMessage: InteractiveMessage) => {
    // The ReviewStep component handles the actual saving
    // This callback is called when save is successful
    onSave?.(savedMessage);
  }, [onSave]);

  // Memoized step indicator props
  const stepIndicatorProps = useMemo(() => ({
    currentStep: state.currentStep
  }), [state.currentStep]);

  // Memoized step component props
  const typeSelectionProps = useMemo(() => ({
    selectedType: state.message.type,
    onTypeSelect: handleTypeSelection
  }), [state.message.type, handleTypeSelection]);

  const unifiedEditingProps = useMemo(() => ({
    message: state.message,
    reactions: state.reactions,
    onMessageUpdate: updateMessage,
    onReactionUpdate: updateReaction,
    onNext: handleNextToReview,
    onBack: handleBackToTypeSelection,
    disabled: state.saving
  }), [
    state.message, 
    state.reactions, 
    updateMessage, 
    updateReaction, 
    handleNextToReview, 
    handleBackToTypeSelection, 
    state.saving
  ]);

  const reviewProps = useMemo(() => ({
    message: state.message,
    reactions: state.reactions.map(r => ({
      buttonId: r.buttonId,
      reaction: r.type === 'emoji' 
        ? { type: 'emoji' as const, value: r.emoji || '' }
        : { type: 'text' as const, value: r.textResponse || '' }
    })),
    caixaId,
    onSave: handleSave,
    onBack: handleBackToConfiguration,
    editingMessage,
    disabled: state.saving
  }), [
    state.message, 
    state.reactions, 
    caixaId, 
    handleSave, 
    handleBackToConfiguration, 
    editingMessage, 
    state.saving
  ]);

  return (
    <div className="space-y-6">
      <StepIndicator {...stepIndicatorProps} />
      
      {state.currentStep === "type-selection" && (
        <TypeSelectionStep {...typeSelectionProps} />
      )}
      
      {state.currentStep === "configuration" && (
        <UnifiedEditingStep {...unifiedEditingProps} />
      )}
      
      {state.currentStep === "preview" && (
        <ReviewStep {...reviewProps} />
      )}
    </div>
  );
};

export default InteractiveMessageCreator;