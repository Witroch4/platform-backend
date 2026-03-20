"use client";

import type React from "react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// Simple in-flight and data cache to avoid duplicate fetches (StrictMode dev mounts)
const reactionsRequestCache = new Map<string, Promise<any[]>>();
const reactionsDataCache = new Map<string, any[]>();

import { toast } from "sonner";
import { useVariableManager } from "@/hooks/useVariableManager";
import { useMtfData } from "../context/MtfDataProvider";
import type {
	InteractiveMessage,
	InteractiveMessageCreatorProps,
	InteractiveMessageType,
	ButtonReaction,
	MessageAction,
} from "@/types/interactive-messages";
import { StepIndicator } from "./interactive-message-creator/StepIndicator";
import { TypeSelectionStep } from "./interactive-message-creator/TypeSelectionStep";
import { UnifiedEditingStep } from "./interactive-message-creator/UnifiedEditingStepRefactored";
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

export const InteractiveMessageCreator: React.FC<InteractiveMessageCreatorProps> = ({
	inboxId,
	onSave,
	editingMessage,
}) => {
	const { variables, loading: variablesLoading } = useVariableManager();
	const { buttonReactions, caixas } = useMtfData();

	// Detectar o tipo de canal usando o contexto SWR (mesmo padrão dos outros componentes)
	const channelType = useMemo(
		() => caixas?.find((c: any) => c.id === inboxId)?.channelType ?? "Channel::WhatsApp",
		[caixas, inboxId],
	);

	// Debug log para verificar detecção do canal (throttled)
	useEffect(() => {
		if (caixas && inboxId) {
			const now = Date.now();
			if (now - lastLogTimes.current.canalDetectado > 3000) {
				// Apenas a cada 3 segundos
				const inbox = caixas.find((c: any) => c.id === inboxId);
				console.log("🔍 [InteractiveMessageCreator] Canal detectado:", {
					inboxId,
					channelType,
					inboxData: inbox
						? {
								id: inbox.id,
								nome: inbox.nome,
								channelType: inbox.channelType,
								inboxId: inbox.inboxId,
							}
						: "não encontrado",
					totalCaixas: caixas.length,
					todasCaixas: caixas.map((c: any) => ({
						id: c.id,
						nome: c.nome,
						channelType: c.channelType,
					})),
				});
				lastLogTimes.current.canalDetectado = now;
			}
		}
	}, [caixas, inboxId, channelType]);
	const reactionsLoadedRef = useRef(false);
	const footerUserClearedRef = useRef(false);

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

	// Load existing reactions from context for editing mode
	const loadExistingReactions = useCallback(() => {
		if (!buttonReactions || buttonReactions.length === 0) return;

		// Os dados já vêm normalizados do MtfDataProvider, mas precisam ser convertidos para o tipo correto
		console.log("🔍 [loadExistingReactions] Raw buttonReactions from context:", buttonReactions);

		const convertedReactions: ButtonReaction[] = buttonReactions.map((r: any) => ({
			id: r.id,
			messageId: r.messageId || "",
			buttonId: r.buttonId,
			type: r.emoji ? "emoji" : r.textResponse || r.textReaction ? "text" : r.action ? "action" : "emoji",
			emoji: r.emoji || "",
			textResponse: r.textResponse || r.textReaction || "",
			action: r.action || "",
			isActive: true,
			createdAt: r.createdAt,
		}));

		setState((prev) => ({ ...prev, reactions: convertedReactions }));
		reactionsLoadedRef.current = true;
	}, [buttonReactions]);

	// Load existing message data when editing
	useEffect(() => {
		if (editingMessage && state.currentStep === "type-selection") {
			// Reset footer flag when editing existing message - assume user is OK with current footer
			footerUserClearedRef.current = false;

			// Apenas carregar dados iniciais, não durante edição ativa
			setState((prev) => ({
				...prev,
				currentStep: "configuration", // Skip type selection when editing
				message: { ...editingMessage },
			}));

			// Load existing reactions from context
			loadExistingReactions();
		}
	}, [editingMessage, loadExistingReactions, state.currentStep]);

	// ✅ REMOVIDO: Pause global que afetava as caixas no sidebar
	// O InteractiveMessageCreator não deve pausar TODAS as atualizações,
	// apenas gerenciar seu próprio estado interno.
	// As caixas devem sempre permanecer visíveis na sidebar.

	// Auto-populate footer with company name if available (only if user hasn't explicitly cleared it)
	useEffect(() => {
		if (!variablesLoading && variables.length > 0 && !state.message.footer?.text && !footerUserClearedRef.current) {
			const companyNameVar = variables.find((v) => v.chave === "nome_do_escritorio_rodape");
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
				(!state.message.header.media_url || state.message.header.media_url !== latestFile.url)
			) {
				updateMessage({
					header: {
						...state.message.header,
						media_url: latestFile.url,
						content: latestFile.url,
					},
				});
			}
		}
	}, [state.uploadedFiles, state.message.header?.type]);

	// Unified state update functions
	const updateMessage = useCallback((updates: Partial<InteractiveMessage>) => {
		// Check if footer is being explicitly cleared by user
		if (updates.footer && updates.footer.text === "") {
			footerUserClearedRef.current = true;
		} else if (updates.footer && updates.footer.text && updates.footer.text.trim() !== "") {
			// Footer is being set with content, reset the flag
			footerUserClearedRef.current = false;
		}

		setState((prev) => ({
			...prev,
			message: { ...prev.message, ...updates },
			errors: { ...prev.errors, message: "" }, // Clear message errors on update
		}));
	}, []);

	const updateReaction = useCallback((buttonId: string, reaction: Partial<ButtonReaction>) => {
		setState((prev) => {
			const existingIndex = prev.reactions.findIndex((r) => r.buttonId === buttonId);
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
					messageId: prev.message.id || "",
					type: reaction.type || "emoji",
					emoji: reaction.type === "emoji" ? reaction.emoji : undefined,
					textResponse: reaction.type === "text" ? reaction.textResponse : undefined,
					isActive: true,
					...reaction,
				};
				updatedReactions = [...prev.reactions, newReaction];
			}

			return {
				...prev,
				reactions: updatedReactions,
			};
		});
	}, []);

	const setCurrentStep = useCallback((step: WorkflowStep) => {
		setState((prev) => ({ ...prev, currentStep: step }));
	}, []);

	const setUploadedFiles = useCallback((files: MinIOMediaFile[] | ((prev: MinIOMediaFile[]) => MinIOMediaFile[])) => {
		setState((prev) => ({
			...prev,
			uploadedFiles: typeof files === "function" ? files(prev.uploadedFiles) : files,
		}));
	}, []);

	// Step navigation handlers
	const handleTypeSelection = useCallback(
		(type: InteractiveMessageType) => {
			updateMessage({ type });
			setCurrentStep("configuration");
		},
		[updateMessage, setCurrentStep],
	);

	const handleNextToConfiguration = useCallback(() => {
		setCurrentStep("configuration");
	}, [setCurrentStep]);

	const handleNextToReview = useCallback(() => {
		// Validate before proceeding to review
		const errors: Record<string, string> = {};

		if (!state.message.name.trim()) {
			errors.name = "Message name is required";
		}

		if (!state.message.body.text.trim()) {
			errors.body = "Message body is required";
		}

		if (Object.keys(errors).length > 0) {
			setState((prev) => ({ ...prev, errors }));
			toast.error("Por favor, corrija os erros de validação antes de continuar");
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
	const handleSave = useCallback(
		async (savedMessage: InteractiveMessage) => {
			// The ReviewStep component handles the actual saving
			// This callback is called when save is successful
			onSave?.(savedMessage);
		},
		[onSave],
	);

	// Memoized step indicator props
	const stepIndicatorProps = useMemo(
		() => ({
			currentStep: state.currentStep,
		}),
		[state.currentStep],
	);

	// Memoized step component props
	const typeSelectionProps = useMemo(
		() => ({
			selectedType: state.message.type,
			onTypeSelect: handleTypeSelection,
			inboxId: inboxId,
			channelType: channelType,
			onNext: handleNextToConfiguration,
		}),
		[state.message.type, handleTypeSelection, inboxId, channelType, handleNextToConfiguration],
	);

	const unifiedEditingProps = useMemo(
		() => ({
			message: state.message,
			reactions: state.reactions,
			variables: variables,
			channelType: channelType,
			onMessageUpdate: updateMessage,
			onReactionUpdate: updateReaction,
			onNext: handleNextToReview,
			onBack: handleBackToTypeSelection,
			disabled: state.saving,
		}),
		[
			state.message,
			state.reactions,
			variables,
			channelType,
			updateMessage,
			updateReaction,
			handleNextToReview,
			handleBackToTypeSelection,
			state.saving,
		],
	);

	// Throttling para logs repetitivos
	const lastLogTimes = useRef({
		noReactions: 0,
		canalDetectado: 0,
		debugReactions: 0,
		actionReactions: 0,
		processedReactions: 0,
	});

	const reviewProps = useMemo(() => {
		// Otimização: Skip processamento se não há reações
		if (!state.reactions || state.reactions.length === 0) {
			// Throttle este log para evitar spam
			const now = Date.now();
			if (now - lastLogTimes.current.noReactions > 2000) {
				console.log("🎯 [InteractiveMessageCreator] No reactions to process - skipping");
				lastLogTimes.current.noReactions = now;
			}
			return {
				message: state.message,
				reactions: [],
				inboxId,
				onSave: handleSave,
				onBack: handleBackToConfiguration,
				editingMessage,
				disabled: state.saving,
			};
		}

		// Debug log para verificar o estado das reactions (throttled)
		const now = Date.now();
		if (now - lastLogTimes.current.debugReactions > 2000) {
			console.log("🔍 [InteractiveMessageCreator] Debug state.reactions:", state.reactions.length, "reactions");
			lastLogTimes.current.debugReactions = now;
		}

		const processedReactions = state.reactions.reduce(
			(acc, r) => {
				// Para cada reação, criar entradas separadas para emoji, texto e ação
				if (r.emoji) {
					acc.push({ buttonId: r.buttonId, reaction: { type: "emoji", value: r.emoji } });
				}

				// Considerar tanto textResponse (modelo interno) quanto textReaction (retorno da API)
				const textVal: any = (r as any).textResponse ?? (r as any).textReaction;
				if (typeof textVal === "string" && textVal.length > 0) {
					acc.push({ buttonId: r.buttonId, reaction: { type: "text", value: textVal } });
				}

				if (r.action) {
					// Throttle action logs para evitar spam
					const now = Date.now();
					if (now - lastLogTimes.current.actionReactions > 3000) {
						console.log("🎯 [InteractiveMessageCreator] Found action reaction:", r.action, "for button:", r.buttonId);
						lastLogTimes.current.actionReactions = now;
					}
					acc.push({ buttonId: r.buttonId, reaction: { type: "action", value: r.action } });
				}

				// Fallback para reações que só têm type definido
				if (
					!r.emoji &&
					(!textVal || textVal.length === 0) &&
					!r.action &&
					r.type &&
					(r.type === "emoji" || r.type === "text")
				) {
					const fallbackValue =
						r.type === "emoji" ? r.emoji || "" : ((r as any).textResponse ?? (r as any).textReaction ?? "");
					acc.push({ buttonId: r.buttonId, reaction: { type: r.type, value: fallbackValue } });
				}

				return acc;
			},
			[] as Array<{ buttonId: string; reaction: { type: "emoji" | "text" | "action"; value: string } }>,
		);

		// Throttle final processed reactions log
		if (Date.now() - lastLogTimes.current.processedReactions > 2000) {
			console.log("🎯 [InteractiveMessageCreator] Final processed reactions:", processedReactions.length, "processed");
			lastLogTimes.current.processedReactions = Date.now();
		}

		return {
			message: state.message,
			reactions: processedReactions,
			inboxId,
			onSave: handleSave,
			onBack: handleBackToConfiguration,
			editingMessage,
			disabled: state.saving,
		};
	}, [state.message, state.reactions, inboxId, handleSave, handleBackToConfiguration, editingMessage, state.saving]);

	return (
		<div className="space-y-6">
			<StepIndicator {...stepIndicatorProps} />

			{state.currentStep === "type-selection" && <TypeSelectionStep {...typeSelectionProps} />}

			{state.currentStep === "configuration" && <UnifiedEditingStep {...unifiedEditingProps} inboxId={inboxId} />}

			{state.currentStep === "preview" && <ReviewStep {...reviewProps} />}
		</div>
	);
};

export default InteractiveMessageCreator;
