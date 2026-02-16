import JSZip from "jszip";
import { saveAs } from "file-saver";

export async function downloadImagesAsZip(images: string[], name = "imagens") {
	// Verifica se há imagens para baixar
	if (!images || images.length === 0) {
		console.error("Nenhuma imagem para baixar");
		return false;
	}

	try {
		// Cria um novo arquivo ZIP
		const zip = new JSZip();
		const imgFolder = zip.folder("imagens");

		if (!imgFolder) {
			throw new Error("Não foi possível criar a pasta no arquivo ZIP");
		}

		// Array para armazenar as promessas de download
		const downloadPromises = images.map(async (url, index) => {
			try {
				// Busca a imagem
				const response = await fetch(url, {
					method: "GET",
					headers: {
						"Cache-Control": "no-cache",
					},
					mode: "cors",
				});

				if (!response.ok) {
					throw new Error(`Erro ao baixar imagem ${index + 1}: ${response.statusText}`);
				}

				// Converte a resposta para blob
				const blob = await response.blob();

				// Extrai o nome do arquivo da URL, ou usa um nome padrão
				let filename = url.split("/").pop();
				if (!filename) {
					filename = `imagem-${index + 1}.${getExtensionFromMimeType(blob.type)}`;
				}

				// Adiciona a imagem ao ZIP
				imgFolder.file(filename, blob);
				return true;
			} catch (error) {
				console.error(`Erro ao processar imagem ${index + 1}:`, error);
				return false;
			}
		});

		// Aguarda todas as imagens serem baixadas
		const results = await Promise.all(downloadPromises);
		const successCount = results.filter(Boolean).length;

		if (successCount === 0) {
			throw new Error("Nenhuma imagem pôde ser baixada");
		}

		// Gera o arquivo ZIP
		const zipBlob = await zip.generateAsync({ type: "blob" });

		// Salva o arquivo ZIP
		saveAs(zipBlob, `${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${new Date().getTime()}.zip`);

		return {
			success: true,
			total: images.length,
			successCount: successCount,
			failed: images.length - successCount,
		};
	} catch (error) {
		console.error("Erro ao criar arquivo ZIP:", error);
		return { success: false, error };
	}
}

function getExtensionFromMimeType(mimeType: string): string {
	const mimeTypes: Record<string, string> = {
		"image/jpeg": "jpg",
		"image/png": "png",
		"image/gif": "gif",
		"image/webp": "webp",
		"image/svg+xml": "svg",
	};

	return mimeTypes[mimeType] || "png";
}
