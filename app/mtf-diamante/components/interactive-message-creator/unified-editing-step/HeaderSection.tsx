"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Type, Image, Video, FileText, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { isInstagramChannel } from "@/types/interactive-messages";
import { getInstagramTemplateType } from "./utils";
import MinIOMediaUpload, { MinIOMediaFile } from "../../shared/MinIOMediaUpload";
import type { HeaderSectionProps, MessageHeader, HeaderType } from "./types";

export const HeaderSection: React.FC<HeaderSectionProps> = ({
	message,
	onMessageUpdate,
	disabled = false,
	isFieldValid,
	headerMediaFiles,
	setHeaderMediaFiles,
	handleValidationError,
	validateField,
	channelType = "Channel::WhatsApp",
}) => {
	const isInstagram = isInstagramChannel(channelType);

	// Check if this is Instagram Button Template
	const instagramTemplate = React.useMemo(() => {
		if (!isInstagram) return null;
		const bodyText = message.body?.text || "";
		const hasImage = message.header?.type === "image" && !!message.header?.content;
		// Use message type directly
		const selectedType = message.type;
		return getInstagramTemplateType(bodyText, hasImage, selectedType);
	}, [isInstagram, message.body?.text, message.header, message.type]);

	const isButtonTemplate = instagramTemplate?.type === "button_template";

	const handleHeaderTypeChange = React.useCallback(
		(type: HeaderType) => {
			try {
				const newHeader: MessageHeader = {
					type,
					content: type === "text" ? message.header?.content || "" : "",
				};
				onMessageUpdate({ header: newHeader });

				// Clear header media files when switching to text type
				if (type === "text") {
					setHeaderMediaFiles([]);
				}
			} catch (error) {
				handleValidationError(error);
			}
		},
		[onMessageUpdate, message.header, handleValidationError, setHeaderMediaFiles],
	);

	const handleHeaderContentChange = React.useCallback(
		(content: string) => {
			try {
				if (!message.header) return;

				// Se header é de texto e o conteúdo está vazio, remover header (opcional)
				if (message.header.type === "text" && !content.trim()) {
					onMessageUpdate({ header: undefined });
					return;
				}

				const updatedHeader: MessageHeader = {
					...message.header,
					content,
					// Sempre persistir também em media_url para compatibilidade
					...(message.header.type !== "text" && { media_url: content }),
				};
				onMessageUpdate({ header: updatedHeader });

				// Validate header content immediately
				validateField("header.content", content, {
					...message,
					header: updatedHeader,
				});
			} catch (error) {
				handleValidationError(error);
			}
		},
		[onMessageUpdate, message.header, validateField, message, handleValidationError, setHeaderMediaFiles],
	);

	const handleMediaUpload = React.useCallback(
		(file: MinIOMediaFile) => {
			if (file.url) {
				handleHeaderContentChange(file.url);
			}
		},
		[handleHeaderContentChange],
	);

	// Auto-ajustar header type para Generic Template
	React.useEffect(() => {
		if (isInstagram && instagramTemplate?.type === "generic" && (!message.header || message.header.type === "text")) {
			handleHeaderTypeChange("image");
		}
	}, [isInstagram, instagramTemplate?.type, message.header, handleHeaderTypeChange]);

	// Available header types based on channel
	const getAvailableHeaderTypes = () => {
		if (isInstagram) {
			// Para Generic Template (carrossel), só image/video - sem text
			if (instagramTemplate?.type === "generic") {
				return [
					{ value: "image", label: "Imagem", icon: Image },
					{ value: "video", label: "Vídeo", icon: Video },
				];
			}
			// Outros templates Instagram suportam text, image, video
			return [
				{ value: "text", label: "Texto", icon: Type },
				{ value: "image", label: "Imagem", icon: Image },
				{ value: "video", label: "Vídeo", icon: Video },
			];
		} else {
			// WhatsApp supports all types including document
			return [
				{ value: "text", label: "Text", icon: Type },
				{ value: "image", label: "Image", icon: Image },
				{ value: "video", label: "Video", icon: Video },
				{ value: "document", label: "Document", icon: FileText },
			];
		}
	};

	// Ocultar completamente se for Instagram Button Template
	if (isInstagram && isButtonTemplate) {
		return null;
	}

	return (
		<Card>
			<CardHeader className="pb-4">
				<CardTitle className="text-base flex items-center gap-2">
					{isInstagram && instagramTemplate?.type === "generic"
						? "Imagem do Carrossel (Opcional)"
						: "Header (Optional)"}
					{isInstagram && instagramTemplate?.type === "generic" && (
						<Badge
							variant="outline"
							className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
						>
							Carrossel
						</Badge>
					)}
					{isInstagram && instagramTemplate?.type !== "generic" && (
						<Badge
							variant="outline"
							className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
						>
							Instagram
						</Badge>
					)}
				</CardTitle>
				<div className="space-y-2">
					<p className="text-sm text-muted-foreground">
						{isInstagram && instagramTemplate?.type === "generic"
							? "Adicione uma imagem para o carrossel"
							: isInstagram
								? "Adicione um cabeçalho para tornar sua mensagem Instagram mais atrativa"
								: "Add a header to make your message more engaging"}
					</p>

					{isInstagram && instagramTemplate?.type === "generic" && (
						<div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-950/50 rounded-lg border border-purple-200 dark:border-purple-800">
							<Info className="h-4 w-4 text-purple-600 dark:text-purple-400 mt-0.5" />
							<div className="text-sm">
								<p className="font-medium text-purple-900 dark:text-purple-100">Carrossel Instagram:</p>
								<ul className="text-purple-700 dark:text-purple-300 mt-1 space-y-1">
									<li>• Imagem: PNG, JPEG, GIF até 8MB</li>
									<li>• Até 10 elementos no carrossel</li>
									<li>• Cada elemento tem título + subtítulo</li>
								</ul>
							</div>
						</div>
					)}

					{isInstagram && instagramTemplate?.type !== "generic" && instagramTemplate?.type !== "button_template" && (
						<div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-950/50 rounded-lg border border-purple-200 dark:border-purple-800">
							<Info className="h-4 w-4 text-purple-600 dark:text-purple-400 mt-0.5" />
							<div className="text-sm">
								<p className="font-medium text-purple-900 dark:text-purple-100">Instagram Headers:</p>
								<ul className="text-purple-700 dark:text-purple-300 mt-1 space-y-1">
									<li>• Texto: Máximo 60 caracteres</li>
									<li>• Imagem: PNG, JPEG, GIF até 8MB</li>
									<li>• Vídeo: MP4, OGG, AVI, MOV, WEBM até 25MB</li>
									<li>• Documentos não são suportados no Instagram</li>
								</ul>
							</div>
						</div>
					)}
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Ocultar header para Instagram Button Template */}
				{!(isInstagram && isButtonTemplate) && (
					<div className="space-y-2">
						<Label htmlFor="header-type">
							{isInstagram && instagramTemplate?.type === "generic" ? "Tipo de Mídia" : "Tipo de Header"}
						</Label>
						<Select
							value={message.header?.type || (isInstagram && instagramTemplate?.type === "generic" ? "image" : "text")}
							onValueChange={(value: HeaderType) => handleHeaderTypeChange(value)}
							disabled={disabled}
						>
							<SelectTrigger id="header-type">
								<SelectValue
									placeholder={
										isInstagram && instagramTemplate?.type === "generic"
											? "Selecione o tipo de mídia"
											: "Select header type"
									}
								/>
							</SelectTrigger>
							<SelectContent>
								{getAvailableHeaderTypes().map(({ value, label, icon: Icon }) => (
									<SelectItem key={value} value={value}>
										<div className="flex items-center gap-2">
											<Icon className="h-4 w-4" />
											{label}
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				{/* Conteúdo do header apenas se não for Instagram Button Template */}
				{!(isInstagram && isButtonTemplate) && (
					<>
						{(message.header?.type || (isInstagram && instagramTemplate?.type === "generic" ? "image" : "text")) ===
						"text" ? (
							<div className="space-y-2">
								<Label htmlFor="header-content">Header Text</Label>
								<Input
									id="header-content"
									value={message.header?.content || ""}
									onChange={(e) => handleHeaderContentChange(e.target.value)}
									placeholder={isInstagram ? "Digite o texto do cabeçalho..." : "Enter header text..."}
									disabled={disabled}
									maxLength={60}
									className={cn(!isFieldValid("header.content") && "border-destructive focus-visible:ring-destructive")}
								/>
								{isInstagram && (
									<div className="text-xs text-muted-foreground">
										{(message.header?.content || "").length}/60 caracteres
									</div>
								)}
							</div>
						) : (
							<div className="space-y-2">
								<Label>Upload {message.header?.type}</Label>
								<MinIOMediaUpload
									uploadedFiles={headerMediaFiles}
									setUploadedFiles={setHeaderMediaFiles}
									allowedTypes={
										message.header?.type === "image"
											? ["image/jpeg", "image/png", "image/jpg", "image/gif"]
											: message.header?.type === "video"
												? isInstagram
													? ["video/mp4", "video/webm", "video/ogg", "video/avi", "video/mov"]
													: ["video/mp4", "video/webm"]
												: [
														"application/pdf",
														"application/msword",
														"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
													]
									}
									maxSizeMB={
										isInstagram
											? message.header?.type === "video"
												? 25
												: 8
											: message.header?.type === "video"
												? 16
												: 5
									}
									maxFiles={1}
									onUploadComplete={handleMediaUpload}
								/>
								{isInstagram && (
									<div className="text-xs text-muted-foreground">
										Tamanho máximo: {message.header?.type === "video" ? "25MB" : "8MB"}
									</div>
								)}
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
};
