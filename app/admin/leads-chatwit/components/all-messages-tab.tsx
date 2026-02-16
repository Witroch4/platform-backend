"use client";

import { useState, useCallback, useEffect } from "react";
import useSWR from "swr";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
	User,
	Bot,
	Search,
	RefreshCw,
	MessageSquare,
	Phone,
	ChevronLeft,
	ChevronRight,
	ChevronDown,
	ChevronUp,
	X,
	Image as ImageIcon,
	FileAudio,
	File,
	Clock,
	Hash,
	Loader2,
	History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface MessageItem {
	id: string;
	content: string;
	isFromLead: boolean;
	messageType: string;
	createdAt: string;
	metadata?: Record<string, unknown> | null;
}

interface LeadConversation {
	lead: {
		id: string;
		name: string | null;
		phone: string | null;
		avatarUrl: string | null;
		source?: string | null;
	};
	lastActivity: string;
	messageCount: number;
	messages: MessageItem[];
}

interface AllMessagesResponse {
	conversations: LeadConversation[];
	pagination: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	};
}

interface LoadMoreResponse {
	messages: MessageItem[];
	hasMore: boolean;
	nextCursor?: string;
	totalCount: number;
}

const fetcher = async (url: string): Promise<AllMessagesResponse> => {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Erro ao buscar mensagens");
	return res.json();
};

function formatLastActivity(dateString: string): string {
	const date = new Date(dateString);

	if (isToday(date)) {
		return `Hoje às ${format(date, "HH:mm", { locale: ptBR })}`;
	}

	if (isYesterday(date)) {
		return `Ontem às ${format(date, "HH:mm", { locale: ptBR })}`;
	}

	return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
}

function formatMessageTime(dateString: string): string {
	return format(new Date(dateString), "HH:mm", { locale: ptBR });
}

function getInitials(name: string | null): string {
	if (!name) return "?";
	const parts = name.trim().split(" ");
	if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
	return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function MessageTypeIcon({ type }: { type: string }) {
	switch (type) {
		case "image":
			return <ImageIcon className="h-3 w-3" />;
		case "audio":
			return <FileAudio className="h-3 w-3" />;
		case "document":
			return <File className="h-3 w-3" />;
		default:
			return null;
	}
}

/** Ícone de canal (WhatsApp / Instagram) */
function ChannelIcon({ source }: { source?: string | null }) {
	if (!source) return null;

	if (source.includes("WHATSAPP") || source === "CHATWIT_OAB") {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 shrink-0">
							<svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-label="WhatsApp">
								<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
							</svg>
						</span>
					</TooltipTrigger>
					<TooltipContent>WhatsApp</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	if (source === "INSTAGRAM") {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-pink-500/15 text-pink-600 dark:text-pink-400 shrink-0">
							<svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-label="Instagram">
								<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
							</svg>
						</span>
					</TooltipTrigger>
					<TooltipContent>Instagram</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	return null;
}

/** Botões visuais do bot (não clicáveis, apenas indicativos) */
function BotButtons({ buttons }: { buttons: string[] }) {
	return (
		<div className="flex flex-wrap gap-1 mt-1.5">
			{buttons.map((title) => (
				<span
					key={title}
					className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-primary-foreground/20 border border-primary-foreground/30 text-primary-foreground/80"
				>
					<span className="text-[10px]">🔹</span>
					{title}
				</span>
			))}
		</div>
	);
}

function ConversationSkeleton() {
	return (
		<div className="border border-border rounded-lg p-4 space-y-3">
			<div className="flex items-center gap-3">
				<Skeleton className="h-12 w-12 rounded-full" />
				<div className="flex-1 space-y-2">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-3 w-24" />
				</div>
				<Skeleton className="h-8 w-8 rounded" />
			</div>
		</div>
	);
}

interface ConversationCardProps {
	conversation: LeadConversation;
	defaultOpen?: boolean;
}

function ConversationCard({ conversation, defaultOpen = true }: ConversationCardProps) {
	const [isOpen, setIsOpen] = useState(defaultOpen);
	const { lead, lastActivity, messageCount, messages: initialMessages } = conversation;

	// Estado para mensagens carregadas via load-more
	const [extraMessages, setExtraMessages] = useState<MessageItem[]>([]);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(messageCount > initialMessages.length);

	// Mensagens combinadas: extras (mais antigas) + iniciais (mais recentes)
	const allMessages = [...extraMessages, ...initialMessages];
	const remainingCount = messageCount - allMessages.length;

	const handleLoadMore = useCallback(async () => {
		if (isLoadingMore || !hasMore) return;
		setIsLoadingMore(true);

		try {
			// O cursor é o ID da mensagem mais antiga que temos
			const oldestMessage = extraMessages.length > 0 ? extraMessages[0] : initialMessages[0];
			const cursor = oldestMessage?.id;

			const url = `/api/admin/leads-chatwit/messages?leadId=${lead.id}&limit=20${cursor ? `&cursor=${cursor}` : ""}`;
			const res = await fetch(url);
			if (!res.ok) throw new Error("Erro ao carregar mensagens");

			const data: LoadMoreResponse = await res.json();

			// As mensagens vêm em ordem cronológica do mais antigo ao mais recente
			// Precisamos filtrar as que já temos e prepend as novas (mais antigas)
			const existingIds = new Set(allMessages.map((m) => m.id));
			const newMessages = data.messages
				.filter((m) => !existingIds.has(m.id))
				.map((m) => ({
					id: m.id,
					content: (m as any).content,
					isFromLead: (m as any).isFromLead,
					messageType: (m as any).messageType,
					createdAt: typeof (m as any).createdAt === "string" ? (m as any).createdAt : new Date((m as any).createdAt).toISOString(),
					metadata: (m as any).metadata || null,
				}));

			setExtraMessages((prev) => [...newMessages, ...prev]);
			setHasMore(data.hasMore);
		} catch (error) {
			console.error("[LoadMore] Erro:", error);
		} finally {
			setIsLoadingMore(false);
		}
	}, [isLoadingMore, hasMore, extraMessages, initialMessages, lead.id, allMessages]);

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<div
				className={cn(
					"border rounded-lg transition-all duration-200",
					isOpen ? "border-primary/50 bg-muted/30" : "border-border hover:border-border/80 hover:bg-muted/20",
				)}
			>
				{/* Header do card - sempre visível */}
				<CollapsibleTrigger asChild>
					<button
						type="button"
						className="w-full p-4 flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
					>
						{/* Avatar */}
						<Avatar className="h-12 w-12 shrink-0 border-2 border-background shadow-sm">
							{lead.avatarUrl && <AvatarImage src={lead.avatarUrl} alt={lead.name || "Lead"} />}
							<AvatarFallback className="bg-primary/10 text-primary font-semibold">
								{getInitials(lead.name)}
							</AvatarFallback>
						</Avatar>

						{/* Info do lead */}
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2 mb-0.5">
								<ChannelIcon source={lead.source} />
								<h3 className="font-semibold text-foreground truncate">{lead.name || "Lead sem nome"}</h3>
							</div>

							<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
								{lead.phone && (
									<span className="flex items-center gap-1">
										<Phone className="h-3 w-3" />
										{lead.phone}
									</span>
								)}
								<span className="flex items-center gap-1">
									<Clock className="h-3 w-3" />
									{formatLastActivity(lastActivity)}
								</span>
								<span className="flex items-center gap-1">
									<Hash className="h-3 w-3" />
									{messageCount} {messageCount === 1 ? "mensagem" : "mensagens"}
								</span>
							</div>
						</div>

						{/* Botão expandir */}
						<div
							className={cn(
								"shrink-0 p-2 rounded-md transition-colors",
								isOpen ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
							)}
						>
							{isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
						</div>
					</button>
				</CollapsibleTrigger>

				{/* Mensagens - expansível */}
				<CollapsibleContent>
					<div className="px-4 pb-4 pt-0">
						<div className="border-t border-border pt-3 space-y-2">
							{/* Botão para carregar mensagens anteriores */}
							{remainingCount > 0 && (
								<Button
									variant="ghost"
									size="sm"
									className="w-full text-xs text-muted-foreground hover:text-foreground gap-1.5"
									onClick={handleLoadMore}
									disabled={isLoadingMore}
								>
									{isLoadingMore ? (
										<>
											<Loader2 className="h-3 w-3 animate-spin" />
											Carregando...
										</>
									) : (
										<>
											<History className="h-3 w-3" />
											+{remainingCount} mensagens anteriores
										</>
									)}
								</Button>
							)}

							{allMessages.map((message) => {
								const buttons =
									!message.isFromLead && message.metadata && Array.isArray((message.metadata as any)?.buttons)
										? ((message.metadata as any).buttons as string[])
										: null;

								return (
									<div
										key={message.id}
										className={cn("flex gap-2", message.isFromLead ? "justify-start" : "justify-end")}
									>
										<div
											className={cn(
												"max-w-[85%] rounded-xl px-3 py-2 text-sm",
												message.isFromLead
													? "bg-muted text-foreground rounded-tl-sm"
													: "bg-primary text-primary-foreground rounded-tr-sm",
											)}
										>
											{/* Header da mensagem */}
											<div
												className={cn(
													"flex items-center gap-1.5 mb-1 text-[10px]",
													message.isFromLead ? "text-muted-foreground" : "text-primary-foreground/70",
												)}
											>
												{message.isFromLead ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
												<span>{formatMessageTime(message.createdAt)}</span>
												{message.messageType !== "text" && message.messageType !== "assistant" && (
													<Badge
														variant={message.isFromLead ? "secondary" : "outline"}
														className="text-[9px] px-1 py-0 h-3.5"
													>
														<MessageTypeIcon type={message.messageType} />
													</Badge>
												)}
											</div>

											{/* Conteúdo */}
											<p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>

											{/* Botões do bot */}
											{buttons && buttons.length > 0 && <BotButtons buttons={buttons} />}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}

interface AllMessagesTabProps {
	searchQuery?: string;
}

export function AllMessagesTab({ searchQuery: externalSearch }: AllMessagesTabProps) {
	const [page, setPage] = useState(1);
	const [localSearch, setLocalSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const limit = 20;

	// Usar busca externa ou local
	const activeSearch = externalSearch || debouncedSearch;

	// Debounce da busca local
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedSearch(localSearch);
			setPage(1);
		}, 300);
		return () => clearTimeout(timer);
	}, [localSearch]);

	const key = `/api/admin/leads-chatwit/all-messages?page=${page}&limit=${limit}${
		activeSearch ? `&search=${encodeURIComponent(activeSearch)}` : ""
	}`;

	const { data, error, isLoading, mutate } = useSWR<AllMessagesResponse>(key, fetcher, {
		revalidateOnFocus: false,
		keepPreviousData: true,
	});

	const handleRefresh = useCallback(() => {
		mutate();
	}, [mutate]);

	const handlePrevPage = useCallback(() => {
		setPage((p) => Math.max(1, p - 1));
	}, []);

	const handleNextPage = useCallback(() => {
		if (data && page < data.pagination.totalPages) {
			setPage((p) => p + 1);
		}
	}, [data, page]);

	const clearSearch = useCallback(() => {
		setLocalSearch("");
		setDebouncedSearch("");
		setPage(1);
	}, []);

	// Estado vazio
	if (!isLoading && data?.conversations.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 px-4">
				<div className="rounded-full bg-muted p-4 mb-4">
					<MessageSquare className="h-8 w-8 text-muted-foreground" />
				</div>
				<h3 className="text-lg font-semibold text-foreground mb-1">Nenhuma conversa encontrada</h3>
				<p className="text-sm text-muted-foreground text-center max-w-sm">
					{activeSearch
						? `Nenhuma conversa corresponde a "${activeSearch}"`
						: "As conversas dos leads aparecerão aqui quando houver interações"}
				</p>
				{activeSearch && (
					<Button variant="outline" size="sm" onClick={clearSearch} className="mt-4">
						Limpar busca
					</Button>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Header com busca e controles */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-border bg-muted/30">
				<div className="flex items-center gap-3">
					{/* Busca local */}
					{!externalSearch && (
						<div className="relative w-full sm:w-64">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
							<Input
								type="search"
								placeholder="Buscar conversas…"
								className="pl-9 pr-9 h-9 text-sm"
								value={localSearch}
								onChange={(e) => setLocalSearch(e.target.value)}
							/>
							{localSearch && (
								<Button
									variant="ghost"
									size="icon"
									className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
									onClick={clearSearch}
									aria-label="Limpar busca"
								>
									<X className="h-3 w-3" />
								</Button>
							)}
						</div>
					)}

					{/* Contador */}
					<div className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
						{isLoading ? (
							<Skeleton className="h-4 w-24" />
						) : (
							<>
								{data?.pagination.total.toLocaleString("pt-BR")}{" "}
								{data?.pagination.total === 1 ? "conversa" : "conversas"}
							</>
						)}
					</div>
				</div>

				<div className="flex items-center gap-2">
					{/* Paginação */}
					{data && data.pagination.totalPages > 1 && (
						<div className="flex items-center gap-1">
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8"
											onClick={handlePrevPage}
											disabled={page === 1 || isLoading}
											aria-label="Página anterior"
										>
											<ChevronLeft className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>Página anterior</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<span className="text-sm text-muted-foreground tabular-nums px-2">
								{page} / {data.pagination.totalPages}
							</span>

							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8"
											onClick={handleNextPage}
											disabled={page >= data.pagination.totalPages || isLoading}
											aria-label="Próxima página"
										>
											<ChevronRight className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>Próxima página</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					)}

					{/* Refresh */}
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									onClick={handleRefresh}
									disabled={isLoading}
									aria-label="Atualizar conversas"
								>
									<RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Atualizar conversas</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>

			{/* Lista de conversas */}
			<ScrollArea className="flex-1">
				<div className="p-4 space-y-3">
					{isLoading && !data ? (
						// Loading skeletons
						<>
							{Array.from({ length: 5 }).map((_, i) => (
								<ConversationSkeleton key={`skeleton-${i}`} />
							))}
						</>
					) : error ? (
						// Estado de erro
						<div className="flex flex-col items-center justify-center py-16 px-4">
							<p className="text-sm text-destructive mb-4">Erro ao carregar conversas</p>
							<Button variant="outline" size="sm" onClick={handleRefresh}>
								Tentar novamente
							</Button>
						</div>
					) : (
						// Lista de conversas — todas abertas por padrão
						data?.conversations.map((conversation) => (
							<ConversationCard key={conversation.lead.id} conversation={conversation} defaultOpen />
						))
					)}
				</div>
			</ScrollArea>

			{/* Footer com paginação mobile */}
			{data && data.pagination.totalPages > 1 && (
				<div className="flex items-center justify-between p-3 border-t border-border bg-muted/30 sm:hidden">
					<Button variant="outline" size="sm" onClick={handlePrevPage} disabled={page === 1 || isLoading}>
						<ChevronLeft className="h-4 w-4 mr-1" />
						Anterior
					</Button>

					<span className="text-sm text-muted-foreground tabular-nums">
						{page} / {data.pagination.totalPages}
					</span>

					<Button
						variant="outline"
						size="sm"
						onClick={handleNextPage}
						disabled={page >= data.pagination.totalPages || isLoading}
					>
						Próxima
						<ChevronRight className="h-4 w-4 ml-1" />
					</Button>
				</div>
			)}
		</div>
	);
}
