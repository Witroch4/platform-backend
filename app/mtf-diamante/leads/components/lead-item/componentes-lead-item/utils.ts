import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { LeadChatwit } from "../../../types";

const NEW_LEAD_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutos

export const isNewLead = (createdAt: string | Date): boolean => {
	const created = new Date(createdAt).getTime();
	const now = Date.now();
	return now - created < NEW_LEAD_THRESHOLD_MS;
};

export const formatDate = (date: string | Date) => {
	return format(new Date(date), "dd/MM/yyyy HH:mm", { locale: ptBR });
};

export const getDisplayName = (lead: LeadChatwit) => {
	return lead.nomeReal || lead.name || "Lead sem nome";
};

export const getFileTypeIcon = (fileType: string) => {
	switch (fileType.toLowerCase()) {
		case "pdf":
			return { icon: "FileText", className: "h-3.5 w-3.5 text-red-500" };
		case "image":
		case "jpg":
		case "jpeg":
		case "png":
			return { icon: "Image", className: "h-3.5 w-3.5 text-green-500" };
		case "doc":
		case "docx":
		case "xls":
		case "xlsx":
		case "ppt":
		case "pptx":
			return { icon: "FileText", className: "h-3.5 w-3.5 text-blue-500" };
		default:
			return { icon: "File", className: "h-3.5 w-3.5" };
	}
};

export const getConvertedImages = (lead: LeadChatwit): string[] => {
	const isUsableImageUrl = (value: unknown): value is string =>
		typeof value === "string" && /^https?:\/\//i.test(value.trim());

	// Verificar se o lead tem imagensConvertidas
	if (lead.imagensConvertidas) {
		try {
			// Desserializar a string JSON para obter o array de URLs
			const imageUrls = JSON.parse(lead.imagensConvertidas);
			// Verificar se é um array e retorna somente URLs válidas
			if (Array.isArray(imageUrls)) {
				return imageUrls.filter(isUsableImageUrl);
			}
		} catch (error) {
			console.error("Erro ao processar URLs de imagens convertidas:", error);
		}
	}

	// Fallback: se não tiver imagensConvertidas ou ocorrer erro, tenta pegar pelas propriedades dos arquivos
	return lead.arquivos
		.filter((a) => a.pdfConvertido)
		.map((a) => a.pdfConvertido || "")
		.filter(isUsableImageUrl);
};

export const hasConvertedImages = (lead: LeadChatwit) => getConvertedImages(lead).length > 0;

export const hasEspelhoData = (lead: LeadChatwit) => {
	const temImagensEspelho = lead.espelhoCorrecao && lead.espelhoCorrecao !== "[]" && lead.espelhoCorrecao !== '""';
	const temTextoEspelho =
		!!lead.textoDOEspelho &&
		((typeof lead.textoDOEspelho === "string" && lead.textoDOEspelho.trim() !== "") ||
			(Array.isArray(lead.textoDOEspelho) && lead.textoDOEspelho.length > 0) ||
			(typeof lead.textoDOEspelho === "object" && lead.textoDOEspelho !== null));
	return temImagensEspelho || temTextoEspelho;
};

export const openExternalUrl = (url: string) => {
	window.open(url, "_blank");
};

const MINIO_HOST = process.env.NEXT_PUBLIC_S3_ENDPOINT || "objstoreapi.witdev.com.br";

/**
 * Abre arquivo gerando presigned URL on-demand via /api/presigned-url.
 * Suporta URLs do MinIO (qualquer bucket) e URLs Active Storage do Chatwit.
 * Para URLs externas que não são MinIO nem Active Storage, abre direto.
 */
export const openMinioFile = async (url: string): Promise<void> => {
	if (!url) return;

	const isMinioUrl = url.includes(MINIO_HOST);
	const isActiveStorage = url.includes("/rails/active_storage/");

	// Se não é MinIO nem Active Storage, abrir direto
	if (!isMinioUrl && !isActiveStorage) {
		window.open(url, "_blank");
		return;
	}

	try {
		const res = await fetch("/api/presigned-url", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url }),
		});

		if (!res.ok) throw new Error("Falha ao gerar URL de acesso");

		const { presigned_url } = await res.json();
		window.open(presigned_url, "_blank");
	} catch (error) {
		console.error("[openMinioFile] Erro:", error);
		// Fallback: tenta abrir URL original
		window.open(url, "_blank");
	}
};

export const openChatwitChat = (leadUrl: string | null) => {
	if (!leadUrl) return false;
	openExternalUrl(leadUrl);
	return true;
};

export const openWhatsApp = (phoneNumber: string | null) => {
	if (!phoneNumber) return false;
	const cleanPhone = phoneNumber.replace(/\D/g, "");
	openExternalUrl(`https://wa.me/${cleanPhone}`);
	return true;
};
