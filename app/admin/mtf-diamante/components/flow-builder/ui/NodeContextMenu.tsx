"use client";

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Copy, Trash2 } from "lucide-react";

interface NodeContextMenuProps {
	children: React.ReactNode;
	onDuplicate?: () => void;
	onDelete?: () => void;
}

export function NodeContextMenu({ children, onDuplicate, onDelete }: NodeContextMenuProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-48">
				{onDuplicate && (
					<ContextMenuItem onClick={onDuplicate} className="gap-2 cursor-pointer">
						<Copy className="h-4 w-4" />
						<span>Duplicate</span>
					</ContextMenuItem>
				)}
				{onDelete && (
					<ContextMenuItem
						onClick={onDelete}
						className="gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20"
					>
						<Trash2 className="h-4 w-4" />
						<span>Delete</span>
					</ContextMenuItem>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
