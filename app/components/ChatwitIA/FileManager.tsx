import React, { useState, useEffect } from "react";
import type { FileWithContent } from "@/hooks/useChatwitIA";
import { File, Trash2, Eye, Download, FileText, FileImage, PenTool, Copy } from "lucide-react";

interface FileManagerProps {
	files: FileWithContent[];
	onViewFile: (fileId: string) => void;
	onDeleteFile: (fileId: string) => void;
	onEditImage?: (fileId: string) => void;
	onVariationImage?: (fileId: string) => void;
	onInsertFileReference: (fileId: string, filename: string) => void;
	loading?: boolean;
}

export default function FileManager({
	files,
	onViewFile,
	onDeleteFile,
	onEditImage,
	onVariationImage,
	onInsertFileReference,
	loading = false,
}: FileManagerProps) {
	const [activeFilter, setActiveFilter] = useState<string | null>(null);
	const [searchTerm, setSearchTerm] = useState("");

	// Get unique purposes for filter
	const filePurposes = Array.from(new Set(files.map((file) => file.purpose)));

	// Filter files based on active filter and search term
	const filteredFiles = files.filter((file) => {
		const matchesFilter = !activeFilter || file.purpose === activeFilter;
		const matchesSearch = !searchTerm || file.filename.toLowerCase().includes(searchTerm.toLowerCase());
		return matchesFilter && matchesSearch;
	});

	// Helper to format bytes to readable string
	const formatBytes = (bytes: number): string => {
		if (bytes === 0) return "0 Bytes";

		const k = 1024;
		const sizes = ["Bytes", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));

		return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
	};

	// Helper to determine file icon
	const getFileIcon = (filename: string) => {
		const extension = filename.split(".").pop()?.toLowerCase();

		if (["png", "jpg", "jpeg", "gif", "webp"].includes(extension || "")) {
			return <FileImage className="text-blue-500" />;
		} else if (["pdf"].includes(extension || "")) {
			return <FileText className="text-red-500" />;
		} else if (["json", "jsonl"].includes(extension || "")) {
			return <File className="text-green-500" />;
		}

		return <File className="text-gray-500" />;
	};

	return (
		<div className="bg-white rounded-lg border shadow-sm">
			<div className="p-4 border-b">
				<h2 className="text-lg font-semibold">Arquivos</h2>

				{/* Search and filters */}
				<div className="mt-3 flex flex-wrap gap-2">
					<input
						type="text"
						placeholder="Buscar arquivos..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className="px-3 py-1.5 text-sm border rounded flex-1 min-w-[200px]"
					/>

					<div className="flex flex-wrap gap-1">
						<button
							onClick={() => setActiveFilter(null)}
							className={`px-2.5 py-1.5 text-xs rounded-full ${
								activeFilter === null ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
							}`}
						>
							Todos
						</button>

						{filePurposes.map((purpose) => (
							<button
								key={purpose}
								onClick={() => setActiveFilter(purpose)}
								className={`px-2.5 py-1.5 text-xs rounded-full ${
									activeFilter === purpose ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
								}`}
							>
								{purpose}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Files list */}
			<div className="p-4">
				{loading ? (
					<div className="flex justify-center py-4">
						<div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
					</div>
				) : filteredFiles.length === 0 ? (
					<div className="text-center py-6 text-gray-500">
						{searchTerm || activeFilter ? "Nenhum arquivo encontrado" : "Nenhum arquivo carregado"}
					</div>
				) : (
					<div className="grid gap-3 grid-cols-1 md:grid-cols-2">
						{filteredFiles.map((file) => (
							<div key={file.id} className="border rounded-lg p-3 hover:shadow-md transition-shadow">
								<div className="flex items-start gap-3">
									<div className="p-2 bg-gray-50 rounded-lg">{getFileIcon(file.filename)}</div>

									<div className="flex-1 min-w-0">
										<h3 className="font-medium text-sm truncate" title={file.filename}>
											{file.filename}
										</h3>
										<div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
											<span>{formatBytes(file.bytes)}</span>
											<span>•</span>
											<span>{new Date(file.created_at * 1000).toLocaleDateString()}</span>
										</div>
										<div className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 mt-2 inline-block">
											{file.purpose}
										</div>
									</div>
								</div>

								{/* Actions */}
								<div className="flex justify-end gap-1 mt-3">
									<button
										onClick={() => onViewFile(file.id)}
										className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full"
										title="Visualizar"
									>
										<Eye size={16} />
									</button>

									{file.filename.toLowerCase().endsWith(".png") ||
									file.filename.toLowerCase().endsWith(".jpg") ||
									file.filename.toLowerCase().endsWith(".jpeg") ? (
										<>
											{onEditImage && (
												<button
													onClick={() => onEditImage(file.id)}
													className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full"
													title="Editar imagem"
												>
													<PenTool size={16} />
												</button>
											)}
											{onVariationImage && (
												<button
													onClick={() => onVariationImage(file.id)}
													className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full"
													title="Gerar variação"
												>
													<Copy size={16} />
												</button>
											)}
										</>
									) : null}

									<button
										onClick={() => onInsertFileReference(file.id, file.filename)}
										className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-full"
										title="Inserir referência no chat"
									>
										<FileText size={16} />
									</button>

									<button
										onClick={() => onDeleteFile(file.id)}
										className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full"
										title="Deletar"
									>
										<Trash2 size={16} />
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
