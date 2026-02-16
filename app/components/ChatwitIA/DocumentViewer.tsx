import React, { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Download, X, Maximize, Minimize } from "lucide-react";

// Set up PDF.js worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface DocumentViewerProps {
	fileUrl: string;
	fileName: string;
	onClose: () => void;
	fileType?: string;
}

export default function DocumentViewer({
	fileUrl,
	fileName,
	onClose,
	fileType = "application/pdf",
}: DocumentViewerProps) {
	const [numPages, setNumPages] = useState<number | null>(null);
	const [pageNumber, setPageNumber] = useState(1);
	const [fullscreen, setFullscreen] = useState(false);
	const [scale, setScale] = useState(1.0);

	useEffect(() => {
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", handleEsc);
		return () => window.removeEventListener("keydown", handleEsc);
	}, [onClose]);

	function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
		setNumPages(numPages);
		setPageNumber(1);
	}

	function changePage(offset: number) {
		setPageNumber((prevPageNumber) => {
			const newPage = prevPageNumber + offset;
			return numPages ? Math.min(Math.max(1, newPage), numPages) : 1;
		});
	}

	function previousPage() {
		changePage(-1);
	}

	function nextPage() {
		changePage(1);
	}

	function toggleFullscreen() {
		setFullscreen(!fullscreen);
	}

	// Increase or decrease scale (zoom)
	function changeScale(amount: number) {
		setScale((prevScale) => {
			const newScale = prevScale + amount;
			return Math.min(Math.max(0.5, newScale), 2.5); // Limit scale between 0.5 and 2.5
		});
	}

	// Render appropriate viewer based on file type
	const renderViewer = () => {
		if (fileType.includes("pdf") || fileType.includes("application/pdf")) {
			return (
				<Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess} className="flex justify-center">
					<Page
						pageNumber={pageNumber}
						scale={scale}
						renderTextLayer={false}
						renderAnnotationLayer={false}
						className="shadow-md"
					/>
				</Document>
			);
		} else if (fileType.includes("image")) {
			return (
				<div className="flex justify-center">
					<img
						src={fileUrl}
						alt={fileName}
						style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", transform: `scale(${scale})` }}
						className="shadow-md"
					/>
				</div>
			);
		} else if (fileType.includes("text") || fileType.includes("json")) {
			// For text files, show in a pre block
			return (
				<div className="overflow-auto bg-gray-50 p-4 rounded-md shadow-md">
					<pre className="whitespace-pre-wrap text-sm">{fileUrl}</pre>
				</div>
			);
		} else {
			// Generic file type we can't display
			return (
				<div className="text-center p-6">
					<p className="text-gray-700 mb-3">Este tipo de arquivo não pode ser visualizado diretamente.</p>
					<a
						href={fileUrl}
						download={fileName}
						className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
					>
						<Download size={16} />
						Download
					</a>
				</div>
			);
		}
	};

	return (
		<div
			className={`fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 ${fullscreen ? "overscroll-none" : ""}`}
		>
			<div
				className={`bg-white rounded-lg shadow-xl overflow-hidden flex flex-col ${
					fullscreen ? "w-full h-full" : "max-w-4xl w-full max-h-[90vh]"
				}`}
			>
				{/* Header */}
				<div className="flex items-center justify-between p-3 border-b bg-gray-50">
					<h3 className="font-medium truncate max-w-md">{fileName}</h3>
					<div className="flex items-center gap-2">
						<button
							onClick={() => changeScale(-0.1)}
							className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
							title="Diminuir zoom"
						>
							-
						</button>
						<span className="text-sm text-gray-600">{Math.round(scale * 100)}%</span>
						<button
							onClick={() => changeScale(0.1)}
							className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
							title="Aumentar zoom"
						>
							+
						</button>
						<a
							href={fileUrl}
							download={fileName}
							className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
							title="Download"
						>
							<Download size={18} />
						</a>
						<button
							onClick={toggleFullscreen}
							className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
							title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
						>
							{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
						</button>
						<button
							onClick={onClose}
							className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
							title="Fechar"
						>
							<X size={18} />
						</button>
					</div>
				</div>

				{/* Document Viewer */}
				<div className="flex-1 overflow-auto p-6">{renderViewer()}</div>

				{/* Footer with pagination (for PDFs) */}
				{fileType.includes("pdf") && numPages && (
					<div className="flex items-center justify-center p-3 border-t bg-gray-50">
						<button
							onClick={previousPage}
							disabled={pageNumber <= 1}
							className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded disabled:opacity-50 disabled:hover:bg-transparent"
						>
							<ChevronLeft size={20} />
						</button>
						<p className="mx-4 text-sm">
							Página <span className="font-medium">{pageNumber}</span> de{" "}
							<span className="font-medium">{numPages}</span>
						</p>
						<button
							onClick={nextPage}
							disabled={numPages ? pageNumber >= numPages : true}
							className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded disabled:opacity-50 disabled:hover:bg-transparent"
						>
							<ChevronRight size={20} />
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
