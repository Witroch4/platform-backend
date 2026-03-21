"use client";

import { useState, useCallback, useEffect } from "react";
import { variableConverter } from "@/app/lib/variable-converter";

interface MtfDiamanteVariavel {
	id?: string;
	chave: string;
	valor: string;
}

interface FieldValidation {
	isValid: boolean;
	errors: string[];
}

interface TemplateValidationState {
	header: FieldValidation;
	body: FieldValidation;
	footer: FieldValidation;
	overall: FieldValidation;
}

interface UseTemplateValidationProps {
	headerText: string;
	bodyText: string;
	footerText: string;
	variables: MtfDiamanteVariavel[];
	headerType?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "NONE";
}

export const useTemplateValidation = ({
	headerText,
	bodyText,
	footerText,
	variables,
	headerType = "TEXT",
}: UseTemplateValidationProps) => {
	const [validation, setValidation] = useState<TemplateValidationState>({
		header: { isValid: true, errors: [] },
		body: { isValid: true, errors: [] },
		footer: { isValid: true, errors: [] },
		overall: { isValid: true, errors: [] },
	});

	// Validate individual fields
	const validateField = useCallback(
		(text: string, fieldName: string, maxLength?: number): FieldValidation => {
			const errors: string[] = [];

			// Basic validation using variable converter
			const variableValidation = variableConverter.validateTemplate(text);
			if (!variableValidation.isValid) {
				errors.push(...variableValidation.errors);
			}

			// Length validation
			if (maxLength && text.length > maxLength) {
				errors.push(`${fieldName} excede o limite de ${maxLength} caracteres (atual: ${text.length})`);
			}

			// Required field validation for body
			if (fieldName === "Corpo" && !text.trim()) {
				errors.push("O corpo da mensagem é obrigatório");
			}

			// Header specific validation
			if (fieldName === "Cabeçalho" && headerType === "TEXT" && text.length > 0 && text.length > 60) {
				errors.push("Cabeçalho de texto deve ter no máximo 60 caracteres");
			}

			return {
				isValid: errors.length === 0,
				errors,
			};
		},
		[headerType],
	);

	// Update validation when fields change
	useEffect(() => {
		const headerValidation =
			headerType === "TEXT" ? validateField(headerText, "Cabeçalho", 60) : { isValid: true, errors: [] };

		const bodyValidation = validateField(bodyText, "Corpo", 1024);
		const footerValidation = validateField(footerText, "Rodapé", 60);

		// Overall validation
		const allErrors = [...headerValidation.errors, ...bodyValidation.errors, ...footerValidation.errors];

		const overallValidation: FieldValidation = {
			isValid: allErrors.length === 0,
			errors: allErrors,
		};

		setValidation({
			header: headerValidation,
			body: bodyValidation,
			footer: footerValidation,
			overall: overallValidation,
		});
	}, [headerText, bodyText, footerText, headerType, validateField]);

	// Generate preview texts
	const getPreviewText = useCallback(
		(text: string, mode: "numbered" | "actual" = "numbered"): string => {
			if (!text) return "";

			if (mode === "actual") {
				return variableConverter.generatePreviewText(text, variables);
			} else {
				return variableConverter.generateNumberedPreviewText(text, variables);
			}
		},
		[variables],
	);

	// Get variable conversion for Meta API
	const getMetaConversion = useCallback(
		(text: string) => {
			return variableConverter.convertToMetaFormat(text, variables);
		},
		[variables],
	);

	// Get variable statistics
	const getVariableStats = useCallback((text: string) => {
		return variableConverter.getVariableStats(text);
	}, []);

	return {
		validation,
		getPreviewText,
		getMetaConversion,
		getVariableStats,
		isValid: validation.overall.isValid,
		errors: validation.overall.errors,
	};
};

export default useTemplateValidation;
