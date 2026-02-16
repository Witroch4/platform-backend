import { type NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { writeFile } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { mkdir } from "fs/promises";

// Next.js 16: use exports individuais em vez de config object
export const runtime = "nodejs";

// Configurar o OpenAI
const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
	try {
		// Verificar se a requisição é multipart/form-data
		const formData = await req.formData();
		const audioFile = formData.get("file") as File;

		if (!audioFile) {
			return NextResponse.json({ error: "Nenhum arquivo de áudio enviado" }, { status: 400 });
		}

		// Criar diretório temporário se não existir
		const tempDir = join(process.cwd(), "tmp");
		try {
			await mkdir(tempDir, { recursive: true });
		} catch (err) {
			console.log("Diretório temporário já existe ou erro ao criar:", err);
		}

		// Gerar nome de arquivo único
		const fileName = `${uuidv4()}.webm`;
		const filePath = join(tempDir, fileName);

		// Salvar o arquivo temporariamente
		const buffer = Buffer.from(await audioFile.arrayBuffer());
		await writeFile(filePath, buffer);

		// Create a File object from Buffer
		const audioFileFromBuffer = new File([buffer], fileName, { type: "audio/webm" });

		// Enviar para OpenAI para transcrição
		const transcription = await openai.audio.transcriptions.create({
			file: audioFileFromBuffer,
			model: "whisper-1",
			language: "pt",
		});

		return NextResponse.json({ transcript: transcription.text });
	} catch (error) {
		console.error("Transcribe error:", error);
		return NextResponse.json({ error: "Erro ao processar áudio" }, { status: 500 });
	}
}
