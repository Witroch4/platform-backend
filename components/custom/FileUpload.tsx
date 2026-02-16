// components/custom/FileUpload.tsx

"use client";

import axios from "axios";
import { AudioWaveform, File as FileIcon, FileImage, FolderArchive, UploadCloud, Video, X } from "lucide-react";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Input } from "../ui/input";
import { Progress } from "../ui/progress";
import { ScrollArea } from "../ui/scroll-area";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Importação dos componentes de Tooltip

export interface UploadedFile {
	id: string;
	file?: File; // Tornado opcional para mídias existentes
	progress: number;
	url?: string; // URL da imagem original
	thumbnail_url?: string; // URL da thumbnail
	mime_type?: string;
	name?: string; // Nome técnico único
	original_name?: string; // Nome original do arquivo
	visible_name?: string; // Nome amigável para exibição
}

enum FileTypes {
	Image = "image",
	Pdf = "pdf",
	Audio = "audio",
	Video = "video",
	Other = "other",
}

const ImageColor = {
	bgColor: "bg-purple-600",
	fillColor: "fill-purple-600",
};

const PdfColor = {
	bgColor: "bg-blue-400",
	fillColor: "fill-blue-400",
};

const AudioColor = {
	bgColor: "bg-yellow-400",
	fillColor: "fill-yellow-400",
};

const VideoColor = {
	bgColor: "bg-green-400",
	fillColor: "fill-green-400",
};

const OtherColor = {
	bgColor: "bg-gray-400",
	fillColor: "fill-gray-400",
};

interface FileUploadProps {
	uploadedFiles: UploadedFile[];
	setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
}

export default function FileUpload({ uploadedFiles, setUploadedFiles }: FileUploadProps) {
	const getFileIconAndColor = (file?: File, mime_type?: string) => {
		if (file) {
			if (file.type.includes(FileTypes.Image)) {
				return {
					icon: <FileImage size={40} className={ImageColor.fillColor} />,
					color: ImageColor.bgColor,
				};
			}
			if (file.type.includes(FileTypes.Pdf)) {
				return {
					icon: <FileIcon size={40} className={PdfColor.fillColor} />,
					color: PdfColor.bgColor,
				};
			}
			if (file.type.includes(FileTypes.Audio)) {
				return {
					icon: <AudioWaveform size={40} className={AudioColor.fillColor} />,
					color: AudioColor.bgColor,
				};
			}
			if (file.type.includes(FileTypes.Video)) {
				return {
					icon: <Video size={40} className={VideoColor.fillColor} />,
					color: VideoColor.bgColor,
				};
			}
		} else if (mime_type) {
			if (mime_type.includes(FileTypes.Image)) {
				return {
					icon: <FileImage size={40} className={ImageColor.fillColor} />,
					color: ImageColor.bgColor,
				};
			}
			if (mime_type.includes(FileTypes.Pdf)) {
				return {
					icon: <FileIcon size={40} className={PdfColor.fillColor} />,
					color: PdfColor.bgColor,
				};
			}
			if (mime_type.includes(FileTypes.Audio)) {
				return {
					icon: <AudioWaveform size={40} className={AudioColor.fillColor} />,
					color: AudioColor.bgColor,
				};
			}
			if (mime_type.includes(FileTypes.Video)) {
				return {
					icon: <Video size={40} className={VideoColor.fillColor} />,
					color: VideoColor.bgColor,
				};
			}
		}
		return {
			icon: <FolderArchive size={40} className={OtherColor.fillColor} />,
			color: OtherColor.bgColor,
		};
	};

	const onDrop = useCallback(
		async (acceptedFiles: File[]) => {
			const newUploadedFiles: UploadedFile[] = acceptedFiles.map((file) => ({
				id: uuidv4(),
				file,
				progress: 0,
			}));

			setUploadedFiles((prev) => [...prev, ...newUploadedFiles]);

			// Iniciar o upload para o servidor
			newUploadedFiles.forEach((uploadedFile) => {
				uploadFile(uploadedFile);
			});
		},
		[setUploadedFiles],
	);

	const { getRootProps, getInputProps } = useDropzone({ onDrop, multiple: true });

	const uploadFile = async (uploadedFile: UploadedFile) => {
		if (!uploadedFile.file) return; // Evita tentar fazer upload de mídias existentes

		const formData = new FormData();
		formData.append("file", uploadedFile.file as File);

		try {
			const response = await axios.post("/api/upload", formData, {
				headers: {
					"Content-Type": "multipart/form-data",
				},
				onUploadProgress: (progressEvent) => {
					const progress = Math.round((progressEvent.loaded / (progressEvent.total ?? 0)) * 100);

					setUploadedFiles((prev) => prev.map((file) => (file.id === uploadedFile.id ? { ...file, progress } : file)));
				},
			});

			// Verificar se a resposta foi bem-sucedida
			if (response.data && !response.data.error) {
				// Atualizar o arquivo com as informações retornadas pelo MinIO
				setUploadedFiles((prev) =>
					prev.map((file) =>
						file.id === uploadedFile.id
							? {
									...file,
									progress: 100,
									url: response.data.url,
									thumbnail_url: response.data.thumbnail_url,
									mime_type: response.data.mime_type,
									name: response.data.fileName || uploadedFile.file?.name || "arquivo",
									original_name: uploadedFile.file?.name || "arquivo",
									visible_name: uploadedFile.file?.name || "arquivo",
								}
							: file,
					),
				);

				toast(`Upload de ${uploadedFile.file?.name || "arquivo"} concluído!`, {
					description: "Arquivo enviado com sucesso.",
				});
			} else {
				throw new Error(response.data.error || "Erro desconhecido no upload");
			}
		} catch (error: any) {
			console.error(`Erro ao fazer upload de ${uploadedFile.file?.name || "arquivo"}:`, error);

			toast.error(`Erro ao fazer upload de ${uploadedFile.file?.name || "arquivo"}.`, {
				description: error.message || "Não foi possível completar o upload.",
			});

			// Remover o arquivo da lista em caso de erro
			setUploadedFiles((prev) => prev.filter((file) => file.id !== uploadedFile.id));
		}
	};

	const handleRemoveUploadedFile = (fileId: string) => {
		setUploadedFiles((prev) => prev.filter((file) => file.id !== fileId));
		// Se necessário, adicione lógica para remover a mídia do backend
	};

	return (
		<TooltipProvider>
			<div>
				{/* Área de Upload */}
				<div>
					<label
						{...getRootProps()}
						className="relative flex flex-col items-center justify-center w-full py-6 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:bg-[#262626] hover:bg-gray-100 dark:hover:bg-gray-700 "
					>
						<div className="text-center">
							<div className="border p-2 rounded-md max-w-min mx-auto">
								<UploadCloud size={20} />
							</div>
							<p className="mt-2 text-sm text-gray-600">
								<span className="font-semibold">Arraste os arquivos</span>
							</p>
							<p className="text-xs text-gray-500">
								Clique para enviar arquivos &#40;arquivos devem ter menos de 10 MB&#41;
							</p>
						</div>
					</label>
					<Input
						{...getInputProps()}
						id="dropzone-file"
						accept="image/png, image/jpeg, application/pdf, audio/*, video/*"
						type="file"
						className="hidden"
						multiple
					/>
				</div>

				{/* Arquivos em Upload */}
				{uploadedFiles.some((file) => file.progress < 100) && (
					<div>
						<ScrollArea className="h-40 mt-4">
							<p className="font-medium my-2 text-muted-foreground text-sm">Arquivos em Upload</p>
							<div className="space-y-2 pr-3">
								{uploadedFiles
									.filter((file) => file.progress < 100)
									.map((file) => (
										<div
											key={file.id}
											className="flex justify-between gap-2 rounded-lg overflow-hidden border border-slate-100 group hover:pr-0 pr-2"
										>
											<div className="flex items-center flex-1 p-2">
												<div className="text-white">{getFileIconAndColor(file.file, file.mime_type).icon}</div>
												<div className="w-full ml-2 space-y-1">
													<div className="text-sm flex justify-between">
														<p className="text-muted-foreground ">{file.file?.name.slice(0, 25)}</p>
														<span className="text-xs">{file.progress}%</span>
													</div>
													<Progress
														value={file.progress}
														className={getFileIconAndColor(file.file, file.mime_type).color}
													/>
												</div>
											</div>
											<button
												onClick={() => handleRemoveUploadedFile(file.id)}
												className="bg-red-500 text-white transition-all items-center justify-center cursor-pointer px-2 hidden group-hover:flex"
												aria-label={`Cancelar upload de ${file.file?.name}`}
											>
												<X size={20} />
											</button>
										</div>
									))}
							</div>
						</ScrollArea>
					</div>
				)}

				{/* Arquivos Uploadados */}
				{uploadedFiles.some((file) => file.progress === 100) && (
					<div>
						<ScrollArea className="h-40 mt-4">
							<p className="font-medium my-2 text-muted-foreground text-sm">Arquivos Uploadados</p>
							<div className="space-y-2 pr-3">
								{uploadedFiles
									.filter((file) => file.progress === 100)
									.map((file) => (
										<div
											key={file.id}
											className="flex justify-between gap-2 rounded-lg overflow-hidden border border-slate-100 bg-white dark:bg-[#262626] text-black dark:text-[#49474A] group hover:pr-0 pr-2 hover:border-slate-300 transition-all"
										>
											<div className="flex items-center flex-1 p-2">
												<Tooltip>
													<TooltipTrigger asChild>
														{file.mime_type?.includes("image") ? (
															<img
																src={file.thumbnail_url || file.url}
																alt={file.original_name || file.visible_name || "Mídia"}
																className="w-12 h-12 object-cover rounded-md cursor-pointer"
															/>
														) : (
															<div className="text-white">{getFileIconAndColor(undefined, file.mime_type).icon}</div>
														)}
													</TooltipTrigger>
													<TooltipContent>
														<p>{file.original_name || file.visible_name || "Mídia"}</p>
													</TooltipContent>
												</Tooltip>
											</div>
											<button
												onClick={() => handleRemoveUploadedFile(file.id)}
												className="bg-red-500 text-white transition-all items-center justify-center cursor-pointer px-2 hidden group-hover:flex"
												aria-label={`Remover ${file.original_name || file.visible_name || "Mídia"}`}
											>
												<X size={20} />
											</button>
										</div>
									))}
							</div>
						</ScrollArea>
					</div>
				)}
			</div>
		</TooltipProvider>
	);
}
