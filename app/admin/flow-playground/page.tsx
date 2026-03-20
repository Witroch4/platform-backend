"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { mtfDiamanteQueryKeys } from "../mtf-diamante/lib/query-keys";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import {
	FlaskConical,
	Send,
	RotateCcw,
	Loader2,
	Bot,
	User,
	ChevronDown,
	ChevronRight,
	Smile,
	FileText,
	Zap,
	Image as ImageIcon,
	Settings2,
	Bug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlaygroundMessage {
	id: string;
	direction: "user" | "bot";
	type: "text" | "interactive" | "reaction" | "media" | "template" | "action";
	content?: string;
	interactivePayload?: Record<string, unknown>;
	emoji?: string;
	mediaUrl?: string;
	timestamp: number;
	deliveryMode?: "sync" | "async";
}

interface FlowOption {
	id: string;
	name: string;
	isCampaign: boolean;
	nodeCount: number;
	intents: string[];
}

interface InboxOption {
	id: string;
	nome: string;
	channelType: string;
}

interface ExecutionLogEntry {
	nodeId: string;
	nodeType: string;
	timestamp: number;
	durationMs: number;
	deliveryMode: "sync" | "async";
	result: "ok" | "error" | "skipped";
	detail?: string;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

const fetcher = async (url: string) => {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Falha ao buscar dados");
	return res.json();
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FlowPlaygroundPage() {
	// State
	const [messages, setMessages] = useState<PlaygroundMessage[]>([]);
	const [inputText, setInputText] = useState("");
	const [loading, setLoading] = useState(false);
	const [selectedInboxId, setSelectedInboxId] = useState("");
	const [selectedFlowId, setSelectedFlowId] = useState("auto");
	const [channelType, setChannelType] = useState<"whatsapp" | "instagram" | "facebook">("whatsapp");
	const [playgroundConversationId] = useState(() => `playground_${nanoid(10)}`);
	const [sessionVariables, setSessionVariables] = useState<Record<string, unknown>>({});
	const [executionLog, setExecutionLog] = useState<ExecutionLogEntry[]>([]);
	const [sessionStatus, setSessionStatus] = useState<string>("");
	const [debugOpen, setDebugOpen] = useState(false);

	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Fetch inboxes
	const { data: inboxData } = useQuery<{ caixas?: InboxOption[]; data?: InboxOption[] }>({
		queryKey: mtfDiamanteQueryKeys.playground.inboxes(),
		queryFn: () => fetcher("/api/admin/mtf-diamante/inbox-view?dataType=caixas"),
		staleTime: 10 * 60 * 1000, // referencia: 10min
		refetchOnWindowFocus: false,
	});
	const inboxes: InboxOption[] = inboxData?.caixas ?? inboxData?.data ?? [];

	// Fetch flows for selected inbox
	const { data: flowData } = useQuery<{ flows: FlowOption[] }>({
		queryKey: mtfDiamanteQueryKeys.playground.flows(selectedInboxId),
		queryFn: () => fetcher(`/api/admin/flow-playground/flows?inboxId=${selectedInboxId}`),
		enabled: !!selectedInboxId,
		staleTime: 30_000,
		refetchOnWindowFocus: false,
	});
	const flows: FlowOption[] = flowData?.flows ?? [];

	// Auto-scroll
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages]);

	// ---------------------------------------------------------------------------
	// Execute
	// ---------------------------------------------------------------------------

	const executePlayground = useCallback(
		async (payload: Record<string, unknown>) => {
			setLoading(true);
			try {
				const res = await fetch("/api/admin/flow-playground/execute", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						...payload,
						inboxId: selectedInboxId,
						channelType,
						playgroundConversationId,
					}),
				});

				const data = await res.json();
				if (!res.ok) {
					toast.error(data.error || "Erro na execução");
					return;
				}

				if (data.error) {
					toast.error(data.error);
				}

				// Add bot messages
				const botMessages: PlaygroundMessage[] = (data.messages ?? []).map((m: PlaygroundMessage) => ({
					...m,
					direction: "bot" as const,
				}));

				setMessages((prev) => [...prev, ...botMessages]);
				setSessionVariables(data.variables ?? {});
				setExecutionLog(data.executionLog ?? []);
				setSessionStatus(data.sessionStatus ?? "");
			} catch (err) {
				toast.error("Erro de conexão");
			} finally {
				setLoading(false);
				inputRef.current?.focus();
			}
		},
		[selectedInboxId, channelType, playgroundConversationId],
	);

	const handleSend = useCallback(() => {
		if (!inputText.trim() || !selectedInboxId || loading) return;

		const userMsg: PlaygroundMessage = {
			id: nanoid(8),
			direction: "user",
			type: "text",
			content: inputText.trim(),
			timestamp: Date.now(),
		};
		setMessages((prev) => [...prev, userMsg]);

		const payload: Record<string, unknown> = {
			type: "message",
			text: inputText.trim(),
		};
		if (selectedFlowId !== "auto") {
			payload.flowId = selectedFlowId;
		}

		setInputText("");
		executePlayground(payload);
	}, [inputText, selectedInboxId, selectedFlowId, loading, executePlayground]);

	const handleButtonClick = useCallback(
		(buttonId: string, buttonTitle: string) => {
			if (loading) return;

			const userMsg: PlaygroundMessage = {
				id: nanoid(8),
				direction: "user",
				type: "text",
				content: buttonTitle,
				timestamp: Date.now(),
			};
			setMessages((prev) => [...prev, userMsg]);

			executePlayground({
				type: "button_click",
				buttonId,
				buttonTitle,
			});
		},
		[loading, executePlayground],
	);

	const handleReset = useCallback(async () => {
		setMessages([]);
		setSessionVariables({});
		setExecutionLog([]);
		setSessionStatus("");
		setInputText("");

		try {
			await fetch("/api/admin/flow-playground/reset", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			toast.success("Playground resetado");
		} catch {
			// silent
		}
	}, []);

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
			{/* Left panel - Config */}
			<Card className="w-80 shrink-0 flex flex-col">
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-lg">
						<FlaskConical className="h-5 w-5" />
						Flow Playground
					</CardTitle>
				</CardHeader>
				<CardContent className="flex-1 flex flex-col gap-4 overflow-auto">
					{/* Inbox selector */}
					<div className="space-y-1.5">
						<label className="text-sm font-medium">Inbox</label>
						<Select value={selectedInboxId} onValueChange={(v) => { setSelectedInboxId(v); setSelectedFlowId("auto"); }}>
							<SelectTrigger>
								<SelectValue placeholder="Selecione um inbox" />
							</SelectTrigger>
							<SelectContent>
								{inboxes.map((inbox) => (
									<SelectItem key={inbox.id} value={inbox.id}>
										{inbox.nome} ({inbox.channelType})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Flow selector */}
					<div className="space-y-1.5">
						<label className="text-sm font-medium">Flow</label>
						<Select value={selectedFlowId} onValueChange={setSelectedFlowId} disabled={!selectedInboxId}>
							<SelectTrigger>
								<SelectValue placeholder="Auto (intent routing)" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="auto">Auto (intent routing)</SelectItem>
								{flows.map((flow) => (
									<SelectItem key={flow.id} value={flow.id}>
										{flow.name} ({flow.nodeCount} nodos)
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{selectedFlowId !== "auto" && flows.find((f) => f.id === selectedFlowId)?.intents?.length ? (
							<p className="text-xs text-muted-foreground">
								Intents: {flows.find((f) => f.id === selectedFlowId)!.intents.join(", ")}
							</p>
						) : null}
					</div>

					{/* Channel type */}
					<div className="space-y-1.5">
						<label className="text-sm font-medium">Canal</label>
						<Select value={channelType} onValueChange={(v) => setChannelType(v as typeof channelType)}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="whatsapp">WhatsApp</SelectItem>
								<SelectItem value="instagram">Instagram</SelectItem>
								<SelectItem value="facebook">Facebook</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<Separator />

					{/* Actions */}
					<div className="flex gap-2">
						<Button variant="outline" size="sm" className="flex-1" onClick={handleReset}>
							<RotateCcw className="h-4 w-4 mr-1" /> Reset
						</Button>
						<Dialog open={debugOpen} onOpenChange={setDebugOpen}>
							<DialogTrigger asChild>
								<Button variant="outline" size="sm" className="flex-1">
									<Bug className="h-4 w-4 mr-1" /> Debug
								</Button>
							</DialogTrigger>
							<DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
								<DialogHeader>
									<DialogTitle>Debug Info</DialogTitle>
								</DialogHeader>
								<DebugPanel
									variables={sessionVariables}
									executionLog={executionLog}
									sessionStatus={sessionStatus}
								/>
							</DialogContent>
						</Dialog>
					</div>

					{/* Session status */}
					{sessionStatus && (
						<div className="space-y-1.5">
							<label className="text-sm font-medium">Status da Sessão</label>
							<Badge
								variant={
									sessionStatus === "WAITING_INPUT"
										? "default"
										: sessionStatus === "COMPLETED"
											? "secondary"
											: "destructive"
								}
							>
								{sessionStatus}
							</Badge>
						</div>
					)}

					{/* Quick variables preview */}
					{Object.keys(sessionVariables).length > 0 && (
						<div className="space-y-1.5">
							<label className="text-sm font-medium">Variáveis</label>
							<div className="bg-muted rounded-md p-2 text-xs font-mono max-h-48 overflow-auto">
								{Object.entries(sessionVariables)
									.filter(([k]) => !k.startsWith("_"))
									.slice(0, 10)
									.map(([k, v]) => (
										<div key={k} className="truncate">
											<span className="text-muted-foreground">{k}:</span>{" "}
											{typeof v === "object" ? JSON.stringify(v) : String(v)}
										</div>
									))}
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Right panel - Chat */}
			<Card className="flex-1 flex flex-col">
				<CardHeader className="pb-3 border-b">
					<div className="flex items-center justify-between">
						<CardTitle className="text-lg">
							{selectedFlowId !== "auto"
								? flows.find((f) => f.id === selectedFlowId)?.name ?? "Chat"
								: "Chat (Auto)"}
						</CardTitle>
						{messages.length > 0 && (
							<Badge variant="outline" className="text-xs">
								{messages.length} mensagens
							</Badge>
						)}
					</div>
				</CardHeader>

				{/* Messages area */}
				<div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
					{messages.length === 0 && (
						<div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
							<FlaskConical className="h-12 w-12 opacity-30" />
							<p className="text-sm">Selecione um inbox e envie uma mensagem para testar o flow</p>
						</div>
					)}

					{messages.map((msg) => (
						<ChatBubble
							key={msg.id}
							message={msg}
							onButtonClick={handleButtonClick}
							disabled={loading}
						/>
					))}

					{loading && (
						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							<Loader2 className="h-4 w-4 animate-spin" />
							Processando...
						</div>
					)}
				</div>

				{/* Input bar */}
				<div className="border-t p-3 flex gap-2">
					<Input
						ref={inputRef}
						value={inputText}
						onChange={(e) => setInputText(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
						placeholder={selectedInboxId ? "Digite uma mensagem..." : "Selecione um inbox primeiro"}
						disabled={!selectedInboxId || loading}
						className="flex-1"
					/>
					<Button onClick={handleSend} disabled={!inputText.trim() || !selectedInboxId || loading} size="icon">
						{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
					</Button>
				</div>
			</Card>
		</div>
	);
}

// ---------------------------------------------------------------------------
// ChatBubble
// ---------------------------------------------------------------------------

function ChatBubble({
	message,
	onButtonClick,
	disabled,
}: {
	message: PlaygroundMessage;
	onButtonClick: (id: string, title: string) => void;
	disabled: boolean;
}) {
	const isUser = message.direction === "user";

	// Reaction
	if (message.type === "reaction") {
		return (
			<div className="flex justify-start">
				<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
					<Smile className="h-3.5 w-3.5" />
					Reação: <span className="text-lg">{message.emoji}</span>
					{message.deliveryMode === "async" && <Badge variant="outline" className="text-[10px] h-4">async</Badge>}
				</div>
			</div>
		);
	}

	// Action
	if (message.type === "action") {
		return (
			<div className="flex justify-center">
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-full px-3 py-1">
					<Zap className="h-3 w-3" />
					{message.content}
				</div>
			</div>
		);
	}

	// Media
	if (message.type === "media") {
		return (
			<div className="flex justify-start max-w-[75%]">
				<div className="bg-muted rounded-lg p-3 space-y-1">
					<div className="flex items-center gap-1.5 text-sm">
						<ImageIcon className="h-4 w-4 text-muted-foreground" />
						{message.content || "Mídia"}
					</div>
					{message.mediaUrl && (
						<p className="text-xs text-muted-foreground truncate max-w-xs">{message.mediaUrl}</p>
					)}
					{message.deliveryMode === "async" && <Badge variant="outline" className="text-[10px] h-4">async</Badge>}
				</div>
			</div>
		);
	}

	// Template
	if (message.type === "template") {
		return (
			<div className="flex justify-start max-w-[75%]">
				<div className="bg-muted rounded-lg p-3 space-y-1">
					<div className="flex items-center gap-1.5 text-sm">
						<FileText className="h-4 w-4 text-muted-foreground" />
						{message.content || "Template"}
					</div>
					{message.deliveryMode === "async" && <Badge variant="outline" className="text-[10px] h-4">async</Badge>}
				</div>
			</div>
		);
	}

	// Interactive (buttons)
	if (message.type === "interactive" && message.interactivePayload) {
		return (
			<div className="flex justify-start max-w-[80%]">
				<InteractiveMessage
					payload={message.interactivePayload}
					onButtonClick={onButtonClick}
					disabled={disabled}
					deliveryMode={message.deliveryMode}
				/>
			</div>
		);
	}

	// Text (user or bot)
	return (
		<div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
			<div
				className={cn(
					"max-w-[75%] rounded-lg px-3 py-2 text-sm",
					isUser
						? "bg-primary text-primary-foreground"
						: "bg-muted",
				)}
			>
				<div className="flex items-center gap-1.5 mb-0.5">
					{isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
					<span className="text-[10px] opacity-70">{isUser ? "Você" : "Bot"}</span>
					{message.deliveryMode === "async" && (
						<Badge variant="outline" className="text-[10px] h-4 ml-1">async</Badge>
					)}
				</div>
				<p className="whitespace-pre-wrap">{message.content}</p>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// InteractiveMessage — renders WhatsApp interactive payload with buttons
// ---------------------------------------------------------------------------

function InteractiveMessage({
	payload,
	onButtonClick,
	disabled,
	deliveryMode,
}: {
	payload: Record<string, unknown>;
	onButtonClick: (id: string, title: string) => void;
	disabled: boolean;
	deliveryMode?: string;
}) {
	// WhatsApp format: { type: "interactive", interactive: { type, body, header?, footer?, action } }
	const interactive = (payload.interactive ?? payload) as Record<string, unknown>;
	const body = interactive.body as { text?: string } | undefined;
	const header = interactive.header as { type?: string; text?: string } | undefined;
	const footer = interactive.footer as { text?: string } | undefined;
	const action = interactive.action as { buttons?: Array<{ reply?: { id: string; title: string } }> } | undefined;

	// Instagram format: { message_format: "QUICK_REPLIES", text, quick_replies }
	const quickReplies = payload.quick_replies as Array<{ title: string; payload?: string }> | undefined;
	const igText = payload.text as string | undefined;

	const bodyText = body?.text ?? igText ?? "";
	const buttons = action?.buttons ?? [];

	return (
		<div className="bg-muted rounded-lg overflow-hidden">
			<div className="p-3 space-y-1.5">
				<div className="flex items-center gap-1.5 mb-1">
					<Bot className="h-3 w-3" />
					<span className="text-[10px] opacity-70">Bot</span>
					{deliveryMode === "async" && (
						<Badge variant="outline" className="text-[10px] h-4 ml-1">async</Badge>
					)}
				</div>

				{header?.text && (
					<p className="font-semibold text-sm">{header.text}</p>
				)}
				{bodyText && (
					<p className="text-sm whitespace-pre-wrap">{bodyText}</p>
				)}
				{footer?.text && (
					<p className="text-xs text-muted-foreground">{footer.text}</p>
				)}
			</div>

			{/* WhatsApp buttons */}
			{buttons.length > 0 && (
				<div className="border-t divide-y">
					{buttons.map((btn, i) => (
						<button
							key={btn.reply?.id ?? i}
							onClick={() => btn.reply && onButtonClick(btn.reply.id, btn.reply.title)}
							disabled={disabled}
							className="w-full px-3 py-2 text-sm text-primary hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-center font-medium"
						>
							{btn.reply?.title ?? `Botão ${i + 1}`}
						</button>
					))}
				</div>
			)}

			{/* Instagram quick replies */}
			{quickReplies && quickReplies.length > 0 && (
				<div className="border-t p-2 flex flex-wrap gap-1.5">
					{quickReplies.map((qr, i) => (
						<Button
							key={qr.payload ?? i}
							variant="outline"
							size="sm"
							onClick={() => onButtonClick(qr.payload ?? qr.title, qr.title)}
							disabled={disabled}
							className="text-xs"
						>
							{qr.title}
						</Button>
					))}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// DebugPanel
// ---------------------------------------------------------------------------

function DebugPanel({
	variables,
	executionLog,
	sessionStatus,
}: {
	variables: Record<string, unknown>;
	executionLog: ExecutionLogEntry[];
	sessionStatus: string;
}) {
	const [showVars, setShowVars] = useState(true);
	const [showLog, setShowLog] = useState(true);

	return (
		<div className="space-y-4">
			{/* Status */}
			{sessionStatus && (
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">Status:</span>
					<Badge
						variant={
							sessionStatus === "WAITING_INPUT"
								? "default"
								: sessionStatus === "COMPLETED"
									? "secondary"
									: "destructive"
						}
					>
						{sessionStatus}
					</Badge>
				</div>
			)}

			{/* Variables */}
			<div>
				<button
					onClick={() => setShowVars(!showVars)}
					className="flex items-center gap-1 text-sm font-medium mb-2"
				>
					{showVars ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
					Variáveis de Sessão ({Object.keys(variables).length})
				</button>
				{showVars && (
					<pre className="bg-muted rounded-md p-3 text-xs font-mono overflow-auto max-h-60">
						{JSON.stringify(variables, null, 2)}
					</pre>
				)}
			</div>

			{/* Execution Log */}
			<div>
				<button
					onClick={() => setShowLog(!showLog)}
					className="flex items-center gap-1 text-sm font-medium mb-2"
				>
					{showLog ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
					Execution Log ({executionLog.length} nodos)
				</button>
				{showLog && executionLog.length > 0 && (
					<div className="space-y-1">
						{executionLog.map((entry, i) => (
							<div
								key={`${entry.nodeId}-${i}`}
								className={cn(
									"flex items-center gap-2 text-xs px-2 py-1 rounded",
									entry.result === "ok"
										? "bg-green-500/10 text-green-700 dark:text-green-400"
										: entry.result === "error"
											? "bg-red-500/10 text-red-700 dark:text-red-400"
											: "bg-muted text-muted-foreground",
								)}
							>
								<Badge variant="outline" className="text-[10px] h-4 font-mono">
									{entry.nodeType}
								</Badge>
								<span className="text-muted-foreground">{entry.durationMs}ms</span>
								<Badge variant="outline" className="text-[10px] h-4">
									{entry.deliveryMode}
								</Badge>
								{entry.detail && (
									<span className="truncate text-muted-foreground">{entry.detail}</span>
								)}
							</div>
						))}
					</div>
				)}
				{showLog && executionLog.length === 0 && (
					<p className="text-xs text-muted-foreground">Nenhuma execução ainda</p>
				)}
			</div>
		</div>
	);
}
