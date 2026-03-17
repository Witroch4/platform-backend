import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { Download, ExternalLink, ChevronLeft, ChevronRight, RefreshCw, X, Check, Loader2, Send } from "lucide-react";
import { downloadImagesAsZip } from "../utils/download-zip";
import { Checkbox } from "@/components/ui/checkbox";

interface ImageGalleryDialogProps {
	isOpen: boolean;
	onClose: () => void;
	images: string[];
	title?: string;
	description?: string;
	leadId?: string;
	onSend?: (selectedImages: string[]) => Promise<void>;
	selectionMode?: boolean;
	mode?: "prova" | "espelho" | "ambos";
	onSendProva?: (selectedImages: string[]) => Promise<void>;
	onSendEspelho?: (selectedImages: string[]) => Promise<void>;
	onCancelarProva?: () => Promise<void>;
	aguardandoProva?: boolean;
	batchMode?: boolean;
}

export function ImageGalleryDialog({
	isOpen,
	onClose,
	images,
	title = "Galeria de Imagens",
	description = "Selecione as imagens da prova para enviar. Clique em uma miniatura para ver a imagem completa.",
	leadId,
	onSend,
	selectionMode = false,
	mode = "ambos",
	onSendProva,
	onSendEspelho,
	onCancelarProva,
	aguardandoProva,
	batchMode = false,
}: ImageGalleryDialogProps) {
	const [selectedImage, setSelectedImage] = useState<string | null>(null);
	const [selectedIndex, setSelectedIndex] = useState<number>(-1);
	const [isDownloading, setIsDownloading] = useState(false);
	const [loadingImages, setLoadingImages] = useState<Record<number, boolean>>({});
	const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});
	const [fullImageLoading, setFullImageLoading] = useState(false);
	const [fullImageError, setFullImageError] = useState(false);
	const [showDebug, setShowDebug] = useState(false);
	const [selectedImages, setSelectedImages] = useState<string[]>([]);
	const [isSending, setIsSending] = useState(false);
	const [isCancelingProva, setIsCancelingProva] = useState(false);

	// Função para fazer download de todas as imagens como ZIP
	const handleDownloadAllImages = async () => {
		if (images.length === 0) {
			toast.error("Erro", { description: "Não há imagens para baixar" });
			return;
		}

		setIsDownloading(true);

		try {
			toast("Preparando download", { description: "Aguarde enquanto preparamos suas imagens..." });

			const result = await downloadImagesAsZip(images, leadId ? `lead-${leadId.substring(0, 8)}` : "imagens");

			if (result && typeof result === "object" && result.success) {
				toast("Download concluído", {
					description: `${result.success} de ${result.total} imagens baixadas com sucesso.`,
				});
			} else {
				throw new Error("Falha ao criar o arquivo ZIP");
			}
		} catch (error: any) {
			console.error("Erro ao baixar imagens:", error);
			toast.error("Erro", { description: error.message || "Não foi possível baixar as imagens" });
		} finally {
			setIsDownloading(false);
		}
	};

	// Função para toggle da seleção de imagem
	const toggleImageSelection = (imageUrl: string, event?: React.MouseEvent) => {
		// Se event for fornecido, impedir a propagação para evitar abrir a imagem
		if (event) {
			event.stopPropagation();
		}

		setSelectedImages((prev) => {
			if (prev.includes(imageUrl)) {
				return prev.filter((url) => url !== imageUrl);
			} else {
				return [...prev, imageUrl];
			}
		});
	};

	// Função para enviar imagens selecionadas
	const handleSendImages = async () => {
		if (selectedImages.length === 0) {
			toast("Aviso", { description: "Selecione pelo menos uma imagem para enviar." });
			return;
		}

		setIsSending(true);
		try {
			if (mode === "ambos") {
				// Dividir imagens entre prova e espelho
				const midPoint = Math.ceil(selectedImages.length / 2);
				const provaImages = selectedImages.slice(0, midPoint);
				const espelhoImages = selectedImages.slice(midPoint);

				if (onSendProva && provaImages.length > 0) {
					await onSendProva(provaImages);
					toast("Prova Enviada", {
						description: `${provaImages.length} imagem(ns) da prova enviada(s) com sucesso!`,
					});
				}

				if (onSendEspelho && espelhoImages.length > 0) {
					await onSendEspelho(espelhoImages);
					toast("Espelho Enviado", {
						description: `${espelhoImages.length} imagem(ns) do espelho enviada(s) com sucesso!`,
					});
				}
			} else if (mode === "prova") {
				// Promise para o toast da prova
				const provaPromise = async () => {
					if (onSend) {
						await onSend(selectedImages);
					} else if (onSendProva) {
						await onSendProva(selectedImages);
					}
					return { count: selectedImages.length, type: "prova" };
				};

				await toast.promise(provaPromise, {
					loading: "📝 Enviando prova para processamento...",
					success: (data) => {
						return `🎉 ${data.count} imagem(ns) da prova enviada(s) com sucesso!`;
					},
					error: "Erro ao enviar prova",
				});
			} else if (mode === "espelho") {
				// Promise para o toast do espelho
				const espelhoPromise = async () => {
					if (onSend) {
						await onSend(selectedImages);
					} else if (onSendEspelho) {
						await onSendEspelho(selectedImages);
					}
					return { count: selectedImages.length, type: "espelho" };
				};

				await toast.promise(espelhoPromise, {
					loading: "📋 Enviando espelho para processamento...",
					success: (data) => {
						return `🎉 ${data.count} imagem(ns) do espelho enviada(s) com sucesso!`;
					},
					error: "Erro ao enviar espelho",
				});
			} else if (onSend) {
				// Fallback genérico
				await onSend(selectedImages);
				toast("Sucesso", { description: "Imagens enviadas com sucesso!" });
			}

			// Fechar o diálogo APENAS se não estiver em modo batch
			if (!batchMode) {
				onClose();
			}
		} catch (error: any) {
			console.error("Erro ao enviar imagens:", error);
			toast.error("Erro", { description: error.message || "Não foi possível enviar as imagens. Tente novamente." });
		} finally {
			setIsSending(false);
		}
	};

	// Função para cancelar processamento da prova
	const handleCancelarProva = async () => {
		if (!onCancelarProva) return;

		setIsCancelingProva(true);
		try {
			await onCancelarProva();
			toast("Sucesso", { description: "Processamento da prova cancelado com sucesso!" });
			onClose();
		} catch (error: any) {
			console.error("Erro ao cancelar prova:", error);
			toast.error("Erro", { description: error.message || "Não foi possível cancelar o processamento." });
		} finally {
			setIsCancelingProva(false);
		}
	};

	// Navegar para a próxima imagem
	const goToNextImage = () => {
		if (selectedIndex < images.length - 1) {
			const newIndex = selectedIndex + 1;
			setSelectedIndex(newIndex);
			setSelectedImage(images[newIndex]);
		}
	};

	// Navegar para a imagem anterior
	const goToPrevImage = () => {
		if (selectedIndex > 0) {
			const newIndex = selectedIndex - 1;
			setSelectedIndex(newIndex);
			setSelectedImage(images[newIndex]);
		}
	};

	// Fechar visualização de imagem ampliada
	const closeImageView = () => {
		setSelectedImage(null);
		setSelectedIndex(-1);
	};

	// Abrir imagem ampliada
	const openImage = (url: string, index: number) => {
		setSelectedImage(url);
		setSelectedIndex(index);
		setFullImageLoading(true);
		setFullImageError(false);
	};

	// Manipular teclas de navegação
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (selectedImage) {
			if (e.key === "ArrowRight") {
				goToNextImage();
			} else if (e.key === "ArrowLeft") {
				goToPrevImage();
			} else if (e.key === "Escape") {
				closeImageView();
			}
		}
	};

	// Função mais detalhada para depuração de URLs de miniaturas
	const getThumbnailUrl = (imageUrl: string) => {
		// URL já pode estar no formato de miniatura
		if (imageUrl.includes("/thumb_")) {
			return imageUrl;
		}

		try {
			const url = new URL(imageUrl);
			const pathParts = url.pathname.split("/");

			// Log para depuração
			if (showDebug) {
				console.log("Processando URL:", {
					original: imageUrl,
					host: url.host,
					pathname: url.pathname,
					pathParts,
				});
			}

			// Última parte é o nome do arquivo
			if (pathParts.length > 0) {
				const lastIndex = pathParts.length - 1;
				const fileName = pathParts[lastIndex];

				// Insere "thumb_" antes do nome do arquivo
				pathParts[lastIndex] = `thumb_${fileName}`;

				// Reconstrói o caminho
				url.pathname = pathParts.join("/");
				const thumbnailUrl = url.toString();

				// Log para depuração
				if (showDebug) {
					console.log("URL de miniatura gerada:", thumbnailUrl);
				}

				return thumbnailUrl;
			}

			return imageUrl;
		} catch (e) {
			console.warn("Erro ao processar URL de miniatura:", e);
			return imageUrl;
		}
	};

	// Função para marcar imagem como em carregamento
	const handleImageLoading = (index: number, isLoading: boolean) => {
		setLoadingImages((prev) => ({ ...prev, [index]: isLoading }));
	};

	// Função para marcar erro na imagem
	const handleImageError = (index: number, hasError: boolean) => {
		setImageErrors((prev) => ({ ...prev, [index]: hasError }));
	};

	return (
		<>
			{/* Dialog principal da galeria */}
			<Dialog open={isOpen && !selectedImage} onOpenChange={(open) => { if (!open && !batchMode) onClose(); }}>
				<DialogContent
					className="max-w-4xl max-h-[90vh] overflow-auto"
					onKeyDown={handleKeyDown}
					onInteractOutside={(e) => { if (batchMode) e.preventDefault(); }}
					onEscapeKeyDown={(e) => { if (batchMode) e.preventDefault(); }}
				>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>{description}</DialogDescription>
						{mode === "ambos" && (
							<div className="mt-2 text-sm text-muted-foreground">
								💡 Selecione as imagens na ordem correta: primeiro as da prova, depois as do espelho.
							</div>
						)}
					</DialogHeader>

					<div className="py-4">
						{selectionMode && (
							<div className="mb-4 flex items-center justify-between">
								<span className="text-sm text-muted-foreground">
									{selectedImages.length === 0
										? "Nenhuma imagem selecionada"
										: `${selectedImages.length} ${selectedImages.length === 1 ? "imagem selecionada" : "imagens selecionadas"}`}
								</span>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										if (selectedImages.length === images.length) {
											setSelectedImages([]);
										} else {
											setSelectedImages([...images]);
										}
									}}
								>
									<Check className="h-3 w-3 mr-1" />
									{selectedImages.length === images.length ? "Desmarcar Todas" : "Selecionar Todas"}
								</Button>
							</div>
						)}

						<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
							{images.map((imageUrl, index) => (
								<div
									key={index}
									className={`cursor-pointer border rounded-md overflow-hidden relative group ${
										selectedImages.includes(imageUrl) ? "ring-2 ring-primary" : ""
									}`}
									onClick={() => openImage(imageUrl, index)}
								>
									<div className="w-full h-40 flex items-center justify-center relative">
										{loadingImages[index] && (
											<div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
												<RefreshCw className="h-6 w-6 animate-spin text-primary" />
											</div>
										)}

										<img
											src={getThumbnailUrl(imageUrl)}
											alt={`Imagem ${index + 1}`}
											className={`w-full h-full object-contain ${imageErrors[index] ? "opacity-60" : ""}`}
											onLoad={() => handleImageLoading(index, false)}
											onLoadStart={() => handleImageLoading(index, true)}
											onError={(e) => {
												console.warn(`Erro ao carregar miniatura: ${getThumbnailUrl(imageUrl)}`);
												handleImageLoading(index, false);
												handleImageError(index, true);
												// Fallback para a imagem original em caso de erro
												e.currentTarget.src = imageUrl;
											}}
										/>

										{/* Checkbox para seleção de imagens */}
										{selectionMode && (
											<div className="absolute top-2 right-2 z-20" onClick={(e) => toggleImageSelection(imageUrl, e)}>
												<div
													className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
														selectedImages.includes(imageUrl)
															? "bg-primary text-primary-foreground"
															: "bg-background/90 border border-border hover:bg-muted"
													}`}
												>
													{selectedImages.includes(imageUrl) && <Check className="h-4 w-4" />}
												</div>
											</div>
										)}

										{imageErrors[index] && (
											<div className="absolute bottom-1 left-1 right-1 bg-red-500/70 text-white text-xs p-1 rounded text-center">
												Erro na miniatura
											</div>
										)}
									</div>

									<div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
										<span className="text-white bg-black/60 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
											Imagem {index + 1}
										</span>
									</div>
								</div>
							))}
						</div>
					</div>

					<DialogFooter className="flex justify-between items-center">
						<div className="flex gap-2">
							<Button
								variant="outline"
								onClick={handleDownloadAllImages}
								disabled={isDownloading || images.length === 0}
							>
								{isDownloading ? (
									<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
								) : (
									<Download className="h-4 w-4 mr-2" />
								)}
								{isDownloading ? "Processando..." : "Download ZIP"}
							</Button>

							<Button
								variant="ghost"
								size="icon"
								onClick={() => setShowDebug(!showDebug)}
								title="Modo depuração"
								className="h-9 w-9"
							>
								<span className="text-xs">DEBUG</span>
							</Button>
						</div>

						{showDebug && (
							<div className="fixed bottom-20 left-4 right-4 max-h-60 overflow-auto bg-black/80 text-white p-2 text-xs rounded z-50">
								<h4 className="font-bold mb-2">Informações de Depuração</h4>
								<p>Total de imagens: {images.length}</p>
								<div className="mt-2">
									<p className="font-bold">URLs originais:</p>
									<ul className="list-disc pl-4">
										{images.map((url, i) => (
											<li key={i} className="truncate">
												{url} {loadingImages[i] && "(carregando)"} {imageErrors[i] && "(erro)"}
											</li>
										))}
									</ul>
								</div>
								<div className="mt-2">
									<p className="font-bold">URLs de miniaturas:</p>
									<ul className="list-disc pl-4">
										{images.map((url, i) => (
											<li key={i} className="truncate">
												{getThumbnailUrl(url)}
											</li>
										))}
									</ul>
								</div>
							</div>
						)}

						<div className="flex gap-2">
							{selectionMode && (
								<Button
									variant="default"
									onClick={handleSendImages}
									disabled={selectedImages.length === 0 || isSending}
								>
									{isSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
									{mode === "ambos"
										? "Enviar Prova e Espelho"
										: mode === "prova"
											? "Enviar para Digitação"
											: mode === "espelho"
												? "Enviar Espelho"
												: "Enviar Imagens"}
								</Button>
							)}
							{mode === "prova" && aguardandoProva && onCancelarProva && (
								<Button variant="destructive" onClick={handleCancelarProva} disabled={isCancelingProva}>
									{isCancelingProva ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "Cancelar Processamento"}
								</Button>
							)}
							<Button variant="outline" onClick={onClose}>
								Fechar
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Dialog para imagem ampliada da galeria */}
			<Dialog open={!!selectedImage} onOpenChange={(open) => !open && closeImageView()}>
				<DialogContent className="max-w-5xl h-[90vh] flex flex-col" onKeyDown={handleKeyDown}>
					<DialogHeader className="flex-shrink-0">
						<div className="flex items-center justify-between">
							<DialogTitle>
								Imagem {selectedIndex + 1} de {images.length}
							</DialogTitle>
							<Button variant="ghost" size="icon" onClick={closeImageView}>
								<X className="h-4 w-4" />
							</Button>
						</div>
						<DialogDescription>Use as setas do teclado ou os botões para navegar entre as imagens</DialogDescription>
					</DialogHeader>

					<div className="flex-grow flex items-center justify-center relative overflow-hidden">
						{selectedImage && (
							<>
								{fullImageLoading && (
									<div className="absolute inset-0 flex items-center justify-center bg-background/20 z-10">
										<RefreshCw className="h-10 w-10 animate-spin text-primary" />
									</div>
								)}

								<img
									src={selectedImage}
									alt={`Imagem ${selectedIndex + 1}`}
									className={`max-w-full max-h-[calc(90vh-10rem)] object-contain ${fullImageError ? "opacity-60" : ""}`}
									onLoad={() => setFullImageLoading(false)}
									onError={() => {
										setFullImageLoading(false);
										setFullImageError(true);
										console.error(`Erro ao carregar imagem: ${selectedImage}`);
									}}
								/>

								{fullImageError && (
									<div className="absolute bottom-4 left-4 right-4 bg-red-500/80 text-white p-2 rounded text-center">
										Erro ao carregar a imagem. Tente abrir em uma nova aba.
									</div>
								)}
							</>
						)}

						{/* Botões de navegação */}
						{selectedIndex > 0 && (
							<Button
								variant="outline"
								size="icon"
								className="absolute left-2 rounded-full bg-background/80 hover:bg-background"
								onClick={goToPrevImage}
							>
								<ChevronLeft className="h-5 w-5" />
							</Button>
						)}

						{selectedIndex < images.length - 1 && (
							<Button
								variant="outline"
								size="icon"
								className="absolute right-2 rounded-full bg-background/80 hover:bg-background"
								onClick={goToNextImage}
							>
								<ChevronRight className="h-5 w-5" />
							</Button>
						)}
					</div>

					<DialogFooter className="flex-shrink-0 mt-4 flex justify-between">
						<div className="flex gap-2">
							<Button variant="outline" onClick={() => window.open(selectedImage || "", "_blank")}>
								<ExternalLink className="h-4 w-4 mr-2" />
								Abrir em Nova Aba
							</Button>

							{selectionMode && selectedImage && (
								<Button
									variant={selectedImages.includes(selectedImage) ? "default" : "outline"}
									onClick={() => toggleImageSelection(selectedImage)}
								>
									{selectedImages.includes(selectedImage) ? (
										<>
											<Check className="h-4 w-4 mr-2" />
											Selecionada
										</>
									) : (
										"Selecionar esta imagem"
									)}
								</Button>
							)}
						</div>

						<div className="flex gap-2">
							<Button variant="outline" onClick={closeImageView}>
								Voltar para a Galeria
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
