import { OpenAI } from "openai";
import type { FilePurpose } from "./openai";
import axios from "axios";

// Initialize OpenAI client - will use API key from environment variables
const client = new OpenAI();

// File type utilities similar to FileUpload.tsx
export enum FileTypes {
	Image = "image",
	Pdf = "application/pdf",
	Audio = "audio",
	Video = "video",
	Text = "text",
	Json = "application/json",
	Csv = "text/csv",
	Other = "other",
}

/**
 * Determine appropriate purpose for OpenAI based on file type
 */
export function getFilePurpose(file: File): FilePurpose {
	const { type } = file;

	if (type.includes(FileTypes.Image)) {
		// Only image files should use vision purpose
		return "vision";
	} else if (type.includes(FileTypes.Pdf) || type.includes("application/json") || type.includes("text/")) {
		// PDFs and text files should use assistants purpose
		return "assistants";
	}

	return "user_data";
}

/**
 * Upload a file using Assistants API approach with progress tracking
 */
export async function uploadFileWithAssistants(
	file: File,
	purpose: FilePurpose = "user_data",
	onProgress?: (progress: number) => void,
) {
	try {
		console.log(`Starting Assistants API upload for file: ${file.name}, type: ${file.type}, size: ${file.size}`);

		// Check if the file type is appropriate for the purpose
		if (purpose === "vision" && !file.type.includes("image/")) {
			throw new Error(`Invalid file type ${file.type} for vision purpose. Only image files are supported.`);
		}

		// For PDFs, always use assistants purpose
		const isPdf = file.type.includes("application/pdf");
		const effectivePurpose = isPdf ? "assistants" : purpose;

		// Create a formData object with the file
		const formData = new FormData();
		formData.append("file", file);
		formData.append("purpose", effectivePurpose);

		// Report initial progress
		onProgress?.(10);

		// Upload via our API endpoint which handles larger files and reports progress
		const response = await axios.post("/api/chatwitia/files", formData, {
			headers: {
				"Content-Type": "multipart/form-data",
			},
			// Set a long timeout for large files
			timeout: 120000, // 2 minutes
			onUploadProgress: (progressEvent) => {
				const progress = Math.round((progressEvent.loaded / (progressEvent.total ?? 0)) * 100);
				onProgress?.(progress);
				console.log(`Upload progress: ${progress}%`);
			},
		});

		if (!response.data || response.data.error) {
			throw new Error(response.data?.error || "Unknown error during file upload");
		}

		console.log(`File uploaded successfully with ID: ${response.data.id}`);
		return response.data;
	} catch (error) {
		console.error("Error uploading file with Assistants API:", error);
		throw error;
	}
}

/**
 * Process file content using Assistants API with progress updates
 */
export async function processFileWithAssistant(
	fileId: string,
	prompt: string,
	onProgress?: (status: string, progress: number) => void,
) {
	try {
		console.log(`Processing file ${fileId} with assistant`);
		onProgress?.("Creating assistant", 10);

		// Create an assistant with file_search capability
		const assistant = await client.beta.assistants.create({
			model: "gpt-4o",
			description: "An assistant to process file contents",
			tools: [{ type: "file_search" }],
			name: "File Assistant",
		});

		onProgress?.("Creating thread", 20);

		// Create a thread
		const thread = await client.beta.threads.create();

		onProgress?.("Adding file to thread", 30);

		// Add message with file attachment
		await client.beta.threads.messages.create(thread.id, {
			role: "user",
			content: prompt,
			attachments: [{ file_id: fileId }],
		});

		onProgress?.("Processing file", 40);

		// Run the thread
		const run = await client.beta.threads.runs.create(thread.id, {
			assistant_id: assistant.id,
		});

		// Poll for completion
		let completedRun;
		let pollCount = 0;
		const maxPolls = 30; // Prevent infinite polling

		while (pollCount < maxPolls) {
			const runStatus = await client.beta.threads.runs.retrieve(run.id, {
				thread_id: thread.id,
			});

			// Calculate progress between 40-90% based on status
			const statusProgress = 40 + Math.min(pollCount * 2, 50);
			onProgress?.(runStatus.status, statusProgress);

			if (runStatus.status === "completed") {
				completedRun = runStatus;
				break;
			} else if (["failed", "cancelled", "expired"].includes(runStatus.status)) {
				throw new Error(`Run failed with status: ${runStatus.status}`);
			}

			// Wait before polling again
			await new Promise((resolve) => setTimeout(resolve, 1000));
			pollCount++;
		}

		if (pollCount >= maxPolls) {
			throw new Error("Processing timed out after multiple attempts");
		}

		onProgress?.("Getting results", 95);

		// Get the messages
		const messages = await client.beta.threads.messages.list(thread.id);

		// Get the last assistant message
		const assistantMessages = Array.from(messages.data)
			.filter((message) => message.role === "assistant")
			.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

		if (assistantMessages.length === 0) {
			throw new Error("No assistant response received");
		}

		// Extract text content from the first message
		const response = assistantMessages[0].content
			.filter((content) => content.type === "text")
			.map((content) => content.text.value)
			.join("\n");

		onProgress?.("Complete", 100);

		return {
			success: true,
			content: response,
			file_id: fileId,
		};
	} catch (error) {
		console.error("Error processing file with assistant:", error);
		throw error;
	} finally {
		// Clean up resources if necessary
	}
}

/**
 * Helper to check if file is suitable for OpenAI processing
 */
export function validateFileForOpenAI(file: File): { valid: boolean; error?: string } {
	// Check file size
	if (file.size > 25 * 1024 * 1024) {
		// 25MB
		return {
			valid: false,
			error: `File ${file.name} exceeds the 25MB size limit for OpenAI`,
		};
	}

	// Check file type
	const supportedTypes = [
		"image/jpeg",
		"image/png",
		"image/gif",
		"image/webp",
		"application/pdf",
		"text/plain",
		"text/csv",
		"text/markdown",
		"application/json",
		"application/jsonl",
	];

	if (!supportedTypes.some((type) => file.type.includes(type))) {
		return {
			valid: false,
			error: `File type ${file.type} is not supported by OpenAI. Supported types: Images, PDFs, text, JSON.`,
		};
	}

	return { valid: true };
}
