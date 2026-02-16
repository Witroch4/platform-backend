import React from "react";

interface SettingsModalProps {
	show: boolean;
	systemPrompt: string;
	setSystemPrompt: (v: string) => void;
	defaultSystemPrompt: string;
	onClose: () => void;
}

export default function SettingsModal({
	show,
	systemPrompt,
	setSystemPrompt,
	defaultSystemPrompt,
	onClose,
}: SettingsModalProps) {
	if (!show) return null;
	return (
		<div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 w-full max-w-2xl bg-white border rounded-lg shadow-lg p-4 z-10">
			<div className="flex justify-between items-center mb-4">
				<h3 className="font-bold">Configurações do ChatwitIA</h3>
				<button onClick={onClose} className="text-gray-500 hover:text-gray-700">
					✕
				</button>
			</div>

			<label className="block text-sm font-medium mb-3">
				System Prompt:
				<textarea
					value={systemPrompt}
					onChange={(e) => setSystemPrompt(e.target.value)}
					className="w-full p-2 border rounded mt-1 text-sm"
					rows={5}
				/>
				<p className="text-xs text-gray-500 mt-1">
					O system prompt define a personalidade e comportamento do ChatwitIA.
				</p>
			</label>

			<div className="flex justify-end gap-2 mt-2">
				<button
					onClick={() => setSystemPrompt(defaultSystemPrompt)}
					className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
				>
					Restaurar Padrão
				</button>
				<button onClick={onClose} className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">
					Salvar
				</button>
			</div>
		</div>
	);
}
