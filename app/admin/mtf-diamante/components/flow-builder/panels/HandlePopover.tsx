"use client";

import { useState, useCallback, type MouseEvent } from "react";
import type { Node, Edge } from "@xyflow/react";
import { FlowNodeType, PALETTE_ITEMS } from "@/types/flow-builder";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Only reactions / actions as targets after a button
const HANDLE_POPOVER_ITEMS = PALETTE_ITEMS.filter(
	(p) =>
		p.category === "reaction" ||
		p.category === "action" ||
		p.type === FlowNodeType.INTERACTIVE_MESSAGE ||
		p.type === FlowNodeType.TEXT_MESSAGE,
).filter((p) => p.type !== FlowNodeType.START);

interface HandlePopoverProps {
	/** Anchor position (screen coords) */
	anchorX: number;
	anchorY: number;
	open: boolean;
	onClose: () => void;
	onSelectType: (type: FlowNodeType) => void;
}

export function HandlePopover({ anchorX, anchorY, open, onClose, onSelectType }: HandlePopoverProps) {
	if (!open) return null;

	return (
		<div className="fixed z-50" style={{ left: anchorX, top: anchorY }}>
			<div className="bg-popover border rounded-lg shadow-xl p-1 min-w-[200px] animate-in fade-in-0 zoom-in-95">
				<p className="text-[10px] text-muted-foreground uppercase tracking-wide px-2 py-1 font-medium">
					Adicionar reação
				</p>
				{HANDLE_POPOVER_ITEMS.map((item) => (
					<button
						key={item.type}
						type="button"
						className="flex items-center gap-2.5 w-full text-left px-2 py-1.5 rounded hover:bg-accent transition-colors text-sm"
						onClick={() => {
							onSelectType(item.type);
							onClose();
						}}
					>
						<span className="text-base">{item.icon}</span>
						<div>
							<p className="text-sm font-medium leading-tight">{item.label}</p>
							<p className="text-[11px] text-muted-foreground leading-tight">{item.description}</p>
						</div>
					</button>
				))}
			</div>
		</div>
	);
}

// =============================================================================
// Hook to manage handle popover state
// =============================================================================

export interface HandlePopoverState {
	open: boolean;
	anchorX: number;
	anchorY: number;
	/** The source node ID whose handle was clicked */
	sourceNodeId: string;
	/** The source handle ID (button ID) */
	sourceHandleId: string;
}

const INITIAL_STATE: HandlePopoverState = {
	open: false,
	anchorX: 0,
	anchorY: 0,
	sourceNodeId: "",
	sourceHandleId: "",
};

export function useHandlePopover() {
	const [state, setState] = useState<HandlePopoverState>(INITIAL_STATE);

	const openPopover = useCallback((sourceNodeId: string, sourceHandleId: string, anchorX: number, anchorY: number) => {
		setState({
			open: true,
			anchorX,
			anchorY,
			sourceNodeId,
			sourceHandleId,
		});
	}, []);

	const closePopover = useCallback(() => {
		setState(INITIAL_STATE);
	}, []);

	return { popoverState: state, openPopover, closePopover };
}

export default HandlePopover;
