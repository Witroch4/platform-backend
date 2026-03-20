"use client";

import type React from "react";
import { useState, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	ChevronLeft,
	Save,
	Loader2,
	CheckCircle,
	AlertCircle,
	Eye,
	Zap,
	MessageSquare,
	Info,
	Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMtfData } from "@/app/admin/mtf-diamante/context/MtfDataProvider";

// Import existing components
import { InteractivePreview } from "../shared/InteractivePreview";

// Import types
import type { InteractiveMessage, ButtonReaction, QuickReplyButton } from "@/types/interactive-messages";

// Updated ButtonReaction interface to match the unified structure
interface UnifiedButtonReaction {
	buttonId: string;
	reaction?: {
		type: "emoji" | "text" | "action";
		value: string;
	};
}

interface ReviewStepProps {
	message: InteractiveMessage;
	reactions: UnifiedButtonReaction[];
	inboxId: string;
	onSave?: (savedMessage: InteractiveMessage) => void;
	onBack: () => void;
	editingMessage?: InteractiveMessage;
	disabled?: boolean;
	className?: string;
}

interface SaveState {
	saving: boolean;
	success: boolean;
	error: string | null;
}

// Helper function to format reaction display
const formatReactionDisplay = (reaction: UnifiedButtonReaction): string => {
	if (!reaction.reaction) return "No reaction";

	if (reaction.reaction.type === "emoji") {
		return `React with ${reaction.reaction.value}`;
	} else if (reaction.reaction.type === "text") {
		return `Reply: "${reaction.reaction.value}"`;
	} else if (reaction.reaction.type === "action") {
		return reaction.reaction.value === "handoff" ? "🚨 Transfer to agent" : `Action: ${reaction.reaction.value}`;
	}
	return "Unknown reaction";
};

// Helper function to get message type display name
const getMessageTypeDisplay = (type: string): string => {
	const typeMap: Record<string, string> = {
		button: "Quick Reply Buttons",
		list: "List Picker",
		cta_url: "Call-to-Action URL",
		flow: "WhatsApp Flow",
		location_request: "Location Request",
		location: "Send Location",
		reaction: "React to Message",
		sticker: "Send Sticker",
		product: "Product Message",
		product_list: "Product List",
	};
	return typeMap[type] || type;
};

export const ReviewStep: React.FC<ReviewStepProps> = ({
	message,
	reactions,
	inboxId,
	onSave,
	onBack,
	editingMessage,
	disabled = false,
	className,
}) => {
	const [saveState, setSaveState] = useState<SaveState>({
		saving: false,
		success: false,
		error: null,
	});

	// 🛡️ Proteção contra múltiplas chamadas simultâneas
	const isProcessingRef = useRef(false);

	// Extract buttons from message action
	const buttons = useMemo(() => {
		if (message.action?.type === "button") {
			return message.action.buttons || [];
		}
		return [];
	}, [message.action]);

	// Filter reactions that have actual reaction configurations
	const configuredReactions = useMemo(() => {
		return reactions.filter((reaction) => reaction.reaction);
	}, [reactions]);

	// Calculate summary statistics
	const summaryStats = useMemo(() => {
		const hasHeader = Boolean(message.header?.content);
		const hasFooter = Boolean(message.footer?.text);
		const buttonCount = buttons.length;
		const reactionCount = configuredReactions.length;

		return {
			hasHeader,
			hasFooter,
			buttonCount,
			reactionCount,
			hasReactions: reactionCount > 0,
		};
	}, [message, buttons, configuredReactions]);

	// Handle save operation with unified API
	const handleSave = useCallback(async () => {
		// 🛡️ Proteção contra múltiplas chamadas simultâneas
		if (saveState.saving || isProcessingRef.current) {
			console.log("🚫 [ReviewStep] Tentativa de salvar bloqueada - já processando");
			return;
		}

		// Marca como processando IMEDIATAMENTE para evitar race conditions
		isProcessingRef.current = true;

		setSaveState({
			saving: true,
			success: false,
			error: null,
		});

		try {
			// Normalize action for API expectations (flatten CTA URL)
			let normalizedAction: any = message.action;
			if (message.type === "cta_url") {
				const a: any = message.action || {};
				const inner = a.action || a;
				const displayText = inner?.displayText || "";
				const url = inner?.url || "";
				normalizedAction = {
					type: "cta_url",
					action: { displayText, url },
					displayText,
					url,
				};
			}

			// 2. O objeto SIMPLIFICADO que será usado para a UI imediata.
			const optimisticUIData = {
				id: editingMessage?.id || `temp-${Date.now()}`,
				name: message.name,
				type: message.type,
				header: message.header,
				body: message.body,
				footer: message.footer,
				action: normalizedAction,
				isActive: true, // Adiciona a propriedade obrigatória
				reactions: reactions, // ✅ FIX: Incluir as reações recebidas via props
				interactiveContent: {
					header: message.header,
					body: message.body,
					footer: message.footer,
					action: normalizedAction,
				},
				// Compatibilidade v1
				nome: message.name,
				texto: message.body.text,
				headerTipo: message.header?.type,
				headerConteudo: message.header?.content,
				rodape: message.footer?.text,
				botoes:
					normalizedAction?.buttons?.map((btn: any) => ({
						id: btn.id,
						titulo: btn.title,
					})) || [],
			};

			console.log("🚀 [ReviewStep] Delegando salvamento para componente pai via onSave callback");

			// ✅ CORREÇÃO: Delegar para o componente pai em vez de chamar a API diretamente
			// Isso evita double-submit pois só o MensagensInterativasTab.handleSaveMessage chama a API
			setSaveState({ saving: false, success: true, error: null });
			toast.success(editingMessage ? "Mensagem atualizada!" : "Mensagem salva!");

			// Sinaliza para o componente pai que pode fechar a tela.
			if (onSave) {
				onSave(optimisticUIData);
			}

			// Libera o lock de processamento após sucesso
			isProcessingRef.current = false;
		} catch (error) {
			console.error("[ReviewStep] Falha ao salvar:", error);
			const errorMessage = error instanceof Error ? error.message : "Um erro inesperado ocorreu.";
			setSaveState({ saving: false, success: false, error: errorMessage });
			toast.error(errorMessage);

			// Libera o lock de processamento após erro
			isProcessingRef.current = false;
		}
	}, [message, reactions, inboxId, editingMessage, onSave, saveState.saving]);

	// Validation check
	const canSave = useMemo(() => {
		return Boolean(
			message.name?.trim() && message.body?.text?.trim() && !saveState.saving && !isProcessingRef.current, // Adiciona verificação do ref
		);
	}, [message.name, message.body?.text, saveState.saving]);

	// Função para limpar o estado de erro e permitir ao usuário continuar
	const clearError = useCallback(() => {
		setSaveState((prev) => ({ ...prev, error: null }));
		isProcessingRef.current = false; // Garante que o lock seja liberado
	}, []);

	return (
		<div className={cn("space-y-6", className)}>
			{/* Step Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold">Review & Save Message</h2>
					<p className="text-sm text-muted-foreground">Review your message configuration before saving</p>
				</div>
				<Badge variant="outline" className="text-xs">
					Step 3 of 3
				</Badge>
			</div>

			{/* Success/Error Alerts */}
			{saveState.success && (
				<Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
					<CheckCircle className="h-4 w-4 text-green-600" />
					<AlertDescription className="text-green-700 dark:text-green-300">
						Message {editingMessage ? "updated" : "saved"} successfully! All configurations have been applied.
					</AlertDescription>
				</Alert>
			)}

			{saveState.error && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription className="flex items-center justify-between">
						<span>{saveState.error}</span>
						<div className="flex items-center gap-2 ml-4">
							<Button variant="outline" onClick={clearError} className="text-xs">
								Limpar Erro
							</Button>
							<Button variant="ghost" onClick={onBack} className="text-xs">
								Voltar
							</Button>
						</div>
					</AlertDescription>
				</Alert>
			)}

			{/* Main Content */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Left Panel - Message Summary */}
				<div className="space-y-6">
					{/* Message Configuration Summary */}
					<Card>
						<CardHeader>
							<CardTitle className="text-base flex items-center gap-2">
								<MessageSquare className="h-4 w-4" />
								Message Summary
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{/* Basic Info */}
							<div className="grid grid-cols-2 gap-4 text-sm">
								<div>
									<span className="font-medium text-muted-foreground">Name:</span>
									<p className="font-medium">{message.name}</p>
								</div>
								<div>
									<span className="font-medium text-muted-foreground">Type:</span>
									<p className="font-medium">{getMessageTypeDisplay(message.type)}</p>
								</div>
							</div>

							{/* Content Summary */}
							<div className="space-y-3">
								<div className="flex items-center gap-2">
									<span className="text-sm font-medium text-muted-foreground">Content Components:</span>
								</div>

								<div className="grid grid-cols-2 gap-2 text-xs">
									<div
										className={cn(
											"flex items-center gap-2 p-2 rounded-md",
											summaryStats.hasHeader ? "bg-green-50 dark:bg-green-900/20" : "bg-gray-50 dark:bg-gray-800",
										)}
									>
										<div
											className={cn("w-2 h-2 rounded-full", summaryStats.hasHeader ? "bg-green-500" : "bg-gray-400")}
										/>
										<span>Header {summaryStats.hasHeader ? "✓" : "✗"}</span>
									</div>

									<div className="flex items-center gap-2 p-2 rounded-md bg-green-50 dark:bg-green-900/20">
										<div className="w-2 h-2 rounded-full bg-green-500" />
										<span>Body ✓</span>
									</div>

									<div
										className={cn(
											"flex items-center gap-2 p-2 rounded-md",
											summaryStats.hasFooter ? "bg-green-50 dark:bg-green-900/20" : "bg-gray-50 dark:bg-gray-800",
										)}
									>
										<div
											className={cn("w-2 h-2 rounded-full", summaryStats.hasFooter ? "bg-green-500" : "bg-gray-400")}
										/>
										<span>Footer {summaryStats.hasFooter ? "✓" : "✗"}</span>
									</div>

									<div
										className={cn(
											"flex items-center gap-2 p-2 rounded-md",
											summaryStats.buttonCount > 0 ? "bg-green-50 dark:bg-green-900/20" : "bg-gray-50 dark:bg-gray-800",
										)}
									>
										<div
											className={cn(
												"w-2 h-2 rounded-full",
												summaryStats.buttonCount > 0 ? "bg-green-500" : "bg-gray-400",
											)}
										/>
										<span>Buttons ({summaryStats.buttonCount})</span>
									</div>
								</div>
							</div>

							{/* Character Counts */}
							<div className="pt-2 border-t">
								<div className="text-xs text-muted-foreground space-y-1">
									<div className="flex justify-between">
										<span>Body text:</span>
										<Badge variant="outline" className="text-xs">
											{message.body.text.length}/1024
										</Badge>
									</div>
									{message.header?.type === "text" && message.header.content && (
										<div className="flex justify-between">
											<span>Header text:</span>
											<Badge variant="outline" className="text-xs">
												{message.header.content.length}/60
											</Badge>
										</div>
									)}
									{message.footer?.text && (
										<div className="flex justify-between">
											<span>Footer text:</span>
											<Badge variant="outline" className="text-xs">
												{message.footer.text.length}/60
											</Badge>
										</div>
									)}
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Reaction Configuration Summary */}
					{summaryStats.buttonCount > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base flex items-center gap-2">
									<Zap className="h-4 w-4" />
									Automatic Reactions
									{summaryStats.hasReactions && (
										<Badge variant="secondary" className="text-xs">
											{summaryStats.reactionCount} configured
										</Badge>
									)}
								</CardTitle>
							</CardHeader>
							<CardContent>
								{summaryStats.hasReactions ? (
									<div className="space-y-4">
										<p className="text-sm text-muted-foreground">
											The following reactions will be sent automatically when users click buttons:
										</p>

										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="text-xs">Button</TableHead>
													<TableHead className="text-xs">Reaction</TableHead>
													<TableHead className="text-xs">Type</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{buttons.map((button) => {
													const reaction = reactions.find((r) => r.buttonId === button.id);
													return (
														<TableRow key={button.id}>
															<TableCell className="text-sm font-medium">{button.title}</TableCell>
															<TableCell className="text-sm">
																{reaction?.reaction ? (
																	<div className="flex items-center gap-2">
																		{reaction.reaction.type === "emoji" ? (
																			<span className="text-lg">{reaction.reaction.value}</span>
																		) : (
																			<span className="text-muted-foreground">"{reaction.reaction.value}"</span>
																		)}
																	</div>
																) : (
																	<span className="text-muted-foreground text-xs">No reaction</span>
																)}
															</TableCell>
															<TableCell className="text-xs">
																{reaction?.reaction ? (
																	<Badge
																		variant={reaction.reaction.type === "emoji" ? "default" : "secondary"}
																		className="text-xs"
																	>
																		{reaction.reaction.type === "emoji" ? "Emoji" : "Text Reply"}
																	</Badge>
																) : (
																	<Badge variant="outline" className="text-xs">
																		None
																	</Badge>
																)}
															</TableCell>
														</TableRow>
													);
												})}
											</TableBody>
										</Table>
									</div>
								) : (
									<div className="text-center py-6">
										<Zap className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
										<p className="text-sm text-muted-foreground">No automatic reactions configured</p>
										<p className="text-xs text-muted-foreground mt-1">
											Buttons will work normally without automatic responses
										</p>
									</div>
								)}
							</CardContent>
						</Card>
					)}
				</div>

				{/* Right Panel - Message Preview */}
				<div>
					<div className="sticky top-6">
						<Card>
							<CardHeader>
								<CardTitle className="text-base flex items-center gap-2">
									<Eye className="h-4 w-4" />
									Final Preview
								</CardTitle>
								<p className="text-sm text-muted-foreground">How your message will appear to recipients</p>
							</CardHeader>
							<CardContent>
								<InteractivePreview
									message={message}
									reactions={reactions.map((r) => ({
										id: r.buttonId,
										buttonId: r.buttonId,
										messageId: "", // ou message.id se disponível
										type: r.reaction?.type || "emoji",
										emoji: r.reaction?.type === "emoji" ? r.reaction.value : undefined,
										textResponse: r.reaction?.type === "text" ? r.reaction.value : undefined,
										action: r.reaction?.type === "action" ? r.reaction.value : undefined,
										isActive: true,
									}))}
									showReactionIndicators={true}
									showReactionConfig={true}
									onButtonReactionChange={(buttonId, reaction) => {
										// This is in review mode, so we'll show a toast instead of allowing changes
										toast.info("Para editar reações, volte ao passo anterior", {
											description: 'Use o botão "Back to Edit" para modificar as configurações',
										});
									}}
									className="min-h-[400px]"
								/>

								{/* Preview Legend */}
								{summaryStats.hasReactions && (
									<div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
										<div className="flex items-start gap-2">
											<Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
											<div className="text-xs text-blue-700 dark:text-blue-300">
												<p className="font-medium mb-1">Reaction Indicators:</p>
												<p>Buttons with ⚡️ will send automatic reactions when clicked by recipients.</p>
											</div>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			</div>

			<div className="border-t" />

			{/* Navigation and Save Actions */}
			<div className="flex items-center justify-between">
				<Button
					variant="outline"
					onClick={onBack}
					disabled={disabled || saveState.saving}
					className="flex items-center gap-2"
				>
					<ChevronLeft className="h-4 w-4" />
					Back to Edit
				</Button>

				<div className="flex items-center gap-3">
					{/* Validation Warning */}
					{!canSave && !saveState.saving && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<AlertCircle className="h-4 w-4" />
							<span>Please ensure name and body text are provided</span>
						</div>
					)}

					{/* Save Button */}
					<Button
						onClick={handleSave}
						disabled={!canSave || disabled}
						className="flex items-center gap-2 min-w-[140px]"
						size="default"
					>
						{saveState.saving ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								{editingMessage ? "Updating..." : "Saving..."}
							</>
						) : saveState.success ? (
							<>
								<CheckCircle className="h-4 w-4" />
								{editingMessage ? "Updated!" : "Saved!"}
							</>
						) : (
							<>
								<Save className="h-4 w-4" />
								{editingMessage ? "Update Message" : "Save Message"}
							</>
						)}
					</Button>
				</div>
			</div>
		</div>
	);
};

export default ReviewStep;
