"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
	validateVariable,
	ensureSpecialVariables,
	getAutoFooter,
	getCompanyName,
	getPixKey,
	filterVariablesByType,
	type MtfDiamanteVariavel,
} from "@/app/lib/variable-utils";

interface UseVariableManagerReturn {
	// Variables data
	variables: MtfDiamanteVariavel[];
	specialVariables: MtfDiamanteVariavel[];
	customVariables: MtfDiamanteVariavel[];

	// Loading states
	loading: boolean;
	saving: boolean;

	// Variable operations
	refreshVariables: () => Promise<void>;
	saveVariables: (variables: MtfDiamanteVariavel[]) => Promise<boolean>;
	validateAllVariables: (variables: MtfDiamanteVariavel[]) => { isValid: boolean; errors: string[] };

	// Utility functions
	getAutoFooter: (currentFooter?: string) => string;
	getCompanyName: () => string;
	getPixKey: () => string;

	// Template helpers
	createTemplateWithAutoFooter: (
		header: string,
		body: string,
		footer: string,
	) => {
		header: string;
		body: string;
		footer: string;
	};
}

/**
 * Custom hook for centralized variable management
 * Provides automatic footer population and variable validation
 */
export function useVariableManager(): UseVariableManagerReturn {
	const [variables, setVariables] = useState<MtfDiamanteVariavel[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const loadedRef = useRef(false);
	const inflightRef = useRef<Promise<void> | null>(null);

	// Load variables from API
	const refreshVariables = useCallback(async () => {
		try {
			if (inflightRef.current) {
				await inflightRef.current; // await ongoing request
				return;
			}
			setLoading(true);
			inflightRef.current = (async () => {
				const response = await fetch("/api/admin/mtf-diamante/variaveis");

				if (!response.ok) {
					throw new Error("Failed to load variables");
				}

				const data = await response.json();
				const loadedVariables = ensureSpecialVariables(data.data || []);
				setVariables(loadedVariables);
				loadedRef.current = true;
			})();
			await inflightRef.current;
		} catch (error: unknown) {
			console.error("Error loading variables:", error);
			toast.error("Failed to load variables");
			// Set default special variables if loading fails
			setVariables(ensureSpecialVariables([]));
		} finally {
			setLoading(false);
			inflightRef.current = null;
		}
	}, []);

	// Save variables to API
	const saveVariables = useCallback(
		async (variablesToSave: MtfDiamanteVariavel[]): Promise<boolean> => {
			try {
				setSaving(true);

				// Validate all variables before saving
				const validation = validateAllVariables(variablesToSave);
				if (!validation.isValid) {
					toast.error(`Validation errors: ${validation.errors.join(", ")}`);
					return false;
				}

				// Ensure special variables are present
				const specialVariables = ["chave_pix", "nome_do_escritorio_rodape"];
				const missingSpecialVars = specialVariables.filter(
					(special) => !variablesToSave.some((v) => v.chave === special && v.valor.trim()),
				);

				if (missingSpecialVars.length > 0) {
					toast.error(`Missing required special variables: ${missingSpecialVars.join(", ")}`);
					return false;
				}

				const response = await fetch("/api/admin/mtf-diamante/variaveis", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						variaveis: variablesToSave.map((v) => ({
							chave: v.chave.trim(),
							valor: v.valor.trim(),
						})),
					}),
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.error || "Failed to save variables");
				}

				toast.success("Variables saved successfully!");
				await refreshVariables(); // Reload variables after saving
				return true;
			} catch (error: unknown) {
				console.error("Error saving variables:", error);
				const message = error instanceof Error ? error.message : "Failed to save variables";
				toast.error(message);
				return false;
			} finally {
				setSaving(false);
			}
		},
		[refreshVariables],
	);

	// Validate all variables
	const validateAllVariables = useCallback((variablesToValidate: MtfDiamanteVariavel[]) => {
		const allErrors: string[] = [];

		variablesToValidate.forEach((variable) => {
			if (variable.chave.trim() || variable.valor.trim()) {
				const validation = validateVariable(variable);
				if (!validation.isValid) {
					allErrors.push(...validation.errors);
				}
			}
		});

		return {
			isValid: allErrors.length === 0,
			errors: allErrors,
		};
	}, []);

	// Get automatic footer with company name
	const getAutoFooterForTemplate = useCallback(
		(currentFooter?: string): string => {
			return getAutoFooter(variables, currentFooter);
		},
		[variables],
	);

	// Get company name
	const getCompanyNameValue = useCallback((): string => {
		return getCompanyName(variables);
	}, [variables]);

	// Get PIX key
	const getPixKeyValue = useCallback((): string => {
		return getPixKey(variables);
	}, [variables]);

	// Create template with automatic footer population
	const createTemplateWithAutoFooter = useCallback(
		(header: string, body: string, footer: string) => {
			return {
				header,
				body,
				footer: getAutoFooterForTemplate(footer),
			};
		},
		[getAutoFooterForTemplate],
	);

	// Load variables on mount
	useEffect(() => {
		refreshVariables();
	}, [refreshVariables]);

	// Derived values
	const specialVariables = filterVariablesByType(variables, "special");
	const customVariables = filterVariablesByType(variables, "custom");

	return {
		// Variables data
		variables,
		specialVariables,
		customVariables,

		// Loading states
		loading,
		saving,

		// Variable operations
		refreshVariables,
		saveVariables,
		validateAllVariables,

		// Utility functions
		getAutoFooter: getAutoFooterForTemplate,
		getCompanyName: getCompanyNameValue,
		getPixKey: getPixKeyValue,

		// Template helpers
		createTemplateWithAutoFooter,
	};
}

export default useVariableManager;
