"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SSEStatusIndicatorProps {
	isConnected: boolean;
	error: string | null;
	className?: string;
}

export function SSEStatusIndicator({ isConnected, error, className }: SSEStatusIndicatorProps) {
	const getStatus = () => {
		if (error) {
			return {
				icon: AlertTriangle,
				text: "Erro",
				variant: "destructive" as const,
				description: `Erro na conexão: ${error}`,
			};
		}

		if (isConnected) {
			return {
				icon: Wifi,
				text: "Conectado",
				variant: "default" as const,
				description: "Notificações em tempo real ativas",
			};
		}

		return {
			icon: WifiOff,
			text: "Desconectado",
			variant: "secondary" as const,
			description: "Notificações em tempo real desativadas",
		};
	};

	const status = getStatus();
	const Icon = status.icon;

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge variant={status.variant} className={cn("flex items-center gap-1 text-xs", className)}>
						<Icon className="h-3 w-3" />
						{status.text}
					</Badge>
				</TooltipTrigger>
				<TooltipContent>
					<p>{status.description}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
