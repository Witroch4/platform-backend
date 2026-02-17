"use client";

import { Button } from "@/components/ui/button";
import { Workflow } from "lucide-react";
import { FlowSelector } from "../panels/FlowSelector";

interface FlowSelectionViewProps {
	caixaId: string;
	selectedFlowId: string | null;
	onSelectFlow: (flowId: string | null) => void;
	onCreateNew: () => void;
	onEditSelected: () => void;
}

export function FlowSelectionView({
	caixaId,
	selectedFlowId,
	onSelectFlow,
	onCreateNew,
	onEditSelected,
}: FlowSelectionViewProps) {
	return (
		<div className="px-1">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-sm font-medium">Flow Builder</h3>
			</div>

			<div className="max-w-md">
				<FlowSelector
					inboxId={caixaId}
					selectedFlowId={selectedFlowId}
					onSelectFlow={onSelectFlow}
					onCreateNew={onCreateNew}
				/>

				{selectedFlowId && (
					<div className="mt-4">
						<Button onClick={onEditSelected} className="w-full">
							<Workflow className="h-4 w-4 mr-2" />
							Editar flow selecionado
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}

export default FlowSelectionView;
