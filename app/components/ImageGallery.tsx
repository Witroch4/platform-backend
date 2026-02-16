"use client";

import { useState } from "react";
import { useImageGallery, type GalleryImage } from "@/hooks/useImageGallery";
import { X, Download, ExternalLink, Calendar, Hash, Loader2, ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface ImageGalleryModalProps {
	isOpen: boolean;
	onClose: () => void;
}

const ImageGalleryModal: React.FC<ImageGalleryModalProps> = ({ isOpen, onClose }) => {
	const { images, isLoading, error, total, hasMore, loadMore } = useImageGallery();
	const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);

	if (!isOpen) return null;

	const handleDownload = async (image: GalleryImage) => {
		try {
			const response = await fetch(image.imageUrl);
			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.style.display = "none";
			a.href = url;
			a.download = `imagem-${image.id}.png`;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
			toast.success("Download iniciado!");
		} catch (error) {
			console.error("Erro ao baixar imagem:", error);
			toast.error("Erro ao baixar imagem");
		}
	};

	const openImageInNewTab = (image: GalleryImage) => {
		const newWindow = window.open();
		if (newWindow) {
			newWindow.document.write(`
        <html>
          <head>
            <title>Imagem Gerada - ${image.prompt}</title>
            <style>
              body { 
                margin: 0; 
                display: flex; 
                flex-direction: column; 
                justify-content: center; 
                align-items: center; 
                min-height: 100vh; 
                background: #000; 
                color: #fff; 
                font-family: Arial, sans-serif; 
              }
              img { 
                max-width: 90vw; 
                max-height: 80vh; 
                border-radius: 8px; 
                box-shadow: 0 4px 20px rgba(255,255,255,0.1);
              }
              .info { 
                margin-top: 16px; 
                text-align: center; 
                padding: 0 20px; 
                max-width: 800px;
              }
              .prompt { 
                font-size: 18px; 
                margin-bottom: 8px; 
                font-weight: bold;
              }
              .meta { 
                font-size: 14px; 
                opacity: 0.8; 
                line-height: 1.4;
              }
            </style>
          </head>
          <body>
            <img src="${image.imageUrl}" alt="${image.prompt}">
            <div class="info">
              <div class="prompt">"${image.prompt}"</div>
              <div class="meta">
                ${image.revisedPrompt && image.revisedPrompt !== image.prompt ? `<strong>Prompt Revisado:</strong> "${image.revisedPrompt}"<br><br>` : ""}
                <strong>Modelo:</strong> ${image.model}<br>
                <strong>Gerado em:</strong> ${new Date(image.createdAt).toLocaleString("pt-BR")}<br>
                ${image.chatSession ? `<strong>Chat:</strong> ${image.chatSession.title}` : ""}
              </div>
            </div>
          </body>
        </html>
      `);
		}
	};

	return (
		<div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4">
			<div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
				{/* Header */}
				<div className="p-4 border-b flex justify-between items-center">
					<div>
						<h2 className="text-xl font-bold flex items-center gap-2">
							<ImageIcon className="h-5 w-5" />
							Galeria de Imagens
						</h2>
						<p className="text-sm text-gray-600">
							{total > 0
								? `${total} imagem${total !== 1 ? "s" : ""} gerada${total !== 1 ? "s" : ""}`
								: "Nenhuma imagem encontrada"}
						</p>
					</div>
					<button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
						<X className="h-5 w-5" />
					</button>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-auto p-4">
					{error && (
						<div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-4">
							<p className="font-medium">Erro ao carregar galeria:</p>
							<p>{error}</p>
						</div>
					)}

					{images.length === 0 && !isLoading ? (
						<div className="text-center py-12">
							<ImageIcon className="h-16 w-16 mx-auto text-gray-300 mb-4" />
							<h3 className="text-lg font-medium text-gray-600 mb-2">Nenhuma imagem encontrada</h3>
							<p className="text-gray-500">Comece a gerar imagens nas suas conversas para vê-las aqui!</p>
						</div>
					) : (
						<>
							{/* Image Grid */}
							<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
								{images.map((image) => (
									<div key={image.id} className="relative group bg-gray-100 rounded-lg overflow-hidden aspect-square">
										<img
											src={image.thumbnailUrl || image.imageUrl}
											alt={image.prompt}
											className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
											onClick={() => setSelectedImage(image)}
										/>

										{/* Overlay */}
										<div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
											<div className="flex gap-2">
												<button
													onClick={(e) => {
														e.stopPropagation();
														openImageInNewTab(image);
													}}
													className="p-2 bg-white bg-opacity-90 rounded-full hover:bg-opacity-100 transition-all"
													title="Abrir em nova aba"
												>
													<ExternalLink className="h-4 w-4" />
												</button>
												<button
													onClick={(e) => {
														e.stopPropagation();
														handleDownload(image);
													}}
													className="p-2 bg-white bg-opacity-90 rounded-full hover:bg-opacity-100 transition-all"
													title="Baixar imagem"
												>
													<Download className="h-4 w-4" />
												</button>
											</div>
										</div>

										{/* Image info overlay */}
										<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-2">
											<p className="text-white text-xs truncate font-medium">
												{image.prompt.length > 30 ? `${image.prompt.substring(0, 30)}...` : image.prompt}
											</p>
											<div className="flex items-center justify-between text-gray-300 text-xs mt-1">
												<span>{new Date(image.createdAt).toLocaleDateString("pt-BR")}</span>
												{image.chatSession && (
													<span className="truncate ml-2" title={image.chatSession.title}>
														{image.chatSession.title.length > 15
															? `${image.chatSession.title.substring(0, 15)}...`
															: image.chatSession.title}
													</span>
												)}
											</div>
										</div>
									</div>
								))}
							</div>

							{/* Load More Button */}
							{hasMore && (
								<div className="text-center mt-6">
									<button
										onClick={loadMore}
										disabled={isLoading}
										className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
									>
										{isLoading ? (
											<>
												<Loader2 className="h-4 w-4 animate-spin" />
												Carregando...
											</>
										) : (
											"Carregar mais"
										)}
									</button>
								</div>
							)}
						</>
					)}
				</div>
			</div>

			{/* Image Detail Modal */}
			{selectedImage && (
				<div className="fixed inset-0 z-60 bg-black bg-opacity-90 flex items-center justify-center p-4">
					<div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
						<div className="p-4 border-b flex justify-between items-center">
							<h3 className="text-lg font-semibold">Detalhes da Imagem</h3>
							<button
								onClick={() => setSelectedImage(null)}
								className="p-2 hover:bg-gray-100 rounded-full transition-colors"
							>
								<X className="h-5 w-5" />
							</button>
						</div>

						<div className="p-4">
							<img
								src={selectedImage.imageUrl}
								alt={selectedImage.prompt}
								className="w-full max-h-96 object-contain rounded-lg mb-4"
							/>

							<div className="space-y-3">
								<div>
									<label className="text-sm font-medium text-gray-600">Prompt:</label>
									<p className="text-gray-900">{selectedImage.prompt}</p>
								</div>

								{selectedImage.revisedPrompt && selectedImage.revisedPrompt !== selectedImage.prompt && (
									<div>
										<label className="text-sm font-medium text-gray-600">Prompt Revisado:</label>
										<p className="text-gray-900">{selectedImage.revisedPrompt}</p>
									</div>
								)}

								<div className="grid grid-cols-2 gap-4">
									<div>
										<label className="text-sm font-medium text-gray-600">Modelo:</label>
										<p className="text-gray-900">{selectedImage.model}</p>
									</div>

									<div>
										<label className="text-sm font-medium text-gray-600">Data:</label>
										<p className="text-gray-900">{new Date(selectedImage.createdAt).toLocaleString("pt-BR")}</p>
									</div>
								</div>

								{selectedImage.chatSession && (
									<div>
										<label className="text-sm font-medium text-gray-600">Chat:</label>
										<p className="text-gray-900">{selectedImage.chatSession.title}</p>
									</div>
								)}
							</div>

							<div className="flex gap-2 mt-6">
								<button
									onClick={() => openImageInNewTab(selectedImage)}
									className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
								>
									<ExternalLink className="h-4 w-4" />
									Abrir em nova aba
								</button>
								<button
									onClick={() => handleDownload(selectedImage)}
									className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
								>
									<Download className="h-4 w-4" />
									Baixar
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default ImageGalleryModal;
