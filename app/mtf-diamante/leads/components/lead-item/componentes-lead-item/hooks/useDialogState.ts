import { useState } from "react";
import type { ProcessType } from "../types";

export function useDialogState() {
	// Estados para diálogos principais
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [showGallery, setShowGallery] = useState(false);
	const [showFullImage, setShowFullImage] = useState(false);

	// Estados para prova
	const [showProvaDialog, setShowProvaDialog] = useState(false);
	const [confirmDeleteManuscrito, setConfirmDeleteManuscrito] = useState(false);
	const [manuscritoToDelete, setManuscritoToDelete] = useState<string | null>(null);
	const [showManuscritoImageSeletor, setShowManuscritoImageSeletor] = useState(false);
	const [isDigitando, setIsDigitando] = useState(false);

	// Estados para espelho
	const [showEspelhoSeletor, setShowEspelhoSeletor] = useState(false);
	const [showEspelhoDialog, setShowEspelhoDialog] = useState(false);
	const [confirmDeleteEspelho, setConfirmDeleteEspelho] = useState(false);
	const [selectedEspelhoImages, setSelectedEspelhoImages] = useState<string[]>([]);
	const [isEnviandoEspelho, setIsEnviandoEspelho] = useState(false);
	const [isUploadingEspelho, setIsUploadingEspelho] = useState(false);
	const [showEspelhoUploadDialog, setShowEspelhoUploadDialog] = useState(false);

	// Estados para análise
	const [showAnaliseDialog, setShowAnaliseDialog] = useState(false);
	const [showAnalisePreviewDrawer, setShowAnalisePreviewDrawer] = useState(false);
	const [showAnaliseValidadaDialog, setShowAnaliseValidadaDialog] = useState(false);
	const [isEnviandoAnalise, setIsEnviandoAnalise] = useState(false);
	const [isEnviandoPdf, setIsEnviandoPdf] = useState(false);
	const [isEnviandoAnaliseValidada, setIsEnviandoAnaliseValidada] = useState(false);

	// Estados para recurso
	const [showRecursoDialog, setShowRecursoDialog] = useState(false);
	const [isEnviandoRecurso, setIsEnviandoRecurso] = useState(false);

	// Estados para processo
	const [showProcessDialog, setShowProcessDialog] = useState(false);
	const [processType, setProcessType] = useState<ProcessType>("unify");
	const [processStartTime, setProcessStartTime] = useState<number | null>(null);

	// Estados gerais
	const [confirmDeleteAllFiles, setConfirmDeleteAllFiles] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [isDownloading, setIsDownloading] = useState(false);
	const [isLoadingImages, setIsLoadingImages] = useState(false);
	const [isDeletedFile, setIsDeletedFile] = useState<string | null>(null);
	const [selectedImage, setSelectedImage] = useState<string | null>(null);
	const [uploadingFile, setUploadingFile] = useState<File | null>(null);

	const resetAllDialogs = () => {
		setDetailsOpen(false);
		setConfirmDelete(false);
		setShowGallery(false);
		setShowFullImage(false);
		setShowProvaDialog(false);
		setConfirmDeleteManuscrito(false);
		setShowEspelhoSeletor(false);
		setShowEspelhoDialog(false);
		setConfirmDeleteEspelho(false);
		setShowAnaliseDialog(false);
		setShowAnalisePreviewDrawer(false);
		setShowRecursoDialog(false);
		setShowProcessDialog(false);
		setConfirmDeleteAllFiles(false);
	};

	return {
		// Estados
		detailsOpen,
		setDetailsOpen,
		confirmDelete,
		setConfirmDelete,
		showGallery,
		setShowGallery,
		showFullImage,
		setShowFullImage,
		showProvaDialog,
		setShowProvaDialog,
		confirmDeleteManuscrito,
		setConfirmDeleteManuscrito,
		manuscritoToDelete,
		setManuscritoToDelete,
		showManuscritoImageSeletor,
		setShowManuscritoImageSeletor,
		isDigitando,
		setIsDigitando,
		showEspelhoSeletor,
		setShowEspelhoSeletor,
		showEspelhoDialog,
		setShowEspelhoDialog,
		confirmDeleteEspelho,
		setConfirmDeleteEspelho,
		selectedEspelhoImages,
		setSelectedEspelhoImages,
		isEnviandoEspelho,
		setIsEnviandoEspelho,
		isUploadingEspelho,
		setIsUploadingEspelho,
		showEspelhoUploadDialog,
		setShowEspelhoUploadDialog,
		showAnaliseDialog,
		setShowAnaliseDialog,
		showAnalisePreviewDrawer,
		setShowAnalisePreviewDrawer,
		showAnaliseValidadaDialog,
		setShowAnaliseValidadaDialog,
		isEnviandoAnalise,
		setIsEnviandoAnalise,
		isEnviandoPdf,
		setIsEnviandoPdf,
		isEnviandoAnaliseValidada,
		setIsEnviandoAnaliseValidada,
		showRecursoDialog,
		setShowRecursoDialog,
		isEnviandoRecurso,
		setIsEnviandoRecurso,
		showProcessDialog,
		setShowProcessDialog,
		processType,
		setProcessType,
		processStartTime,
		setProcessStartTime,
		confirmDeleteAllFiles,
		setConfirmDeleteAllFiles,
		isSaving,
		setIsSaving,
		isDownloading,
		setIsDownloading,
		isLoadingImages,
		setIsLoadingImages,
		isDeletedFile,
		setIsDeletedFile,
		selectedImage,
		setSelectedImage,
		uploadingFile,
		setUploadingFile,

		// Métodos
		resetAllDialogs,
	};
}
