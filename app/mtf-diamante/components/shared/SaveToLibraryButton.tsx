"use client";

import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Library, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

interface SaveToLibraryButtonProps {
	templateData: {
		name: string;
		category: string;
		language: string;
		headerType: string;
		headerText: string;
		bodyText: string;
		footerText: string;
		buttons: any[];
		headerMetaMedia: any[];
	};
	disabled?: boolean;
	messageType?: "template" | "interactive_message";
}

export const SaveToLibraryButton: React.FC<SaveToLibraryButtonProps> = ({
	templateData,
	disabled = false,
	messageType = "template",
}) => {
	const { data: session } = useSession();
	const [saving, setSaving] = useState(false);

	const isSuperAdmin = session?.user?.role === "SUPERADMIN";

	// Only show button for SUPERADMIN users
	if (!isSuperAdmin) {
		return null;
	}

	const handleSaveToLibrary = async () => {
		if (!session?.user?.id) {
			toast.error("Você deve estar logado para salvar na biblioteca");
			return;
		}

		if (!templateData.name || !templateData.bodyText) {
			toast.error("Nome e texto do corpo são obrigatórios");
			return;
		}

		try {
			setSaving(true);

			const response = await fetch("/api/admin/templates/save-to-library", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					templateData,
					messageType,
				}),
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || "Falha ao salvar na biblioteca");
			}

			toast.success(result.message);
		} catch (error) {
			console.error("Erro ao salvar na biblioteca:", error);
			toast.error("Falha ao salvar na biblioteca");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Button
			variant="outline"
			onClick={handleSaveToLibrary}
			disabled={disabled || saving}
			className="flex items-center gap-2"
		>
			{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Library className="h-4 w-4" />}
			{saving ? "Salvando..." : "Salvar na Biblioteca"}
		</Button>
	);
};
