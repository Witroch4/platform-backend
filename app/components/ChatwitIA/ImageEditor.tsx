import type React from "react";
import { useState, useRef, useEffect } from "react";
import { X, Save, Download, Image as ImageIcon, Eraser, Undo, Redo, Trash2 } from "lucide-react";

interface ImageEditorProps {
	imageUrl: string;
	fileName: string;
	onClose: () => void;
	onSave: (editedImage: File, prompt: string, mask?: File) => Promise<any>;
}

export default function ImageEditor({ imageUrl, fileName, onClose, onSave }: ImageEditorProps) {
	const [prompt, setPrompt] = useState("");
	const [isDrawing, setIsDrawing] = useState(false);
	const [tool, setTool] = useState<"brush" | "eraser">("brush");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [brushSize, setBrushSize] = useState(10);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const maskCanvasRef = useRef<HTMLCanvasElement>(null);
	const imageInstance = useRef<HTMLImageElement | null>(null);

	// State for undo/redo
	const [undoStack, setUndoStack] = useState<ImageData[]>([]);
	const [redoStack, setRedoStack] = useState<ImageData[]>([]);

	// Initialize canvas when component mounts
	useEffect(() => {
		// Criar uma nova instância de Image do DOM, não o componente React
		const img = document.createElement("img");
		img.crossOrigin = "anonymous";
		img.src = imageUrl;
		imageInstance.current = img;

		img.onload = () => {
			const canvas = canvasRef.current;
			const maskCanvas = maskCanvasRef.current;

			if (canvas && maskCanvas) {
				// Set canvas dimensions to match image
				canvas.width = img.width;
				canvas.height = img.height;
				maskCanvas.width = img.width;
				maskCanvas.height = img.height;

				// Draw image on main canvas
				const ctx = canvas.getContext("2d");
				if (ctx) {
					ctx.drawImage(img, 0, 0);

					// Save initial state for undo
					const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
					setUndoStack([imageData]);
				}

				// Initialize mask canvas with transparent
				const maskCtx = maskCanvas.getContext("2d");
				if (maskCtx) {
					maskCtx.fillStyle = "rgba(0, 0, 0, 0)";
					maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
				}
			}
		};

		return () => {
			// Clean up
			img.onload = null;
		};
	}, [imageUrl]);

	// Download image from URL and convert to File
	useEffect(() => {
		const fetchImage = async () => {
			try {
				const response = await fetch(imageUrl);
				const blob = await response.blob();
				const file = new File([blob], fileName, { type: blob.type });
				setImageFile(file);
			} catch (err) {
				console.error("Error fetching image:", err);
				setError("Não foi possível carregar a imagem para edição.");
			}
		};

		fetchImage();
	}, [imageUrl, fileName]);

	// Handle drawing on mask canvas
	const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
		setIsDrawing(true);
		draw(e);

		// Save current state for undo
		saveCurrentState();
	};

	const endDrawing = () => {
		setIsDrawing(false);
	};

	const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (!isDrawing) return;

		const canvas = maskCanvasRef.current;
		const ctx = canvas?.getContext("2d");

		if (!ctx || !canvas) return;

		// Get mouse position relative to canvas
		const rect = canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left) * (canvas.width / rect.width);
		const y = (e.clientY - rect.top) * (canvas.height / rect.height);

		ctx.lineWidth = brushSize;
		ctx.lineCap = "round";

		if (tool === "brush") {
			// Draw mask in white (fully opaque)
			ctx.strokeStyle = "rgba(255, 255, 255, 1)";
		} else if (tool === "eraser") {
			// Erase by setting transparent
			ctx.strokeStyle = "rgba(0, 0, 0, 0)";
			ctx.globalCompositeOperation = "destination-out";
		}

		ctx.lineTo(x, y);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(x, y);

		// Reset composite operation
		ctx.globalCompositeOperation = "source-over";
	};

	// Save current state for undo
	const saveCurrentState = () => {
		const maskCanvas = maskCanvasRef.current;
		if (!maskCanvas) return;

		const maskCtx = maskCanvas.getContext("2d");
		if (!maskCtx) return;

		const imageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
		setUndoStack((prev) => [...prev, imageData]);
		// Clear redo stack when new drawing is made
		setRedoStack([]);
	};

	// Undo last drawing action
	const undo = () => {
		if (undoStack.length <= 1) return;

		const maskCanvas = maskCanvasRef.current;
		const maskCtx = maskCanvas?.getContext("2d");

		if (!maskCanvas || !maskCtx) return;

		// Remove current state
		const newUndoStack = [...undoStack];
		const currentState = newUndoStack.pop();

		if (!currentState) return;

		// Add to redo stack
		setRedoStack((prev) => [...prev, currentState]);

		// Get previous state
		const previousState = newUndoStack[newUndoStack.length - 1];

		// Apply previous state
		maskCtx.putImageData(previousState, 0, 0);

		// Update undo stack
		setUndoStack(newUndoStack);
	};

	// Redo last undone action
	const redo = () => {
		if (redoStack.length === 0) return;

		const maskCanvas = maskCanvasRef.current;
		const maskCtx = maskCanvas?.getContext("2d");

		if (!maskCanvas || !maskCtx) return;

		// Get last state from redo stack
		const newRedoStack = [...redoStack];
		const nextState = newRedoStack.pop();

		if (!nextState) return;

		// Apply state
		maskCtx.putImageData(nextState, 0, 0);

		// Update stacks
		setRedoStack(newRedoStack);
		setUndoStack((prev) => [...prev, nextState]);
	};

	// Clear mask
	const clearMask = () => {
		const maskCanvas = maskCanvasRef.current;
		const maskCtx = maskCanvas?.getContext("2d");

		if (!maskCanvas || !maskCtx) return;

		// Save current state before clearing
		saveCurrentState();

		// Clear canvas
		maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
	};

	// Handle form submission
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!imageFile) {
			setError("Arquivo de imagem não disponível.");
			return;
		}

		if (!prompt.trim()) {
			setError("Por favor, forneça um prompt para a edição.");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			// Convert mask canvas to a file
			const maskCanvas = maskCanvasRef.current;

			if (!maskCanvas) {
				throw new Error("Canvas de máscara não disponível.");
			}

			// Convert canvas to blob
			const maskBlob = await new Promise<Blob>((resolve, reject) => {
				maskCanvas.toBlob((blob) => {
					if (blob) {
						resolve(blob);
					} else {
						reject(new Error("Falha ao converter máscara para blob."));
					}
				}, "image/png");
			});

			// Create File from blob
			const maskFile = new File([maskBlob], "mask.png", { type: "image/png" });

			// Call onSave with the image file, prompt, and mask
			await onSave(imageFile, prompt, maskFile);

			// Close the editor after successful save
			onClose();
		} catch (err) {
			console.error("Error saving edited image:", err);
			setError("Falha ao salvar a imagem editada.");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
			<div className="bg-white rounded-lg shadow-xl overflow-hidden flex flex-col w-full max-w-5xl max-h-[90vh]">
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b">
					<h3 className="font-medium">Editar Imagem: {fileName}</h3>
					<button onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-full">
						<X size={20} />
					</button>
				</div>

				{/* Content */}
				<div className="flex flex-col md:flex-row flex-1 overflow-hidden">
					{/* Canvas area */}
					<div className="flex-1 relative overflow-auto p-4 flex items-center justify-center bg-gray-100">
						{/* Main image canvas (bottom layer) */}
						<canvas ref={canvasRef} className="absolute top-0 left-0" style={{ zIndex: 1 }} />

						{/* Mask canvas (top layer) */}
						<canvas
							ref={maskCanvasRef}
							className="absolute top-0 left-0"
							style={{ zIndex: 2 }}
							onMouseDown={startDrawing}
							onMouseUp={endDrawing}
							onMouseOut={endDrawing}
							onMouseMove={draw}
						/>

						{/* Tools panel */}
						<div className="absolute top-4 left-4 bg-white rounded-lg shadow-md p-2 flex flex-col gap-2 z-10">
							<button
								onClick={() => setTool("brush")}
								className={`p-2 rounded-md ${
									tool === "brush" ? "bg-blue-100 text-blue-700" : "text-gray-700 hover:bg-gray-100"
								}`}
								title="Pincel (máscara)"
							>
								<ImageIcon size={20} />
							</button>
							<button
								onClick={() => setTool("eraser")}
								className={`p-2 rounded-md ${
									tool === "eraser" ? "bg-blue-100 text-blue-700" : "text-gray-700 hover:bg-gray-100"
								}`}
								title="Borracha"
							>
								<Eraser size={20} />
							</button>
							<div className="border-t border-gray-200 my-1"></div>
							<button
								onClick={undo}
								disabled={undoStack.length <= 1}
								className="p-2 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
								title="Desfazer"
							>
								<Undo size={20} />
							</button>
							<button
								onClick={redo}
								disabled={redoStack.length === 0}
								className="p-2 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
								title="Refazer"
							>
								<Redo size={20} />
							</button>
							<button
								onClick={clearMask}
								className="p-2 rounded-md text-red-600 hover:bg-red-50"
								title="Limpar máscara"
							>
								<Trash2 size={20} />
							</button>

							{/* Brush size slider */}
							<div className="mt-2 px-2">
								<input
									type="range"
									min="1"
									max="50"
									value={brushSize}
									onChange={(e) => setBrushSize(Number.parseInt(e.target.value))}
									className="w-full"
								/>
								<div className="text-xs text-center text-gray-500 mt-1">Tamanho: {brushSize}px</div>
							</div>
						</div>

						{/* Instructions */}
						<div className="absolute bottom-4 left-4 right-4 bg-white/90 rounded-md p-3 text-sm z-10">
							<p className="font-medium mb-1">Instruções:</p>
							<ul className="list-disc pl-5 text-gray-700 text-xs space-y-1">
								<li>
									Use o <strong>pincel</strong> para pintar as áreas que deseja editar (máscara branca)
								</li>
								<li>
									Use a <strong>borracha</strong> para remover partes da máscara
								</li>
								<li>Forneça um prompt descrevendo o que deseja alterar nas áreas selecionadas</li>
								<li>Quanto mais precisa for a máscara, melhores serão os resultados</li>
							</ul>
						</div>
					</div>

					{/* Settings sidebar */}
					<div className="w-full md:w-80 p-4 border-t md:border-t-0 md:border-l bg-gray-50 overflow-y-auto flex flex-col">
						<form onSubmit={handleSubmit}>
							<div className="mb-4">
								<label className="block text-sm font-medium mb-1">Descreva as alterações desejadas:</label>
								<textarea
									value={prompt}
									onChange={(e) => setPrompt(e.target.value)}
									placeholder="Descreva o que você quer mudar nas áreas selecionadas..."
									className="w-full p-2.5 border rounded-md text-sm min-h-[100px]"
									required
								/>
								<p className="text-xs text-gray-500 mt-1">
									Seja específico sobre o que você deseja ver nas áreas selecionadas pela máscara.
								</p>
							</div>

							{error && (
								<div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm">{error}</div>
							)}

							<div className="flex gap-2 justify-end mt-2">
								<button
									type="button"
									onClick={onClose}
									className="px-3 py-2 border rounded-md text-sm"
									disabled={isLoading}
								>
									Cancelar
								</button>
								<button
									type="submit"
									className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm flex items-center gap-1 hover:bg-blue-700 disabled:bg-blue-400"
									disabled={isLoading || !prompt.trim()}
								>
									{isLoading ? (
										<>
											<span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
											<span>Processando...</span>
										</>
									) : (
										<>
											<Save size={16} />
											<span>Salvar edições</span>
										</>
									)}
								</button>
							</div>
						</form>
					</div>
				</div>
			</div>
		</div>
	);
}
