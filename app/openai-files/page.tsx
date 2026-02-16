"use client";

import React, { useState } from "react";
import OpenAIFileUpload from "@/components/custom/OpenAIFileUpload";
import type { FileWithContent } from "@/hooks/useChatwitIA";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function OpenAIFilesDemo() {
	const [uploadedFiles, setUploadedFiles] = useState<FileWithContent[]>([]);
	const [selectedFile, setSelectedFile] = useState<FileWithContent | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [processResult, setProcessResult] = useState<string>("");
	const [processingPrompt, setProcessingPrompt] = useState<string>(
		"Extract the main content and summarize this document",
	);

	// Handle file upload completion
	const handleFileUploaded = (file: FileWithContent) => {
		setUploadedFiles((prev) => [...prev, file]);
		toast.success("File uploaded to OpenAI", {
			description: `${file.filename} is ready to use`,
		});
	};

	// Handle file removal
	const handleFileRemoved = (fileId: string) => {
		setUploadedFiles((prev) => prev.filter((file) => file.id !== fileId));

		// If the removed file was selected, clear selection
		if (selectedFile?.id === fileId) {
			setSelectedFile(null);
			setProcessResult("");
		}
	};

	// Process file using the OpenAI Assistants API
	const processFile = async () => {
		if (!selectedFile) {
			toast.error("No file selected for processing");
			return;
		}

		setIsProcessing(true);
		setProcessResult("");

		try {
			const response = await fetch("/api/chatwitia/files/process", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					fileId: selectedFile.id,
					prompt: processingPrompt,
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to process file");
			}

			setProcessResult(data.content);
			toast.success("File processed successfully");
		} catch (error: any) {
			console.error("Error processing file:", error);
			toast.error("Processing failed", {
				description: error.message || "Failed to process file",
			});
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<div className="container max-w-6xl py-10">
			<h1 className="text-3xl font-bold mb-8">OpenAI File Uploader Demo</h1>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
				{/* Upload section */}
				<Card>
					<CardHeader>
						<CardTitle>Upload Files to OpenAI</CardTitle>
						<CardDescription>Upload files for processing with OpenAI's Assistants API</CardDescription>
					</CardHeader>
					<CardContent>
						<OpenAIFileUpload onFileUploaded={handleFileUploaded} onFileRemoved={handleFileRemoved} />
					</CardContent>
				</Card>

				{/* Uploaded files section */}
				<Card>
					<CardHeader>
						<CardTitle>Your OpenAI Files</CardTitle>
						<CardDescription>
							{uploadedFiles.length
								? `${uploadedFiles.length} files uploaded and ready for processing`
								: "No files uploaded yet"}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{uploadedFiles.length > 0 ? (
							<div className="space-y-4">
								<h3 className="text-sm font-medium mb-2">Select a file to process:</h3>
								<div className="space-y-2">
									{uploadedFiles.map((file) => (
										<div
											key={file.id}
											className={`flex items-center p-3 rounded-md cursor-pointer border hover:bg-slate-50 transition-colors
                        ${selectedFile?.id === file.id ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
											onClick={() => setSelectedFile(file)}
										>
											<div className="flex-1">
												<p className="font-medium">{file.filename}</p>
												<p className="text-xs text-gray-500">
													{(file.bytes / 1024).toFixed(1)} KB · {new Date(file.created_at * 1000).toLocaleString()}
												</p>
											</div>
										</div>
									))}
								</div>
							</div>
						) : (
							<div className="text-center py-10 text-gray-500">
								<p>Upload files using the panel on the left</p>
							</div>
						)}
					</CardContent>
					<CardFooter className="flex justify-between">
						<input
							type="text"
							value={processingPrompt}
							onChange={(e) => setProcessingPrompt(e.target.value)}
							className="flex-1 p-2 border rounded-md mr-2 text-sm"
							placeholder="Enter processing prompt..."
							disabled={!selectedFile || isProcessing}
						/>
						<Button onClick={processFile} disabled={!selectedFile || isProcessing}>
							{isProcessing ? "Processing..." : "Process File"}
						</Button>
					</CardFooter>
				</Card>
			</div>

			{/* Results section */}
			{processResult && (
				<Card className="mt-8">
					<CardHeader>
						<CardTitle>Processing Results</CardTitle>
						<CardDescription>Content extracted from {selectedFile?.filename}</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="bg-slate-50 p-4 rounded-md whitespace-pre-wrap max-h-96 overflow-y-auto">
							{processResult}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
