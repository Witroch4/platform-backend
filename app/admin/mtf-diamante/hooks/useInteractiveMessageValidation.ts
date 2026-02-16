"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { debounce } from "lodash";
import type { InteractiveMessage, ButtonReaction, QuickReplyButton } from "@/types/interactive-messages";
import {
	InteractiveMessageValidator,
	type ValidationResult,
	type FieldValidationResult,
	type ValidationError,
	type ValidationContext,
} from "@/lib/validation/interactive-message-validation";
import { errorHandler, type StructuredError } from "@/lib/error-handling/interactive-message-errors";

// Hook state interface
interface ValidationState {
	isValidating: boolean;
	lastValidated: Date | null;
	messageValidation: ValidationResult | null;
	fieldValidations: Record<string, FieldValidationResult>;
	isDirty: boolean;
	hasErrors: boolean;
	hasWarnings: boolean;
}

// Hook configuration
interface UseValidationConfig {
	enableRealTimeValidation: boolean;
	debounceMs: number;
	validateOnMount: boolean;
	context?: ValidationContext;
}

// Default configuration
const DEFAULT_CONFIG: UseValidationConfig = {
	enableRealTimeValidation: true,
	debounceMs: 300,
	validateOnMount: false,
};

// Hook return interface
interface UseInteractiveMessageValidationReturn {
	// State
	validationState: ValidationState;

	// Validation functions
	validateMessage: (message: InteractiveMessage) => Promise<ValidationResult>;
	validateField: (fieldName: string, value: any, message: InteractiveMessage) => FieldValidationResult;
	validateButtonReactions: (reactions: ButtonReaction[], buttons: QuickReplyButton[]) => ValidationResult;

	// Utility functions
	clearValidation: () => void;
	isFieldValid: (fieldName: string) => boolean;
	getFieldErrors: (fieldName: string) => ValidationError[];
	getFieldWarnings: (fieldName: string) => ValidationError[];
	canProceed: () => boolean;

	// Error handling
	handleValidationError: (error: any) => StructuredError;
}

export const useInteractiveMessageValidation = (
	message: InteractiveMessage,
	reactions: ButtonReaction[] = [],
	config: Partial<UseValidationConfig> = {},
): UseInteractiveMessageValidationReturn => {
	const finalConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

	// Throttling para logs repetitivos
	const lastLogTimes = useRef({
		canProceedOK: 0,
		canProceedError: 0,
	});

	// State management
	const [validationState, setValidationState] = useState<ValidationState>({
		isValidating: false,
		lastValidated: null,
		messageValidation: null,
		fieldValidations: {},
		isDirty: false,
		hasErrors: false,
		hasWarnings: false,
	});

	// Extract buttons from message for reaction validation
	const buttons = useMemo(() => {
		if (message.action?.type === "button") {
			return message.action.buttons || [];
		}
		return [];
	}, [message.action]);

	// Debounced validation function
	const debouncedValidateMessage = useMemo(
		() =>
			debounce(async (messageToValidate: InteractiveMessage) => {
				if (!finalConfig.enableRealTimeValidation) return;

				setValidationState((prev) => ({ ...prev, isValidating: true }));

				try {
					const result = InteractiveMessageValidator.validateMessage(messageToValidate, finalConfig.context);
					const reactionResult = InteractiveMessageValidator.validateButtonReactions(reactions, buttons);

					// Combine message and reaction validation results
					const combinedResult: ValidationResult = {
						isValid: result.isValid && reactionResult.isValid,
						errors: [...result.errors, ...reactionResult.errors],
						warnings: [...result.warnings, ...reactionResult.warnings],
					};
					if (process.env.NODE_ENV !== "production") {
						// Log inteligente para validação
						const summary = {
							status: combinedResult.isValid ? "✅ VÁLIDO" : "❌ INVÁLIDO",
							type: messageToValidate.type,
							name: messageToValidate.name?.slice(0, 20) + (messageToValidate.name?.length > 20 ? "..." : ""),
							body: `${messageToValidate.body?.text?.length || 0} chars`,
							buttons: Array.isArray((messageToValidate as any)?.action?.buttons)
								? (messageToValidate as any).action.buttons.length
								: 0,
							errors: combinedResult.errors.length,
							warnings: combinedResult.warnings.length,
						};
						console.log("🔍 [Validation] Resultado:", summary);

						// Log específico para erros detalhados
						if (combinedResult.errors.length > 0) {
							console.group("🚨 [Validation] Erros encontrados:");
							combinedResult.errors.forEach((err) => {
								console.warn(`❌ ${err.field}: ${err.message}`);
							});
							console.groupEnd();
						}
					}

					setValidationState((prev) => ({
						...prev,
						isValidating: false,
						lastValidated: new Date(),
						messageValidation: combinedResult,
						hasErrors: combinedResult.errors.length > 0,
						hasWarnings: combinedResult.warnings.length > 0,
						isDirty: true,
					}));
				} catch (error) {
					const structuredError = errorHandler.handleError(error, {
						component: "useInteractiveMessageValidation",
						action: "validateMessage",
					});

					setValidationState((prev) => ({
						...prev,
						isValidating: false,
						hasErrors: true,
					}));

					console.error("Validation error:", structuredError);
				}
			}, finalConfig.debounceMs),
		[finalConfig.enableRealTimeValidation, finalConfig.debounceMs, finalConfig.context, reactions, buttons],
	);

	// Main validation function
	const validateMessage = useCallback(
		async (messageToValidate: InteractiveMessage): Promise<ValidationResult> => {
			setValidationState((prev) => ({ ...prev, isValidating: true }));

			try {
				const result = InteractiveMessageValidator.validateMessage(messageToValidate, finalConfig.context);
				const reactionResult = InteractiveMessageValidator.validateButtonReactions(reactions, buttons);

				// Combine results
				const combinedResult: ValidationResult = {
					isValid: result.isValid && reactionResult.isValid,
					errors: [...result.errors, ...reactionResult.errors],
					warnings: [...result.warnings, ...reactionResult.warnings],
				};
				if (process.env.NODE_ENV !== "production") {
					console.log("[Validation][immediate] result", {
						isValid: combinedResult.isValid,
						errors: combinedResult.errors,
						warnings: combinedResult.warnings,
						messageSummary: {
							id: (messageToValidate as any)?.id,
							name: messageToValidate.name,
							type: messageToValidate.type,
							bodyLen: messageToValidate.body?.text?.length ?? 0,
							headerType: messageToValidate.header?.type,
							hasHeader: !!messageToValidate.header,
							hasFooter: !!messageToValidate.footer,
							buttonsCount: Array.isArray((messageToValidate as any)?.action?.buttons)
								? (messageToValidate as any).action.buttons.length
								: 0,
						},
					});
				}

				setValidationState((prev) => ({
					...prev,
					isValidating: false,
					lastValidated: new Date(),
					messageValidation: combinedResult,
					hasErrors: combinedResult.errors.length > 0,
					hasWarnings: combinedResult.warnings.length > 0,
					isDirty: true,
				}));

				return combinedResult;
			} catch (error) {
				const structuredError = errorHandler.handleError(error, {
					component: "useInteractiveMessageValidation",
					action: "validateMessage",
				});

				setValidationState((prev) => ({
					...prev,
					isValidating: false,
					hasErrors: true,
				}));

				throw structuredError;
			}
		},
		[finalConfig.context, reactions, buttons],
	);

	// Field validation function
	const validateField = useCallback(
		(fieldName: string, value: any, messageToValidate: InteractiveMessage): FieldValidationResult => {
			try {
				const result = InteractiveMessageValidator.validateField(
					fieldName,
					value,
					messageToValidate,
					finalConfig.context,
				);
				if (process.env.NODE_ENV !== "production") {
					const summary = {
						campo: fieldName,
						valido: result.isValid ? "✅" : "❌",
						erros: result.errors.length,
						warnings: result.warnings.length,
					};
					if (!result.isValid) {
						console.log(
							"🔍 [Field]",
							summary,
							result.errors.map((e) => e.message),
						);
					}
				}

				setValidationState((prev) => ({
					...prev,
					fieldValidations: {
						...prev.fieldValidations,
						[fieldName]: result,
					},
					isDirty: true,
				}));

				return result;
			} catch (error) {
				const structuredError = errorHandler.handleError(error, {
					component: "useInteractiveMessageValidation",
					action: "validateField",
					messageId: messageToValidate.id,
				});

				const errorResult: FieldValidationResult = {
					field: fieldName,
					isValid: false,
					errors: [
						{
							field: fieldName,
							code: "VALIDATION_ERROR",
							message: "Validation failed",
							severity: "error",
						},
					],
					warnings: [],
				};

				setValidationState((prev) => ({
					...prev,
					fieldValidations: {
						...prev.fieldValidations,
						[fieldName]: errorResult,
					},
					hasErrors: true,
					isDirty: true,
				}));

				return errorResult;
			}
		},
		[finalConfig.context],
	);

	// Button reactions validation
	const validateButtonReactions = useCallback(
		(reactionsToValidate: ButtonReaction[], buttonsToValidate: QuickReplyButton[]): ValidationResult => {
			try {
				return InteractiveMessageValidator.validateButtonReactions(reactionsToValidate, buttonsToValidate);
			} catch (error) {
				const structuredError = errorHandler.handleError(error, {
					component: "useInteractiveMessageValidation",
					action: "validateButtonReactions",
				});

				throw structuredError;
			}
		},
		[],
	);

	// Clear validation state
	const clearValidation = useCallback(() => {
		setValidationState({
			isValidating: false,
			lastValidated: null,
			messageValidation: null,
			fieldValidations: {},
			isDirty: false,
			hasErrors: false,
			hasWarnings: false,
		});
	}, []);

	// Utility functions
	const isFieldValid = useCallback(
		(fieldName: string): boolean => {
			const fieldValidation = validationState.fieldValidations[fieldName];
			if (!fieldValidation) return true;
			return fieldValidation.isValid;
		},
		[validationState.fieldValidations],
	);

	const getFieldErrors = useCallback(
		(fieldName: string): ValidationError[] => {
			const fieldValidation = validationState.fieldValidations[fieldName];
			if (!fieldValidation) return [];
			return fieldValidation.errors;
		},
		[validationState.fieldValidations],
	);

	const getFieldWarnings = useCallback(
		(fieldName: string): ValidationError[] => {
			const fieldValidation = validationState.fieldValidations[fieldName];
			if (!fieldValidation) return [];
			return fieldValidation.warnings;
		},
		[validationState.fieldValidations],
	);

	const canProceed = useCallback((): boolean => {
		// Check if there are any validation errors
		if (validationState.hasErrors) {
			if (process.env.NODE_ENV !== "production") {
				console.log("🔴 [canProceed] Bloqueado por erros de validação", {
					hasErrors: validationState.hasErrors,
					totalErrors: validationState.messageValidation?.errors?.length || 0,
				});
			}
			return false;
		}

		// Check field validations
		const fieldValidationsWithErrors = Object.entries(validationState.fieldValidations)
			.filter(([, validation]) => !validation.isValid)
			.map(([field, validation]) => ({ field, errorsCount: validation.errors.length }));

		const hasFieldErrors = fieldValidationsWithErrors.length > 0;
		if (hasFieldErrors && process.env.NODE_ENV !== "production") {
			const now = Date.now();
			if (now - lastLogTimes.current.canProceedError > 2000) {
				console.log("🔴 [canProceed] Bloqueado por erros de campo:", fieldValidationsWithErrors);
				lastLogTimes.current.canProceedError = now;
			}
		}

		if (process.env.NODE_ENV !== "production" && !hasFieldErrors && !validationState.hasErrors) {
			const now = Date.now();
			if (now - lastLogTimes.current.canProceedOK > 1500) {
				// Throttle mais agressivo para este log
				console.log("✅ [canProceed] Todas validações OK - pode prosseguir");
				lastLogTimes.current.canProceedOK = now;
			}
		}

		return !hasFieldErrors;
	}, [validationState.hasErrors, validationState.fieldValidations, validationState.messageValidation]);

	const handleValidationError = useCallback(
		(error: any): StructuredError => {
			return errorHandler.handleValidationError(error, {
				component: "useInteractiveMessageValidation",
				messageId: message.id,
			});
		},
		[message.id],
	);

	// Effect for real-time validation
	useEffect(() => {
		if (finalConfig.enableRealTimeValidation && validationState.isDirty) {
			debouncedValidateMessage(message);
		}

		return () => {
			debouncedValidateMessage.cancel();
		};
	}, [message, debouncedValidateMessage, finalConfig.enableRealTimeValidation, validationState.isDirty]);

	// Effect for validation on mount
	useEffect(() => {
		if (finalConfig.validateOnMount) {
			validateMessage(message);
		}
	}, [finalConfig.validateOnMount]); // Only run on mount

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			debouncedValidateMessage.cancel();
		};
	}, [debouncedValidateMessage]);

	return {
		validationState,
		validateMessage,
		validateField,
		validateButtonReactions,
		clearValidation,
		isFieldValid,
		getFieldErrors,
		getFieldWarnings,
		canProceed,
		handleValidationError,
	};
};

export default useInteractiveMessageValidation;
