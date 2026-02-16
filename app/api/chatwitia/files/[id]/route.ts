import { NextResponse } from "next/server";
import { openaiService } from "@/services/openai";
import { auth } from "@/auth";

// GET /api/chatwitia/files/[id] ─ detalhes do arquivo
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		await auth(); // se precisar da sessão, use o retorno

		const { id: fileId } = await params; // ⬅️ await na Promise

		if (!fileId) {
			return NextResponse.json({ error: "No file ID provided" }, { status: 400 });
		}

		console.log(`API: Recuperando detalhes do arquivo ID: ${fileId}`);
		const response = await openaiService.retrieveFile(fileId);

		console.log(`API: Detalhes do arquivo recuperados com sucesso: ${response.filename || "sem nome"}`);
		return NextResponse.json(response);
	} catch (error) {
		return handleError("recuperar arquivo", error);
	}
}

// DELETE /api/chatwitia/files/[id] ─ exclui o arquivo
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		await auth();

		const { id: fileId } = await params;

		if (!fileId) {
			return NextResponse.json({ error: "No file ID provided" }, { status: 400 });
		}

		console.log(`API: Excluindo arquivo com ID: ${fileId}`);
		const response = await openaiService.deleteFile(fileId);

		console.log(`API: Arquivo excluído com sucesso: ${fileId}`);
		return NextResponse.json(response);
	} catch (error) {
		return handleError("excluir arquivo", error);
	}
}

/** Tratamento padronizado de erros */
function handleError(acao: string, error: unknown) {
	console.error(`API: Erro ao ${acao}:`, error);

	let message = `Erro ao ${acao}`;
	let details = "";

	if (error instanceof Error) {
		message = error.message;
		details = error.stack ?? "";

		if (message.includes("No such file") || message.includes("404")) {
			return NextResponse.json({ error: "Arquivo não encontrado", details }, { status: 404 });
		}
	} else if (typeof error === "string") {
		message = error;
	} else {
		details = JSON.stringify(error);
	}

	return NextResponse.json({ error: message, details }, { status: 500 });
}
