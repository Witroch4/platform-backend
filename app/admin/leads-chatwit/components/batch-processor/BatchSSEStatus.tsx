"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wifi, WifiOff, Loader2 } from "lucide-react";

interface BatchSSEStatusProps {
	sseConnections: number;
	leadsBeingProcessed: string[];
	totalLeads: number;
}

export function BatchSSEStatus({ sseConnections, leadsBeingProcessed, totalLeads }: BatchSSEStatusProps) {
	const isConnected = sseConnections > 0;
	const hasProcessing = leadsBeingProcessed.length > 0;

	return (
		<Card className="w-full">
			<CardHeader className="pb-3">
				<CardTitle className="text-sm font-medium flex items-center gap-2">
					{isConnected ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-red-500" />}
					Status das Conexões SSE
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex items-center justify-between">
					<span className="text-sm text-muted-foreground">Conexões Ativas:</span>
					<Badge variant={isConnected ? "default" : "secondary"}>
						{sseConnections}/{totalLeads}
					</Badge>
				</div>

				<div className="flex items-center justify-between">
					<span className="text-sm text-muted-foreground">Processando:</span>
					<div className="flex items-center gap-2">
						{hasProcessing && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
						<Badge variant={hasProcessing ? "default" : "secondary"}>{leadsBeingProcessed.length}</Badge>
					</div>
				</div>

				{hasProcessing && (
					<div className="pt-2 border-t">
						<p className="text-xs text-muted-foreground mb-2">Aguardando resposta:</p>
						<div className="flex flex-wrap gap-1">
							{leadsBeingProcessed.map((leadId) => (
								<Badge key={leadId} variant="outline" className="text-xs">
									{leadId.slice(-8)}
								</Badge>
							))}
						</div>
					</div>
				)}

				<div className="pt-2 border-t">
					<p className="text-xs text-muted-foreground">
						{isConnected
							? "✅ Monitoramento ativo - notificações em tempo real"
							: "⚠️ Sem conexão - verifique sua internet"}
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
