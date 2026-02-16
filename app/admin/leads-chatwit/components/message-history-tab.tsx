"use client";

import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, User, Bot, ChevronUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMessages } from "../hooks/useMessages";

interface MessageHistoryTabProps {
	leadId: string;
}

export function MessageHistoryTab({ leadId }: MessageHistoryTabProps) {
	const { messages, hasMore, totalCount, isLoading, refresh, loadMore, resetForNewLead } = useMessages(leadId);

	const scrollRef = useRef<HTMLDivElement>(null);
	const prevMessageCountRef = useRef(0);
	const prevLeadIdRef = useRef(leadId);

	// Reset quando trocar de lead
	useEffect(() => {
		if (prevLeadIdRef.current !== leadId) {
			resetForNewLead();
			prevLeadIdRef.current = leadId;
		}
	}, [leadId, resetForNewLead]);

	// Auto-scroll para o final quando novas mensagens chegam
	useEffect(() => {
		if (messages.length > prevMessageCountRef.current && scrollRef.current) {
			scrollRef.current.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: "smooth",
			});
		}
		prevMessageCountRef.current = messages.length;
	}, [messages.length]);

	if (isLoading && messages.length === 0) {
		return (
			<div className="flex items-center justify-center flex-1">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (messages.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
				<Bot className="h-12 w-12 mb-2 opacity-50" />
				<p>Nenhuma mensagem registrada</p>
				<p className="text-xs mt-1">As mensagens aparecerão aqui quando o lead interagir</p>
				<Button variant="outline" size="sm" onClick={refresh} className="mt-4" disabled={isLoading}>
					<RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
					Atualizar
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-1">
			{/* Header com contagem e botão de refresh */}
			<div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 shrink-0">
				<span className="text-sm text-muted-foreground">
					{totalCount} {totalCount === 1 ? "mensagem" : "mensagens"}
				</span>
				<div className="flex items-center gap-2">
					{hasMore && (
						<Button variant="ghost" size="sm" onClick={loadMore} disabled={isLoading}>
							<ChevronUp className="h-4 w-4 mr-1" />
							Anteriores
						</Button>
					)}
					<Button variant="ghost" size="sm" onClick={refresh} disabled={isLoading}>
						<RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
					</Button>
				</div>
			</div>

			{/* Lista de mensagens */}
			<ScrollArea ref={scrollRef} className="flex-1 px-4 py-2">
				<div className="space-y-3">
					{messages.map((message) => (
						<div key={message.id} className={`flex ${message.isFromLead ? "justify-start" : "justify-end"}`}>
							<div
								className={`max-w-[80%] rounded-lg px-3 py-2 ${
									message.isFromLead ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
								}`}
							>
								<div className="flex items-center gap-1 mb-1">
									{message.isFromLead ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
									<span className="text-[10px] opacity-70">
										{format(new Date(message.createdAt), "HH:mm", {
											locale: ptBR,
										})}
									</span>
								</div>
								<p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
							</div>
						</div>
					))}
				</div>
			</ScrollArea>

			{/* Indicador de carregamento */}
			{isLoading && messages.length > 0 && (
				<div className="flex items-center justify-center py-2 border-t shrink-0">
					<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
				</div>
			)}
		</div>
	);
}
