import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { InteractivePreview } from "@/app/mtf-diamante/components/shared/InteractivePreview";
import { useMemo } from "react";
import { resolveInteractiveMessagePreview } from "@/lib/whatsapp/variables-shared";
import { extractVariables } from "@/lib/whatsapp/variable-utils";
import type { InteractiveMessage, QuickReplyButton } from "@/types/interactive-messages";
import Image from "next/image";

interface TemplatePreviewProps {
	formState: any; // Idealmente, use um tipo mais específico
}

export const TemplatePreview = ({ formState }: TemplatePreviewProps) => {
	const buildVariablesMap = (): Record<string, string> => {
		const map: Record<string, string> = {};
		const headerVars = extractVariables(formState.headerText).map((v) => v.replace(/\{|\}/g, ""));
		if (formState.headerNamedExamples && Object.keys(formState.headerNamedExamples).length > 0) {
			for (const k of headerVars) {
				if (formState.headerNamedExamples[k]) map[k] = formState.headerNamedExamples[k];
			}
		} else if (headerVars.length > 0 && formState.headerExample) {
			headerVars.forEach((k) => (map[k] = formState.headerExample));
		}
		const bodyVars = extractVariables(formState.bodyText).map((v) => v.replace(/\{|\}/g, ""));
		if (formState.bodyNamedExamples && Object.keys(formState.bodyNamedExamples).length > 0) {
			for (const k of bodyVars) {
				if (formState.bodyNamedExamples[k]) map[k] = formState.bodyNamedExamples[k];
			}
		} else {
			bodyVars.forEach((k, i) => {
				const ex = formState.bodyExamples[i];
				if (ex) map[k] = ex;
			});
		}
		if (!map["nome_lead"]) map["nome_lead"] = "João";
		return map;
	};

	const buildPreviewMessage = (): InteractiveMessage => {
		const headerType = formState.headerType;
		const mediaFile =
			Array.isArray(formState.headerMetaMedia) && formState.headerMetaMedia.length > 0
				? formState.headerMetaMedia[0]
				: null;

		const header = (() => {
			if (headerType === "TEXT" && formState.headerText) {
				return { type: "text", content: formState.headerText } as const;
			}
			if (headerType === "IMAGE" && mediaFile?.url) {
				return { type: "image", content: "", mediaUrl: mediaFile.url } as const;
			}
			if (headerType === "VIDEO" && mediaFile?.url) {
				return { type: "video", content: "", mediaUrl: mediaFile.url } as const;
			}
			if (headerType === "DOCUMENT" && mediaFile?.url) {
				return {
					type: "document",
					content: mediaFile.file?.name || "Documento",
					mediaUrl: mediaFile.url,
					filename: mediaFile.file?.name,
				} as const;
			}
			return undefined;
		})();

		const body = { text: formState.bodyText || "" } as const;
		const footer = formState.footerText ? { text: formState.footerText } : undefined;

		const buttons: QuickReplyButton[] = Array.isArray(formState.buttons)
			? formState.buttons.map((b: any, index: number) => ({
					id: b.id || `btn_${index}`,
					title: b.text || `Botão ${index + 1}`,
					type: "reply",
					reply: { id: b.id || `btn_${index}`, title: b.text || `Botão ${index + 1}` },
				}))
			: [];

		// Mantém todos os botões no payload; o componente de preview decide como exibir (2 + "Ver todas as opções" quando > 3)
		const action = buttons.length > 0 ? ({ type: "button", buttons } as const) : undefined;

		return {
			name: formState.name || "preview-template",
			type: buttons.length > 0 ? "button" : "list",
			header: header as any,
			body: body as any,
			footer: footer as any,
			action: action as any,
			isActive: true,
		};
	};

	const resolvedPreviewMessage = useMemo(() => {
		const vars = buildVariablesMap();
		const msg = buildPreviewMessage();
		return resolveInteractiveMessagePreview(msg as any, vars, { defaultLeadExampleName: "João" });
	}, [formState]);

	const isEmptyTemplate = useMemo(() => {
		const noHeader =
			!formState.headerType ||
			formState.headerType === "NONE" ||
			(formState.headerType === "TEXT" && !formState.headerText) ||
			(["IMAGE", "VIDEO", "DOCUMENT"].includes(formState.headerType) &&
				(!formState.headerMetaMedia || formState.headerMetaMedia.length === 0));
		const noBody = !formState.bodyText || formState.bodyText.trim().length === 0;
		const noFooter = !formState.footerText || formState.footerText.trim().length === 0;
		const noButtons = !Array.isArray(formState.buttons) || formState.buttons.length === 0;
		return noHeader && noBody && noFooter && noButtons;
	}, [formState]);

	return (
		<Card className="sticky top-4">
			<CardHeader>
				<CardTitle>Prévia do modelo</CardTitle>
			</CardHeader>
			<CardContent>
				{isEmptyTemplate ? (
					<div className="w-full flex justify-center">
						<Image
							src="/exemplo-previa-do-modelo.png"
							alt="Prévia do modelo"
							width={320}
							height={560}
							className="rounded-md border"
							priority
						/>
					</div>
				) : (
					<InteractivePreview message={resolvedPreviewMessage as any} debounceMs={150} />
				)}
			</CardContent>
		</Card>
	);
};
