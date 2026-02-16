// app/admin/teste-cliente/page.tsx

"use client"; // ESSENCIAL: Marca este componente para rodar no cliente.

import { useState } from "react";
import { PDFDocument, PageSizes } from "pdf-lib";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";

// Funções de verificação (copiadas da nossa implementação do servidor)
const isImage = (url: string): boolean => {
	if (!url) return false;
	const imageExtensions = ["jpg", "jpeg", "png"];
	try {
		const extension = new URL(url).pathname.split(".").pop()?.toLowerCase() || "";
		return imageExtensions.includes(extension);
	} catch {
		return imageExtensions.some((ext) => url.toLowerCase().endsWith(`.${ext}`));
	}
};

const isPdf = (url: string): boolean => {
	if (!url) return false;
	try {
		return new URL(url).pathname.toLowerCase().endsWith(".pdf");
	} catch {
		return url.toLowerCase().endsWith(".pdf");
	}
};

export default function ClientSideUnifyTestPage() {
	const [urlsInput, setUrlsInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);
	const [processingLog, setProcessingLog] = useState<string[]>([]);

	const handleMerge = async () => {
		setIsLoading(true);
		setError(null);
		setMergedPdfUrl(null);
		setProcessingLog([]);

		const log = (message: string) => {
			console.log(message);
			setProcessingLog((prev) => [...prev, message]);
		};

		const urls = urlsInput.split("\n").filter((url) => url.trim() !== "");
		if (urls.length === 0) {
			setError("Por favor, insira ao menos uma URL.");
			setIsLoading(false);
			return;
		}

		log(`Iniciando unificação de ${urls.length} arquivos no NAVEGADOR...`);

		try {
			// 1. Criar um novo documento PDF no navegador
			const pdfDoc = await PDFDocument.create();

			for (const url of urls) {
				log(`Processando: ${url}`);
				try {
					// 2. Baixar o arquivo DIRETAMENTE no navegador
					//    ATENÇÃO: É aqui que o erro de CORS provavelmente vai acontecer!
					const response = await fetch(url);
					if (!response.ok) {
						throw new Error(`Falha ao baixar arquivo (status ${response.status})`);
					}
					const fileBuffer = await response.arrayBuffer();

					// 3. Processar o arquivo (PDF ou Imagem)
					if (isPdf(url)) {
						const donorPdfDoc = await PDFDocument.load(fileBuffer);
						const copiedPages = await pdfDoc.copyPages(donorPdfDoc, donorPdfDoc.getPageIndices());
						copiedPages.forEach((page) => pdfDoc.addPage(page));
						log(`--> PDF mesclado com sucesso.`);
					} else if (isImage(url)) {
						const extension = url.split(".").pop()?.toLowerCase() || "";
						let embeddedImage;
						if (extension === "jpg" || extension === "jpeg") {
							embeddedImage = await pdfDoc.embedJpg(fileBuffer);
						} else {
							embeddedImage = await pdfDoc.embedPng(fileBuffer);
						}

						const page = pdfDoc.addPage(PageSizes.A4);
						const { width: pageWidth, height: pageHeight } = page.getSize();
						const { width: imgWidth, height: imgHeight } = embeddedImage.scale(1);
						const ratio = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
						page.drawImage(embeddedImage, {
							x: (pageWidth - imgWidth * ratio) / 2,
							y: (pageHeight - imgHeight * ratio) / 2,
							width: imgWidth * ratio,
							height: imgHeight * ratio,
						});
						log(`--> Imagem incorporada com sucesso.`);
					}
				} catch (e: any) {
					log(`ERRO ao processar ${url}: ${e.message}`);
					throw new Error(
						`Falha ao processar a URL ${url}. Verifique o console do navegador para detalhes sobre o erro de CORS.`,
					);
				}
			}

			// 4. Salvar o PDF final e criar um link para download
			log("Salvando o PDF final...");
			const pdfBytes = await pdfDoc.save();
			const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
			const objectUrl = URL.createObjectURL(blob);
			setMergedPdfUrl(objectUrl);
			log("Processo concluído!");
		} catch (e: any) {
			setError(e.message);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="container mx-auto p-8 space-y-6">
			<h1 className="text-3xl font-bold">Teste de Unificação de PDF (Lado do Cliente)</h1>
			<p>
				Esta página executa o mesmo processo de unificação da API, mas 100% no seu navegador. Use para comparar a
				performance e entender as limitações (como o CORS).
			</p>

			<div className="space-y-2">
				<Label htmlFor="urls">URLs dos Arquivos (uma por linha)</Label>
				<Textarea
					id="urls"
					rows={10}
					placeholder="Cole as URLs dos seus arquivos aqui..."
					value={urlsInput}
					onChange={(e) => setUrlsInput(e.target.value)}
					disabled={isLoading}
				/>
			</div>

			<Button onClick={handleMerge} disabled={isLoading}>
				{isLoading ? "Processando no seu Navegador..." : "Iniciar Teste no Cliente"}
			</Button>

			{error && (
				<Alert variant="destructive">
					<Terminal className="h-4 w-4" />
					<AlertTitle>Ocorreu um Erro!</AlertTitle>
					<AlertDescription>
						{error}
						<p className="mt-2 text-xs">
							**Dica:** Se o erro for de "fetch", abra o console do seu navegador (F12) e verifique a aba "Console" ou
							"Rede" para detalhes sobre o erro de CORS.
						</p>
					</AlertDescription>
				</Alert>
			)}

			{mergedPdfUrl && (
				<div className="space-y-2">
					<h2 className="text-xl font-semibold">PDF Unificado com Sucesso!</h2>
					<Button asChild>
						<a href={mergedPdfUrl} download={`unificado-cliente-${Date.now()}.pdf`}>
							Baixar PDF Gerado
						</a>
					</Button>
				</div>
			)}

			{processingLog.length > 0 && (
				<div className="space-y-2">
					<h2 className="text-xl font-semibold">Log de Processamento:</h2>
					<div className="bg-gray-900 text-white font-mono text-sm p-4 rounded-md h-64 overflow-y-auto">
						{processingLog.map((log, index) => (
							<p key={index}>{`> ${log}`}</p>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
