/**
 * Example usage of VariableConverter in the MTF Diamante application
 * This file demonstrates how to integrate the VariableConverter with the existing system
 */

import { VariableConverter, type MtfDiamanteVariavel } from "./variable-converter";

// Example: How to use VariableConverter in template creation API
export async function processTemplateForMetaAPI(
	templateText: string,
	variables: MtfDiamanteVariavel[],
): Promise<{
	metaApiPayload: {
		name: string;
		language: string;
		category: string;
		components: Array<{
			type: string;
			text: string;
			parameters?: Array<{ type: string; text: string }>;
		}>;
	};
	parameterArray: string[];
}> {
	const converter = new VariableConverter();

	// Validate template before processing
	const validation = converter.validateTemplate(templateText);
	if (!validation.isValid) {
		throw new Error(`Template validation failed: ${validation.errors.join(", ")}`);
	}

	// Convert to Meta API format
	const conversion = converter.convertToMetaFormat(templateText, variables);

	// Create Meta API payload structure
	const metaApiPayload = {
		name: "template_name", // This would come from the actual template name
		language: "pt_BR",
		category: "MARKETING",
		components: [
			{
				type: "BODY",
				text: conversion.convertedText,
				parameters: conversion.parameterArray.map((value, index) => ({
					type: "TEXT",
					text: `{{${index + 1}}}`,
				})),
			},
		],
	};

	return {
		metaApiPayload,
		parameterArray: conversion.parameterArray,
	};
}

// Example: How to use VariableConverter for template preview
export function generateTemplatePreview(
	templateText: string,
	variables: MtfDiamanteVariavel[],
	previewMode: "actual_values" | "numbered_examples" = "actual_values",
): string {
	const converter = new VariableConverter();

	if (previewMode === "actual_values") {
		return converter.generatePreviewText(templateText, variables);
	} else {
		return converter.generateNumberedPreviewText(templateText, variables);
	}
}

// Example: How to validate template input in real-time
export function validateTemplateInput(templateText: string): {
	isValid: boolean;
	errors: string[];
	stats: {
		totalVariables: number;
		uniqueVariables: number;
		variableNames: string[];
	};
} {
	const converter = new VariableConverter();

	const validation = converter.validateTemplate(templateText);
	const stats = converter.getVariableStats(templateText);

	return {
		isValid: validation.isValid,
		errors: validation.errors,
		stats: {
			totalVariables: stats.totalVariables,
			uniqueVariables: stats.uniqueVariables,
			variableNames: stats.variableNames,
		},
	};
}

// Example: How to extract variables for context menu
export function getAvailableVariablesForContextMenu(
	templateText: string,
	allVariables: MtfDiamanteVariavel[],
): {
	usedVariables: string[];
	availableVariables: MtfDiamanteVariavel[];
	suggestedVariables: MtfDiamanteVariavel[];
} {
	const converter = new VariableConverter();

	const usedVariables = converter.extractVariables(templateText);
	const availableVariables = allVariables.filter((v) => !usedVariables.includes(v.chave));

	// Suggest commonly used variables
	const commonVariables = ["chave_pix", "nome_do_escritorio_rodape", "protocolo"];
	const suggestedVariables = allVariables.filter(
		(v) => commonVariables.includes(v.chave) && !usedVariables.includes(v.chave),
	);

	return {
		usedVariables,
		availableVariables,
		suggestedVariables,
	};
}
