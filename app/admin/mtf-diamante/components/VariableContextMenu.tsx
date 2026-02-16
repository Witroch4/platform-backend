"use client";

import type React from "react";
import { useRef, useCallback } from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Variable, Hash, Building2, CreditCard } from "lucide-react";

interface MtfDiamanteVariavel {
	id?: string;
	chave: string;
	valor: string;
}

interface VariableContextMenuProps {
	children: React.ReactNode;
	onVariableInsert: (variable: string) => void;
	variables: MtfDiamanteVariavel[];
	disabled?: boolean;
}

// Default/special variables that are always available
const DEFAULT_VARIABLES = [
	{
		chave: "chave_pix",
		valor: "PIX Key",
		description: "PIX key for copy code button (max 15 characters)",
		icon: CreditCard,
		category: "special",
	},
	{
		chave: "nome_do_escritorio_rodape",
		valor: "Company Name",
		description: "Company name that appears in footer automatically",
		icon: Building2,
		category: "special",
	},
];

export const VariableContextMenu: React.FC<VariableContextMenuProps> = ({
	children,
	onVariableInsert,
	variables,
	disabled = false,
}) => {
	// Filter out custom variables (excluding special ones)
	const customVariables = variables.filter((v) => !["chave_pix", "nome_do_escritorio_rodape"].includes(v.chave));

	const handleVariableSelect = useCallback(
		(variableKey: string) => {
			if (!disabled) {
				onVariableInsert(`{{${variableKey}}}`);
			}
		},
		[onVariableInsert, disabled],
	);

	if (disabled) {
		return <>{children}</>;
	}

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-64">
				<ContextMenuSub>
					<ContextMenuSubTrigger className="flex items-center gap-2">
						<Variable className="h-4 w-4" />
						Add Variable
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-72">
						{/* Special Variables Section */}
						<div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b">Special Variables</div>
						{DEFAULT_VARIABLES.map((variable) => {
							const IconComponent = variable.icon;
							return (
								<ContextMenuItem
									key={variable.chave}
									onClick={() => handleVariableSelect(variable.chave)}
									className="flex items-start gap-3 py-2 px-3 cursor-pointer"
								>
									<IconComponent className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
									<div className="flex-1 min-w-0">
										<div className="font-medium text-sm">{variable.chave}</div>
										<div className="text-xs text-muted-foreground truncate">{variable.description}</div>
									</div>
								</ContextMenuItem>
							);
						})}

						{/* Custom Variables Section */}
						{customVariables.length > 0 && (
							<>
								<div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b border-t mt-1">
									Custom Variables
								</div>
								{customVariables.map((variable) => (
									<ContextMenuItem
										key={variable.id || variable.chave}
										onClick={() => handleVariableSelect(variable.chave)}
										className="flex items-start gap-3 py-2 px-3 cursor-pointer"
									>
										<Hash className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
										<div className="flex-1 min-w-0">
											<div className="font-medium text-sm">{variable.chave}</div>
											<div className="text-xs text-muted-foreground truncate">{variable.valor}</div>
										</div>
									</ContextMenuItem>
								))}
							</>
						)}

						{/* Empty state for custom variables */}
						{customVariables.length === 0 && (
							<div className="px-3 py-2 text-xs text-muted-foreground">
								No custom variables configured.
								<br />
								Add them in the Configuration tab.
							</div>
						)}
					</ContextMenuSubContent>
				</ContextMenuSub>
			</ContextMenuContent>
		</ContextMenu>
	);
};

export default VariableContextMenu;
