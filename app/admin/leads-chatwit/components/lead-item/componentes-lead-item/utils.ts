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
	// Verificar se o lead tem imagensConvertidas
	if (lead.imagensConvertidas) {
		try {
			// Desserializar a string JSON para obter o array de URLs
			const imageUrls = JSON.parse(lead.imagensConvertidas);
			// Verificar se é um array e retorna somente URLs válidas
			if (Array.isArray(imageUrls)) {
				return imageUrls.filter((url) => typeof url === "string" && url.trim().length > 0);
			}
		} catch (error) {
			console.error("Erro ao processar URLs de imagens convertidas:", error);
		}
	}

	// Fallback: se não tiver imagensConvertidas ou ocorrer erro, tenta pegar pelas propriedades dos arquivos
	return lead.arquivos
		.filter((a) => a.pdfConvertido)
		.map((a) => a.pdfConvertido || "")
		.filter((url) => url.length > 0);
};

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
