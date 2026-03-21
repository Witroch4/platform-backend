import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InteractiveMessage, InteractiveMessageType, MessageAction } from "./types";
import { MESSAGE_TYPES } from "./constants";
import { MessageSquare, Eye } from "lucide-react";
import { EnhancedTextArea } from "../EnhancedTextArea";
import { TemplatePreview } from "../TemplatesTab/components/template-preview";
import { CTAUrlConfig } from "./config/CTAUrlConfig";
import { FlowConfig } from "./config/FlowConfig";
import { ListConfig } from "./config/ListConfig";
import { ButtonConfig } from "./config/ButtonConfig";
import { LocationConfig } from "./config/LocationConfig";
import { LocationRequestConfig } from "./config/LocationRequestConfig";
import { ReactionConfig } from "./config/ReactionConfig";
import { StickerConfig } from "./config/StickerConfig";
import MinIOMediaUpload, { type MinIOMediaFile } from "../shared/MinIOMediaUpload";
import { isButtonAction, isCtaUrlAction, isListAction } from "@/types/interactive-messages";

interface ConfigurationStepProps {
	message: InteractiveMessage;
	updateMessage: (updates: Partial<InteractiveMessage>) => void;
	updateHeader: (headerUpdates: Partial<InteractiveMessage["header"]>) => void;
	updateBody: (text: string) => void;
	updateFooter: (text: string) => void;
	updateAction: (actionUpdates: Partial<MessageAction | undefined>) => void;
	setCurrentStep: (step: "type-selection" | "configuration" | "preview") => void;
	editingMessage?: InteractiveMessage;
	variables: any[];
	uploadedFiles: MinIOMediaFile[];
	setUploadedFiles: React.Dispatch<React.SetStateAction<MinIOMediaFile[]>>;
}

export const ConfigurationStep: React.FC<ConfigurationStepProps> = ({
	message,
	updateMessage,
	updateHeader,
	updateBody,
	updateFooter,
	updateAction,
	setCurrentStep,
	editingMessage,
	variables,
	uploadedFiles,
	setUploadedFiles,
}) => {
	const generatePreviewComponents = () => {
		const components = [];

		if (message.header) {
			if (message.header.type === "text" && message.header.content) {
				components.push({ type: "header", text: message.header.content });
			} else if (message.header.media_url) {
				components.push({
					type: "header",
					format: message.header.type,
					url: message.header.media_url,
					filename: message.header.filename,
				});
			}
		}

		components.push({ type: "body", text: message.body.text });

		if (message.footer?.text) {
			components.push({ type: "footer", text: message.footer.text });
		}

		// Botões
		if (message.type === "button" && message.action && isButtonAction(message.action)) {
			components.push({
				type: "buttons",
				buttons: message.action.buttons.map((btn: any) => ({ type: "QUICK_REPLY", text: btn.title })),
			});
		} else if (message.type === "cta_url" && message.action && isCtaUrlAction(message.action)) {
			components.push({
				type: "buttons",
				buttons: [{ type: "URL", text: message.action.action.displayText, url: message.action.action.url }],
			});
		} else if (message.type === "list" && message.action && isListAction(message.action)) {
			components.push({ type: "buttons", buttons: [{ type: "LIST", text: message.action.button || "Ver opções" }] });
		}

		return components;
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<MessageSquare className="h-5 w-5" />
					{editingMessage ? "Editar" : "Configurar"} Mensagem Interativa
					<Badge variant="outline" className="ml-2">
						{MESSAGE_TYPES[message.type as keyof typeof MESSAGE_TYPES]?.label}
					</Badge>
				</CardTitle>
				<CardDescription>
					Configure os detalhes da sua mensagem interativa do tipo{" "}
					{MESSAGE_TYPES[message.type as keyof typeof MESSAGE_TYPES]?.label}
				</CardDescription>
				{!editingMessage && (
					<Button variant="ghost" onClick={() => setCurrentStep("type-selection")} className="w-fit mt-2">
						← Voltar para seleção de tipo
					</Button>
				)}
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="basic" className="w-full">
					<TabsList className="grid w-full grid-cols-3">
						<TabsTrigger value="basic">Configuração Básica</TabsTrigger>
						<TabsTrigger value="advanced">Configuração Avançada</TabsTrigger>
						<TabsTrigger value="preview">Visualização</TabsTrigger>
					</TabsList>

					<TabsContent value="basic" className="space-y-6">
						{/* Nome da mensagem */}
						<div className="space-y-2">
							<Label htmlFor="message-name">
								Nome da Mensagem <span className="text-red-500">*</span>
							</Label>
							<Input
								id="message-name"
								placeholder="Ex: Menu Principal, Confirmação de Agendamento..."
								value={message.name}
								onChange={(e) => updateMessage({ name: e.target.value })}
								className={!message.name ? "border-red-300 focus:border-red-500" : ""}
							/>
							{!message.name && (
								<p className="text-xs text-red-500 mt-1">O nome da mensagem é obrigatório para salvar</p>
							)}
						</div>

						{/* Tipo de mensagem */}
						<div className="space-y-2">
							<Label htmlFor="message-type">Tipo de Mensagem</Label>
							<Select
								value={message.type}
								onValueChange={(value: InteractiveMessageType) => {
									updateMessage({
										type: value,
										action: undefined, // Reset action when changing type
									});
								}}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(MESSAGE_TYPES).map(([key, config]) => {
										const IconComponent = config.icon;
										return (
											<SelectItem key={key} value={key}>
												<div className="flex items-center gap-2">
													<IconComponent className="h-4 w-4" />
													<div>
														<div className="font-medium">{config.label}</div>
														<div className="text-xs text-muted-foreground">{config.description}</div>
													</div>
												</div>
											</SelectItem>
										);
									})}
								</SelectContent>
							</Select>
						</div>

						<Separator />

						{/* Header (opcional) */}
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<Label>Cabeçalho (Opcional)</Label>
								<Badge variant="outline">Opcional</Badge>
							</div>

							<Select
								value={message.header?.type || "none"}
								onValueChange={(value) => {
									if (value === "none") {
										updateMessage({ header: undefined });
									} else {
										updateHeader({
											type: value as any,
											content: "",
											media_url: "",
										});
									}
								}}
							>
								<SelectTrigger>
									<SelectValue placeholder="Selecione o tipo de cabeçalho" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">Sem cabeçalho</SelectItem>
									<SelectItem value="text">Texto</SelectItem>
									<SelectItem value="image">Imagem</SelectItem>
									<SelectItem value="video">Vídeo</SelectItem>
									<SelectItem value="document">Documento</SelectItem>
								</SelectContent>
							</Select>

							{message.header?.type === "text" && (
								<EnhancedTextArea
									value={message.header.content || ""}
									onChange={(content) => updateHeader({ content })}
									variables={variables}
									placeholder="Texto do cabeçalho..."
									multiline={false}
									label="Texto do Cabeçalho"
									description="Texto exibido no topo da mensagem."
								/>
							)}

							{message.header?.type && message.header.type !== "text" && (
								<div className="space-y-4">
									<div>
										<Label>Upload de Mídia para MinIO</Label>
										<p className="text-xs text-muted-foreground mb-2">
											Para mensagens interativas, a mídia é enviada apenas para o MinIO (não para a Meta API)
										</p>
										<MinIOMediaUpload
											uploadedFiles={uploadedFiles}
											setUploadedFiles={setUploadedFiles}
											allowedTypes={
												message.header.type === "image"
													? ["image/jpeg", "image/png", "image/jpg"]
													: message.header.type === "video"
														? ["video/mp4", "video/webm"]
														: [
																"application/pdf",
																"application/msword",
																"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
															]
											}
											maxSizeMB={16}
											title={`Upload de ${message.header.type === "image" ? "Imagem" : message.header.type === "video" ? "Vídeo" : "Documento"}`}
											description={`Faça upload da ${message.header.type === "image" ? "imagem" : message.header.type === "video" ? "vídeo" : "documento"} que será usado no cabeçalho`}
											maxFiles={1}
											onUploadComplete={(file) => {
												if (file.url) {
													updateHeader({
														media_url: file.url,
														mediaId: undefined,
													});
												}
											}}
										/>
									</div>

									{message.header.type === "document" && (
										<div className="space-y-2">
											<Label>Nome do Arquivo</Label>
											<Input
												placeholder="documento.pdf"
												value={message.header.filename || ""}
												onChange={(e) => updateHeader({ filename: e.target.value })}
											/>
										</div>
									)}
								</div>
							)}
						</div>

						<Separator />

						<EnhancedTextArea
							value={message.body.text}
							onChange={updateBody}
							variables={variables}
							placeholder="Texto principal da mensagem..."
							rows={4}
							label="Corpo da Mensagem"
							description="Conteúdo principal da mensagem. Use clique direito para inserir variáveis."
						/>

						<EnhancedTextArea
							value={message.footer?.text || ""}
							onChange={updateFooter}
							variables={variables}
							placeholder="Texto do rodapé (opcional)..."
							multiline={false}
							label="Rodapé"
							description="Texto opcional no rodapé. Nome da empresa é preenchido automaticamente."
						/>
					</TabsContent>

					<TabsContent value="advanced" className="space-y-6">
						{message.type === "cta_url" && <CTAUrlConfig message={message} updateAction={updateAction} />}
						{message.type === "flow" && <FlowConfig message={message} updateAction={updateAction} />}
						{message.type === "list" && <ListConfig message={message} updateAction={updateAction} />}
						{message.type === "button" && <ButtonConfig message={message} updateAction={updateAction} />}
						{message.type === "location" && <LocationConfig message={message} updateMessage={updateMessage} />}
						{message.type === "location_request" && (
							<LocationRequestConfig message={message} updateAction={updateAction} />
						)}
						{message.type === "reaction" && <ReactionConfig message={message} updateMessage={updateMessage} />}
						{message.type === "sticker" && (
							<StickerConfig
								message={message}
								updateMessage={updateMessage}
								uploadedFiles={uploadedFiles}
								setUploadedFiles={setUploadedFiles}
							/>
						)}
					</TabsContent>

					<TabsContent value="preview" className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Eye className="h-4 w-4" />
									Visualização da Mensagem
								</CardTitle>
								<CardDescription>Como sua mensagem aparecerá no WhatsApp</CardDescription>
							</CardHeader>
							<CardContent>
								{message.name || message.body.text ? (
									<TemplatePreview
										components={generatePreviewComponents()}
										title={message.name || "Mensagem Interativa"}
										description={`Tipo: ${MESSAGE_TYPES[message.type as keyof typeof MESSAGE_TYPES]?.label}`}
										useAlternativeFormat={true}
										variables={variables}
										previewMode="interactive"
									/>
								) : (
									<div className="text-center text-muted-foreground py-12">
										<MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
										<p className="text-lg">Nenhuma mensagem para visualizar</p>
										<p className="text-sm">Configure sua mensagem para ver a visualização</p>
									</div>
								)}
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>

				<div className="flex justify-between items-center pt-6 border-t">
					<div className="flex gap-2">
						{!editingMessage && (
							<Button variant="outline" onClick={() => setCurrentStep("type-selection")}>
								← Voltar
							</Button>
						)}
					</div>

					<div className="flex gap-2">
						<Button
							variant="outline"
							onClick={() => setCurrentStep("preview")}
							disabled={!message.name || !message.body.text}
						>
							Review & Save →
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
};
