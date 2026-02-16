import React, { useState, useRef } from "react";
import { Mic, MicOff, Headphones } from "lucide-react";

interface AudioInputProps {
	onTranscriptReady: (transcript: string) => void;
	onAudioMessage?: (audioBlob: Blob) => void;
}

export default function AudioInput({ onTranscriptReady, onAudioMessage }: AudioInputProps) {
	const [isRecording, setIsRecording] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [showAudioOptions, setShowAudioOptions] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const audioChunksRef = useRef<Blob[]>([]);

	const startRecording = async () => {
		setError(null);
		audioChunksRef.current = [];

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorderRef.current = new MediaRecorder(stream);

			mediaRecorderRef.current.ondataavailable = (event) => {
				if (event.data.size > 0) {
					audioChunksRef.current.push(event.data);
				}
			};

			mediaRecorderRef.current.onstop = () => {
				if (audioChunksRef.current.length > 0) {
					setShowAudioOptions(true);
				}
			};

			mediaRecorderRef.current.start();
			setIsRecording(true);
		} catch (err) {
			console.error("Erro ao iniciar gravação:", err);
			setError("Não foi possível acessar o microfone. Verifique as permissões.");
		}
	};

	const stopRecording = () => {
		if (mediaRecorderRef.current && isRecording) {
			mediaRecorderRef.current.stop();
			setIsRecording(false);

			// Parar todas as trilhas de áudio
			mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
		}
	};

	const processAudioTranscription = async () => {
		if (audioChunksRef.current.length === 0) return;

		setIsProcessing(true);
		try {
			const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
			const audioFile = new File([audioBlob], "recording.webm", { type: "audio/webm" });

			const formData = new FormData();
			formData.append("file", audioFile);

			const response = await fetch("/api/chatwitia/transcribe", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				throw new Error("Erro ao enviar áudio para transcrição");
			}

			const data = await response.json();

			if (data.error) {
				throw new Error(data.error);
			}

			onTranscriptReady(data.transcript);
			setShowAudioOptions(false);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
			setError(errorMessage);
			console.error("Erro ao processar áudio:", err);
		} finally {
			setIsProcessing(false);
		}
	};

	const sendAudioDirectly = () => {
		if (audioChunksRef.current.length === 0 || !onAudioMessage) return;

		const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
		onAudioMessage(audioBlob);
		setShowAudioOptions(false);
	};

	return (
		<>
			{error && (
				<div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 p-2 rounded-lg text-sm shadow-lg">
					{error}
					<button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700 font-bold">
						×
					</button>
				</div>
			)}

			{showAudioOptions && (
				<div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-white border rounded-lg shadow-lg p-3 z-10">
					<div className="flex flex-col gap-2">
						<p className="text-sm text-gray-600 mb-1">O que você gostaria de fazer com o áudio gravado?</p>
						<button
							onClick={processAudioTranscription}
							disabled={isProcessing}
							className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-md text-sm"
						>
							<Mic size={16} />
							Transcrever para texto
						</button>
						{onAudioMessage && (
							<button
								onClick={sendAudioDirectly}
								disabled={isProcessing}
								className="flex items-center gap-2 px-3 py-2 bg-purple-50 hover:bg-purple-100 rounded-md text-sm"
							>
								<Headphones size={16} />
								Enviar áudio para processamento direto
							</button>
						)}
						<button
							onClick={() => setShowAudioOptions(false)}
							className="flex items-center justify-center px-3 py-1 text-gray-500 hover:text-gray-700 text-xs"
						>
							Cancelar
						</button>
					</div>
				</div>
			)}

			<button
				type="button"
				onClick={isRecording ? stopRecording : startRecording}
				disabled={isProcessing}
				className={`p-2 rounded-md ${
					isProcessing
						? "text-gray-400 cursor-not-allowed"
						: isRecording
							? "text-red-500 hover:text-red-600"
							: "text-gray-500 hover:text-gray-700"
				}`}
				title={isRecording ? "Parar gravação" : "Gravar áudio"}
			>
				{isProcessing ? (
					<svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
						<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
						<path
							className="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
				) : isRecording ? (
					<MicOff size={20} />
				) : (
					<Mic size={20} />
				)}
			</button>
		</>
	);
}
