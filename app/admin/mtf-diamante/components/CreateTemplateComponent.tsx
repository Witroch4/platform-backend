"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Send, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useTemplateForm, TemplateFormState } from "@/hooks/useTemplateForm";
import { TemplateCategorySelector } from "../templates/criar/components/TemplateCategorySelector";
import { TemplateBasicInfo } from "../templates/criar/components/TemplateBasicInfo";
import { TemplateContentEditor } from "../templates/criar/components/TemplateContentEditor";
import { TemplatePreview } from "../templates/criar/components/TemplatePreview";
import { Stepper } from "@/components/custom"; // Stepper barrel export
import { InteractivePreview } from "@/app/admin/mtf-diamante/components/shared/InteractivePreview";
import { resolveInteractiveMessagePreview } from "@/lib/whatsapp/variables-shared";
import { extractVariables } from "@/lib/whatsapp/variable-utils";
import type { InteractiveMessage, QuickReplyButton } from "@/types/interactive-messages";

const initialFormState: TemplateFormState = {
	name: "",
	category: "MARKETING",
	language: "pt_BR",
	allowCategoryChange: false,
	headerType: "NONE",
	headerText: "",
	headerExample: "",
	headerNamedExamples: {},
	headerMetaMedia: [],
	bodyText: "",
	bodyExamples: [],
	bodyNamedExamples: {},
	footerText: "",
	buttons: [],
};

interface CreateTemplateComponentProps {
	onSuccess?: () => void;
}

export function CreateTemplateComponent({ onSuccess }: CreateTemplateComponentProps) {
	const router = useRouter();
	const [currentStep, setCurrentStep] = useState(0);
	const {
		state,
		isSubmitting,
		error,
		creationSuccess,
		templateId,
		isValidName,
		isFormValid,
		handleStateChange,
		handleNameChange,
		addButton,
		removeButton,
		updateButton,
		onDragEndButtons,
		createTemplate,
	} = useTemplateForm(initialFormState);

	const navigateBack = () => {
		console.log("Executando navigateBack");

		// Estratégia 1: Usar a função de callback se fornecida
		if (onSuccess) {
			console.log("Usando callback onSuccess");
			try {
				onSuccess();
				return;
			} catch (error) {
				console.error("Erro no callback onSuccess:", error);
			}
		}

		// Estratégia 2: Tentar usar router.push
		try {
			console.log("Tentando router.push");
			router.push("/admin/mtf-diamante");
		} catch (error) {
			console.error("Erro no router.push:", error);

			// Estratégia 3: Fallback para window.location
			try {
				console.log("Usando window.location como fallback");
				window.location.href = "/admin/mtf-diamante";
			} catch (fallbackError) {
				console.error("Erro no fallback:", fallbackError);

				// Estratégia 4: Último recurso - voltar na história
				try {
					console.log("Usando window.history.back");
					window.history.back();
				} catch (historyError) {
					console.error("Erro no history.back:", historyError);
					alert("Erro na navegação. Por favor, use o botão voltar do navegador.");
				}
			}
		}
	};

	// Prévia consolidada para a etapa 3
	const reviewPreviewMessage = useMemo(() => {
		if (!state) return null;

		// Construir mensagem interativa básica (estrutura interna tipada)
		const header =
			state.headerType !== "NONE"
				? ((): InteractiveMessage["header"] => {
						const media = (state.headerMetaMedia as any)[0];
						const type = state.headerType.toLowerCase() as "text" | "image" | "video" | "document";
						if (type === "text") {
							return { type, content: state.headerText };
						}
						const link = media?.link || "";
						return {
							type,
							content: link,
							mediaUrl: link,
							filename: media?.filename,
						};
					})()
				: undefined;

		const buttons: QuickReplyButton[] = (state.buttons || []).slice(0, 3).map((btn: any, index: number) => ({
			id: `button_${index + 1}`,
			title: btn?.text || `Opção ${index + 1}`,
		}));

		const message: InteractiveMessage = {
			name: state.name || "preview",
			type: "button",
			header,
			body: { text: state.bodyText || "" },
			footer: state.footerText ? { text: state.footerText } : undefined,
			action: { type: "button", buttons },
			isActive: true,
		};

		const variables = extractVariables(state.bodyText || "");
		const exampleValues = variables.reduce(
			(acc, variable) => {
				acc[variable] = `exemplo_${variable.toLowerCase()}`;
				return acc;
			},
			{} as Record<string, string>,
		);

		return resolveInteractiveMessagePreview(message, exampleValues);
	}, [state]);

	const steps = [
		{
			title: "Categoria",
			description: "Escolha a categoria do template",
		},
		{
			title: "Informações",
			description: "Defina nome e idioma",
		},
		{
			title: "Conteúdo",
			description: "Configure cabeçalho, corpo e rodapé",
		},
		{
			title: "Revisão",
			description: "Revise e envie para aprovação",
		},
	];

	const canProceedToStep = (step: number): boolean => {
		switch (step) {
			case 1:
				return Boolean(state.category);
			case 2:
				return Boolean(state.category && state.name && state.language && isValidName);
			case 3:
				return Boolean(state.category && state.name && state.language && isValidName && state.bodyText);
			case 4:
				return isFormValid;
			default:
				return true;
		}
	};

	const renderStepContent = () => {
		switch (currentStep) {
			case 0:
				return (
					<TemplateCategorySelector
						selectedCategory={state.category}
						onSelectCategory={(category) => handleStateChange("category", category)}
						onCancel={navigateBack}
					/>
				);
			case 1:
				return (
					<TemplateBasicInfo
						name={state.name}
						language={state.language}
						allowCategoryChange={state.allowCategoryChange}
						isValidName={isValidName}
						onNameChange={handleNameChange}
						onLanguageChange={(language) => handleStateChange("language", language)}
						onAllowCategoryChange={(allow) => handleStateChange("allowCategoryChange", allow)}
					/>
				);
			case 2:
				return (
					<TemplateContentEditor
						formState={state}
						onStateChange={(field, value) => handleStateChange(field as any, value as any)}
						onButtonChange={(buttons) => handleStateChange("buttons", buttons as any)}
					/>
				);
			case 3:
				return (
					<div className="space-y-6">
						<TemplatePreview formState={state} />

						{reviewPreviewMessage && (
							<div>
								<h3 className="text-lg font-medium mb-4">Prévia Interativa</h3>
								<InteractivePreview message={reviewPreviewMessage} className="max-w-md mx-auto" />
							</div>
						)}
					</div>
				);
			default:
				return null;
		}
	};

	return (
		<div className="p-6 space-y-6">
			<div className="flex items-center gap-4">
				<Button type="button" variant="outline" onClick={navigateBack} className="flex items-center gap-2">
					<ArrowLeft className="h-4 w-4" />
					Voltar
				</Button>
				<h1 className="text-2xl font-bold">Criar Novo Template</h1>
			</div>

			<Stepper
				steps={steps.map((s) => s.title)}
				currentStep={currentStep}
				onStepClick={(step: number) => {
					if (step <= currentStep || canProceedToStep(step)) {
						setCurrentStep(step);
					}
				}}
			/>

			{error && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertTitle>Erro</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<div className="min-h-[500px]">{renderStepContent()}</div>

			<div className="flex justify-between">
				<Button
					type="button"
					variant="outline"
					onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
					disabled={currentStep === 0}
				>
					Anterior
				</Button>

				{currentStep < steps.length - 1 ? (
					<Button
						type="button"
						onClick={() => setCurrentStep(currentStep + 1)}
						disabled={!canProceedToStep(currentStep + 1)}
					>
						Próximo
					</Button>
				) : (
					<Button type="button" onClick={createTemplate} disabled={isSubmitting || !isFormValid}>
						{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
						Enviar Template
					</Button>
				)}
			</div>

			{creationSuccess && templateId && <div className="mt-6">{/* Mensagem de sucesso */}</div>}
		</div>
	);
}
