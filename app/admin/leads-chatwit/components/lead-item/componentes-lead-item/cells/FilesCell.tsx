"use client";

import { TableCell } from "@/components/ui/table";
import type { FileCellProps } from "../types";
import { getFileTypeIcon, openMinioFile } from "../utils";
import { LeadContextMenu, type ContextAction } from "@/app/admin/leads-chatwit/components/lead-context-menu";
import { DeleteFileButton } from "@/app/admin/leads-chatwit/components/delete-file-button";
import { FileText, File, Upload } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";

interface FilesCellProps extends FileCellProps {
	onContextMenuAction: (action: ContextAction, data?: any) => void;
	onDeleteFile: (fileId: string, type: "arquivo" | "pdf" | "imagem") => Promise<void>;
	onReloadAfterDelete: () => void;
}

export function FilesCell({ lead, onContextMenuAction, onDeleteFile, onReloadAfterDelete }: FilesCellProps) {
	const [isUploading, setIsUploading] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const getFileExtension = (fileType: string): string => {
		// Extrair extensão do tipo MIME ou do próprio tipo
		if (fileType.includes("/")) {
			const parts = fileType.split("/");
			const ext = parts[1]?.split("+")[0] || "file";

			// Mapeamento de tipos MIME comuns para extensões legíveis
			const mimeMap: Record<string, string> = {
				jpeg: "jpg",
				png: "png",
				gif: "gif",
				webp: "webp",
				"svg+xml": "svg",
				pdf: "pdf",
				msword: "doc",
				"vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
				"vnd.ms-excel": "xls",
				"vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
				plain: "txt",
				"octet-stream": "file",
			};

			return (mimeMap[ext] || ext).toUpperCase();
		}

		// Se já for uma extensão, apenas formatar
		return fileType.replace(".", "").toUpperCase().slice(0, 4);
	};

	const renderIcon = (fileType: string, extension: string) => {
		const iconData = getFileTypeIcon(fileType);

		if (iconData.icon === "Image") {
			return (
				<>
					<img src="/imagicon.svg" alt="Imagem" className="w-full h-full object-contain" />
					<span className="absolute -top-1 -left-1 bg-primary text-primary-foreground text-[8px] font-bold px-1 py-0.5 rounded shadow-sm z-10">
						{extension}
					</span>
				</>
			);
		}

		const IconComponent = iconData.icon === "FileText" ? FileText : File;
		return (
			<>
				<IconComponent className="w-full h-full" />
				<span className="absolute -top-1 -left-1 bg-primary text-primary-foreground text-[8px] font-bold px-1 py-0.5 rounded shadow-sm z-10">
					{extension}
				</span>
			</>
		);
	};

	const handleFileUpload = async (files: FileList | null) => {
		if (!files || files.length === 0) return;

		setIsUploading(true);

		try {
			const formData = new FormData();
			formData.append("leadId", lead.id);

			// Adicionar todos os arquivos ao FormData
			Array.from(files).forEach((file) => {
				formData.append("files", file);
			});

			const uploadPromise = fetch("/api/admin/leads-chatwit/upload-files", {
				method: "POST",
				body: formData,
			}).then(async (response) => {
				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error || "Erro ao fazer upload");
				}
				return response.json();
			});

			toast.promise(uploadPromise, {
				loading: `Enviando ${files.length} arquivo(s)...`,
				success: (data) => {
					onReloadAfterDelete(); // Recarregar os dados
					return `${data.files.length} arquivo(s) enviado(s) com sucesso`;
				},
				error: (err) => err.message || "Erro ao fazer upload",
			});

			await uploadPromise;
		} catch (error) {
			console.error("[FilesCell] Erro ao fazer upload:", error);
		} finally {
			setIsUploading(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);

		const files = e.dataTransfer.files;
		handleFileUpload(files);
	};

	const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		handleFileUpload(e.target.files);
	};

	const handleClickUpload = () => {
		fileInputRef.current?.click();
	};

	return (
		<TableCell className="min-w-[100px] max-w-[150px] p-2 align-middle">
			<div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto overflow-x-hidden pr-1 items-start content-start scrollbar-blue [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-button]:(w-0 h-0)">
				{lead.arquivos.length > 0 ? (
					lead.arquivos.map((arquivo) => {
						const extension = getFileExtension(arquivo.fileType);
						return (
							<LeadContextMenu
								key={arquivo.id}
								contextType="arquivo"
								onAction={onContextMenuAction}
								data={{ id: arquivo.id, type: "arquivo" }}
							>
								<div
									className="relative hover:bg-accent hover:text-accent-foreground w-[36px] h-[36px] flex items-center justify-center group cursor-pointer"
									onClick={() => openMinioFile(arquivo.dataUrl)}
								>
									{renderIcon(arquivo.fileType, extension)}
									<DeleteFileButton
										onDelete={() => onDeleteFile(arquivo.id, "arquivo")}
										fileType="arquivo"
										fileName={arquivo.fileType}
										onSuccess={onReloadAfterDelete}
									/>
								</div>
							</LeadContextMenu>
						);
					})
				) : (
					<div
						className={`col-span-3 flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-md border-2 border-dashed transition-all cursor-pointer ${isDragging
							? "border-primary bg-primary/10 scale-[1.02]"
							: "border-muted-foreground/30 hover:border-primary/60 hover:bg-accent/30"
							} ${isUploading ? "opacity-60 cursor-wait" : ""}`}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
						onClick={!isUploading ? handleClickUpload : undefined}
						title={isUploading ? "Enviando arquivos..." : "Clique ou arraste arquivos aqui"}
					>
						<input
							ref={fileInputRef}
							type="file"
							multiple
							accept="image/*,application/pdf,.doc,.docx"
							onChange={handleFileInputChange}
							className="hidden"
							disabled={isUploading}
						/>

						<Upload className={`h-5 w-5 ${isUploading ? "text-primary animate-pulse" : "text-muted-foreground"}`} />

						<p className="text-[10px] text-muted-foreground text-center leading-tight">
							{isUploading ? "Enviando..." : "Arraste ou clique"}
						</p>
					</div>
				)}
			</div>
		</TableCell>
	);
}
