// app/api/chatwitia/files/process/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { processFileWithAssistant } from "@/services/assistantsFileHandler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Configure to accept larger processing times
export const maxDuration = 120; // 2 minutes timeout

export async function POST(req: Request) {
	try {
		// Optional authentication
		const session = await auth();

		// Extract data from the request
		const body = await req.json();
		const { fileId, prompt } = body;

		if (!fileId) {
			return NextResponse.json({ error: "No file ID provided" }, { status: 400 });
		}

		if (!prompt) {
			return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
		}

		console.log(`API: Processing file: ${fileId} with prompt: ${prompt.substring(0, 50)}...`);

		// Process the file with the assistant
		const result = await processFileWithAssistant(fileId, prompt);

		console.log("API: File processing completed successfully");

		return NextResponse.json(result);
	} catch (error) {
		console.error("API: Error processing file:", error);

		// Extract detailed error message
		let errorMessage = "Error processing file";
		let details = "";

		if (error instanceof Error) {
			errorMessage = error.message;
			details = error.stack || "";
		} else if (typeof error === "string") {
			errorMessage = error;
		} else {
			details = JSON.stringify(error);
		}

		return NextResponse.json({ error: errorMessage, details }, { status: 500 });
	}
}
