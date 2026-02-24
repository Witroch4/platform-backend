import { saveAs } from "file-saver";
import { toast } from "sonner";

/**
 * Download recurso as TXT (plain text)
 */
export function downloadTxt(html: string, leadId: string) {
	const div = document.createElement("div");
	div.innerHTML = html;
	const text = div.textContent || div.innerText || "";
	const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
	saveAs(blob, `recurso_${leadId}.txt`);
	toast.success("Download iniciado", { description: "Arquivo TXT gerado." });
}

/**
 * Download recurso as PDF via print dialog
 */
export function downloadPdf(html: string, leadId: string) {
	const printWindow = window.open("", "_blank");
	if (!printWindow) {
		toast.error("Erro", { description: "Permita pop-ups para gerar o PDF." });
		return;
	}
	printWindow.document.write(`
		<html>
		<head>
			<title>Recurso - ${leadId}</title>
			<style>
				body { font-family: Arial, sans-serif; line-height: 1.6; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
				h1 { font-size: 18px; } h2 { font-size: 16px; } h3 { font-size: 14px; }
				p { margin: 0 0 12px 0; }
				strong { font-weight: 700; }
				u { text-decoration: underline; }
			</style>
		</head>
		<body>${html}</body>
		<script>window.onload = () => window.print();<\/script>
		</html>
	`);
	printWindow.document.close();
}

/**
 * Download recurso as DOCX via server-side API (html-to-docx requires Node.js)
 */
export async function downloadDocx(html: string, leadId: string) {
	try {
		const res = await fetch("/api/admin/leads-chatwit/export-docx", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ html, leadId }),
		});

		if (!res.ok) throw new Error(`Erro ${res.status}`);

		const blob = await res.blob();
		saveAs(blob, `recurso_${leadId}.docx`);
		toast.success("Download iniciado", { description: "Arquivo DOCX gerado." });
	} catch (err) {
		console.error("Erro ao gerar DOCX:", err);
		toast.error("Erro ao gerar DOCX", {
			description: "Tente novamente ou use o formato PDF.",
		});
	}
}

/**
 * Copy plain text to clipboard
 */
export async function copyToClipboard(html: string) {
	const div = document.createElement("div");
	div.innerHTML = html;
	const text = div.textContent || div.innerText || "";
	await navigator.clipboard.writeText(text);
	toast.success("Copiado!", { description: "Texto copiado para a área de transferência." });
}
