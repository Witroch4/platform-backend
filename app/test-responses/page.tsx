"use client";

import { useState, useEffect } from "react";

interface Model {
	id: string;
	name: string;
	description?: string;
}

export default function TestResponsesPage() {
	const [imageUrl, setImageUrl] = useState(
		"https://objstoreapi.witdev.com.br/chatwit-social/4325d304-dc0a-4d63-8a1e-68c68a43235a-1.jpg",
	);
	const [prompt, setPrompt] = useState("descreva");
	const [model, setModel] = useState("gpt-4o-2024-11-20");
	const [result, setResult] = useState<any>(null);
	const [loading, setLoading] = useState(false);
	const [availableModels, setAvailableModels] = useState<Model[]>([]);
	const [loadingModels, setLoadingModels] = useState(true);

	// Carregar modelos disponíveis da API
	useEffect(() => {
		const loadModels = async () => {
			try {
				setLoadingModels(true);
				const response = await fetch("/api/chatwitia");
				if (response.ok) {
					const data = await response.json();

					// Extrair modelos de chat das categorias
					const chatModels: Model[] = [];

					// Adicionar modelos GPT-4o
					if (data.models?.gpt4o) {
						data.models.gpt4o.forEach((m: any) => {
							chatModels.push({
								id: m.id,
								name: m.id.replace("gpt-", "GPT-").replace(/-/g, " "),
								description: `Modelo ${m.id}`,
							});
						});
					}

					// Adicionar modelos O Series
					if (data.models?.oSeries) {
						data.models.oSeries.forEach((m: any) => {
							chatModels.push({
								id: m.id,
								name: m.id.toUpperCase(),
								description: `Modelo ${m.id}`,
							});
						});
					}

					// Adicionar modelos GPT-5
					if (data.models?.gpt5) {
						data.models.gpt5.forEach((m: any) => {
							chatModels.push({
								id: m.id,
								name: m.id.replace("gpt-", "GPT-").replace(/-/g, " "),
								description: `Modelo ${m.id}`,
							});
						});
					}

					// Adicionar modelos GPT-4.1
					if (data.models?.gpt4) {
						data.models.gpt4.forEach((m: any) => {
							if (m.id.includes("gpt-4.1")) {
								chatModels.push({
									id: m.id,
									name: m.id.replace("gpt-", "GPT-").replace(/-/g, " "),
									description: `Modelo ${m.id}`,
								});
							}
						});
					}

					setAvailableModels(chatModels);

					// Definir modelo padrão se disponível
					if (chatModels.length > 0) {
						setModel(chatModels[0].id);
					}
				}
			} catch (error) {
				console.error("Erro ao carregar modelos:", error);
				// Fallback para modelos padrão
				setAvailableModels([
					{ id: "gpt-4o-2024-11-20", name: "GPT-4o 2024-11-20" },
					{ id: "gpt-4o", name: "GPT-4o" },
					{ id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
					{ id: "chatgpt-4o-latest", name: "ChatGPT 4o Latest" },
				]);
			} finally {
				setLoadingModels(false);
			}
		};

		loadModels();
	}, []);

	const testResponsesAPI = async () => {
		setLoading(true);
		setResult(null);

		try {
			const response = await fetch("/api/chatwitia/test-responses", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					imageUrl,
					prompt,
					model,
				}),
			});

			const data = await response.json();
			setResult(data);
		} catch (error) {
			setResult({
				success: false,
				error: error instanceof Error ? error.message : "Erro desconhecido",
			});
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="container mx-auto p-6 max-w-4xl">
			<h1 className="text-2xl font-bold mb-6">Teste da OpenAI Responses API</h1>

			<div className="space-y-4 mb-6">
				<div>
					<label className="block text-sm font-medium mb-2">URL da Imagem:</label>
					<input
						type="text"
						value={imageUrl}
						onChange={(e) => setImageUrl(e.target.value)}
						className="w-full p-2 border border-gray-300 rounded-md"
						placeholder="https://..."
					/>
				</div>

				<div>
					<label className="block text-sm font-medium mb-2">Prompt:</label>
					<input
						type="text"
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						className="w-full p-2 border border-gray-300 rounded-md"
						placeholder="Descreva esta imagem"
					/>
				</div>

				<div>
					<label className="block text-sm font-medium mb-2">Modelo:</label>
					<select
						value={model}
						onChange={(e) => setModel(e.target.value)}
						className="w-full p-2 border border-gray-300 rounded-md"
						disabled={loadingModels}
					>
						{loadingModels ? (
							<option>Carregando modelos...</option>
						) : (
							availableModels.map((modelOption) => (
								<option key={modelOption.id} value={modelOption.id}>
									{modelOption.name}
								</option>
							))
						)}
					</select>
				</div>

				<button
					onClick={testResponsesAPI}
					disabled={loading || loadingModels}
					className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 disabled:opacity-50"
				>
					{loading ? "Testando..." : "Testar Responses API"}
				</button>
			</div>

			{result && (
				<div className="bg-gray-100 p-4 rounded-md">
					<h2 className="text-lg font-semibold mb-2">Resultado:</h2>
					<pre className="text-sm overflow-auto max-h-96 bg-white p-3 rounded border">
						{JSON.stringify(result, null, 2)}
					</pre>
				</div>
			)}

			{imageUrl && (
				<div className="mt-6">
					<h2 className="text-lg font-semibold mb-2">Preview da Imagem:</h2>
					<img
						src={imageUrl}
						alt="Preview"
						className="max-w-full h-auto rounded-md border"
						onError={(e) => {
							e.currentTarget.style.display = "none";
						}}
					/>
				</div>
			)}
		</div>
	);
}
