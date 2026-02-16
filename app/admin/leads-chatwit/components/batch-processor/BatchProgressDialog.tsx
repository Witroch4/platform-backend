// app/admin/leads-chatwit/components/batch-processor/BatchProgressDialog.tsx

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import { BatchSSEStatus } from "./BatchSSEStatus";

type BatchProgressDialogProps = {
	progress: { current: number; total: number };
	title: string;
	isSending?: boolean;
	sseConnections?: number;
	leadsBeingProcessed?: string[];
	totalLeads?: number;
};

export function BatchProgressDialog({
	progress,
	title,
	isSending = false,
	sseConnections = 0,
	leadsBeingProcessed = [],
	totalLeads = 0,
}: BatchProgressDialogProps) {
	const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
	const showSSEStatus = totalLeads > 0;

	return (
		<Dialog open>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4 py-4">
					<div className="flex flex-col items-center justify-center gap-4">
						<Loader2 className="h-8 w-8 animate-spin text-primary" />
						<div className="w-full text-center">
							{isSending ? (
								<p>Aguarde, por favor...</p>
							) : (
								<p>
									Processando lead {progress.current + 1} de {progress.total}
								</p>
							)}
							<Progress value={percentage} className="mt-2" />
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
