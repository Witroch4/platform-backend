import React from "react";
import { Trash2, Settings, Brain } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ChatHeaderProps {
	modelId: string;
	canClear: boolean;
	onClear: () => void;
	onToggleSettings: () => void;
}

export default function ChatHeader({ modelId, canClear, onClear, onToggleSettings }: ChatHeaderProps) {
	// Mapear IDs de modelo para nomes mais amigáveis
	const getModelDisplayName = (id: string) => {
		const modelMap: Record<string, string> = {
			"chatgpt-4o-latest": "ChatGPT 4o",
			o3: "o3",
			"o4-mini": "o4-mini",
			"claude-3-7-sonnet-20250219": "Claude 3.7 Sonnet",
			"gpt-4.1": "GPT-4.1",
			"o4-mini-high": "o4-mini High",
			"gpt-4.1-latest": "GPT-4.1",
			"gpt-4.1-nano-2025-04-14": "GPT-4.1 Nano",
			"gpt-4.1-mini-2025-04-14": "GPT-4.1 Mini",
		};

		// Tenta encontrar um nome de exibição ou formata o ID de forma mais legível
		return modelMap[id] || id.replace("gpt-", "GPT-").replace(/-/g, " ");
	};

	const modelDisplayName = getModelDisplayName(modelId);

	return (
		<header className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-gray-900 dark:border-gray-800">
			<div className="flex items-center gap-2">
				<Brain size={20} className="text-blue-600" />
				<h2 className="text-lg font-medium">ChatwitIA</h2>
				<Badge className="ml-2">{modelDisplayName}</Badge>
			</div>

			<div className="flex items-center gap-2">
				{canClear && (
					<button
						onClick={onClear}
						className="flex items-center gap-1 text-gray-500 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xs"
						title="Limpar conversa"
					>
						<Trash2 size={14} />
						<span className="hidden sm:inline">Limpar</span>
					</button>
				)}

				<button
					onClick={onToggleSettings}
					className="flex items-center gap-1 text-gray-500 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xs"
					title="Configurações"
				>
					<Settings size={14} />
					<span className="hidden sm:inline">Config</span>
				</button>
			</div>
		</header>
	);
}
