import type React from "react";
import { useState } from "react";
import type { ImageSize, ImageQuality, ImageStyle, ImageModel } from "@/services/openai";

interface ImageGenerationResult {
	url: string;
	b64_json?: string;
}

interface ImageGeneratorProps {
	onClose: () => void;
}

export default function ImageGenerator({ onClose }: ImageGeneratorProps) {
	const [prompt, setPrompt] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [images, setImages] = useState<ImageGenerationResult[]>([]);

	// Configurações
	const [model, setModel] = useState<ImageModel>("dall-e-2");
	const [size, setSize] = useState<ImageSize>("1024x1024");
	const [quality, setQuality] = useState<ImageQuality>("standard");
	const [style, setStyle] = useState<ImageStyle>("vivid");
	const [numberOfImages, setNumberOfImages] = useState(1);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!prompt.trim() || isLoading) return;

		setIsLoading(true);
		setError(null);

		try {
			const response = await fetch("/api/chatwitia/image", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					prompt,
					options: {
						model,
						n: numberOfImages,
						size,
						quality,
						style,
					},
				}),
			});

			if (!response.ok) {
				throw new Error("Erro na comunicação com o servidor");
			}

			const data = await response.json();

			if (data.error) {
				throw new Error(data.error);
			}

			setImages(data.images);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
			setError(errorMessage);
			console.error("Erro ao gerar imagem:", err);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
			<div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
				<div className="p-4 border-b flex justify-between items-center">
					<h2 className="text-xl font-bold">Gerador de Imagens ChatwitIA</h2>
					<button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">
						✕
					</button>
				</div>

				<form onSubmit={handleSubmit} className="p-4 border-b">
					<div className="mb-4">
						<label className="block text-sm font-medium mb-1">
							Descrição da imagem:
							<textarea
								value={prompt}
								onChange={(e) => setPrompt(e.target.value)}
								className="w-full p-2 border rounded mt-1"
								rows={3}
								placeholder="Descreva a imagem que você quer gerar..."
								required
							/>
						</label>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
						<div>
							<label className="block text-sm font-medium mb-1">
								Modelo:
								<select
									value={model}
									onChange={(e) => setModel(e.target.value as ImageModel)}
									className="w-full p-2 border rounded mt-1"
								>
									<option value="dall-e-2">DALL-E 2</option>
									<option value="dall-e-3">DALL-E 3</option>
								</select>
							</label>
						</div>

						<div>
							<label className="block text-sm font-medium mb-1">
								Tamanho:
								<select
									value={size}
									onChange={(e) => setSize(e.target.value as ImageSize)}
									className="w-full p-2 border rounded mt-1"
								>
									<option value="256x256">Pequeno (256x256)</option>
									<option value="512x512">Médio (512x512)</option>
									<option value="1024x1024">Grande (1024x1024)</option>
									{model === "dall-e-3" && (
										<>
											<option value="1792x1024">Paisagem (1792x1024)</option>
											<option value="1024x1792">Retrato (1024x1792)</option>
										</>
									)}
								</select>
							</label>
						</div>

						{model === "dall-e-3" && (
							<>
								<div>
									<label className="block text-sm font-medium mb-1">
										Qualidade:
										<select
											value={quality}
											onChange={(e) => setQuality(e.target.value as ImageQuality)}
											className="w-full p-2 border rounded mt-1"
										>
											<option value="standard">Padrão</option>
											<option value="hd">Alta Definição</option>
										</select>
									</label>
								</div>

								<div>
									<label className="block text-sm font-medium mb-1">
										Estilo:
										<select
											value={style}
											onChange={(e) => setStyle(e.target.value as ImageStyle)}
											className="w-full p-2 border rounded mt-1"
										>
											<option value="vivid">Vibrante</option>
											<option value="natural">Natural</option>
										</select>
									</label>
								</div>
							</>
						)}

						<div>
							<label className="block text-sm font-medium mb-1">
								Número de imagens:
								<select
									value={numberOfImages}
									onChange={(e) => setNumberOfImages(Number(e.target.value))}
									className="w-full p-2 border rounded mt-1"
								>
									{[1, 2, 3, 4].map((num) => (
										<option key={num} value={num}>
											{num}
										</option>
									))}
								</select>
							</label>
						</div>
					</div>

					<button
						type="submit"
						disabled={isLoading || !prompt.trim()}
						className={`w-full p-2 rounded ${
							isLoading || !prompt.trim()
								? "bg-gray-300 cursor-not-allowed"
								: "bg-blue-500 hover:bg-blue-600 text-white"
						}`}
					>
						{isLoading ? "Gerando imagens..." : "Gerar Imagens"}
					</button>
				</form>

				<div className="p-4">
					{error && (
						<div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4">
							<p className="font-semibold">Erro:</p>
							<p>{error}</p>
						</div>
					)}

					{images.length > 0 && (
						<div>
							<h3 className="text-lg font-medium mb-2">Imagens Geradas:</h3>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								{images.map((image, index) => (
									<div key={index} className="border rounded overflow-hidden">
										<img src={image.url} alt={`Imagem gerada ${index + 1}`} className="w-full h-auto" />
										<div className="p-2 bg-gray-50 flex justify-between">
											<button
												onClick={() => window.open(image.url, "_blank")}
												className="text-blue-500 hover:text-blue-700 text-sm"
											>
												Abrir
											</button>
											<a
												href={image.url}
												download={`chatwitia-image-${Date.now()}-${index}.png`}
												className="text-blue-500 hover:text-blue-700 text-sm"
											>
												Download
											</a>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
