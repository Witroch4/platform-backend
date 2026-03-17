import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, Zap } from "lucide-react";
import { BatchSSEStatus } from "./BatchSSEStatus";
import { TurboModeBadge } from "./TurboModeIndicator";
import type { TurboModeConfig } from "./useTurboMode";

type AutomatedProgressDialogProps = {
	isOpen: boolean;
	progress: { current: number; total: number };
	currentStep: string;
	currentTask?: string;
	leadName?: string;
	sseConnections?: number;
	leadsBeingProcessed?: string[];
	totalLeads?: number;
	turboModeEnabled?: boolean;
	turboModeConfig?: TurboModeConfig | null;
};

export function AutomatedProgressDialog({
	isOpen,
	progress,
	currentStep,
	currentTask,
	leadName,
	sseConnections = 0,
	leadsBeingProcessed = [],
	totalLeads = 0,
	turboModeEnabled = false,
	turboModeConfig = null,
}: AutomatedProgressDialogProps) {
	const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

	const getStepTitle = () => {
		const baseTitle = (() => {
			switch (currentStep) {
				case "unifying-pdf":
					return "Unificando PDFs";
				case "generating-images":
					return "Gerando Imagens";
				case "dispatching-manuscripts":
					return "Enfileirando Digitações";
				case "preliminary-analysis":
					return "Enviando para Análise Preliminar";
				default:
					return "Processando...";
			}
		})();

		return turboModeEnabled ? `${baseTitle} (TURBO)` : baseTitle;
	};

	const getProgressText = () => {
		if (leadName) {
			return `${currentTask || getStepTitle()}: ${leadName} (${progress.current + 1} de ${progress.total})`;
		}
		return `${currentTask || getStepTitle()}: Lead ${progress.current + 1} de ${progress.total}`;
	};

	const showSSEStatus = totalLeads > 0 && (currentStep === "preliminary-analysis" || leadsBeingProcessed.length > 0);

	return (
		<Dialog open={isOpen}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{turboModeEnabled && <Zap className="h-4 w-4 text-yellow-500" />}
						{getStepTitle()}
						{turboModeEnabled && <TurboModeBadge enabled={true} config={turboModeConfig} className="ml-auto" />}
					</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4 py-6">
					<div className="flex flex-col items-center justify-center gap-4">
						<Loader2 className="h-8 w-8 animate-spin text-primary" />
						<div className="w-full text-center">
							<p className="text-sm text-muted-foreground mb-2">{getProgressText()}</p>
							<Progress value={percentage} className="mt-2" />
							<p className="text-xs text-muted-foreground mt-2">
								{turboModeEnabled
									? `Processamento TURBO em andamento (até ${turboModeConfig?.maxParallelLeads || 10} leads simultâneos)...`
									: "Processamento automático em andamento..."}
							</p>
						</div>
					</div>

					{showSSEStatus && (
						<BatchSSEStatus
							sseConnections={sseConnections}
							leadsBeingProcessed={leadsBeingProcessed}
							totalLeads={totalLeads}
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
