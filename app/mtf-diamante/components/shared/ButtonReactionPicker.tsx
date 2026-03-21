"use client";

import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Smile, Camera, Heart, Flag, Clock, FileText, MessageSquare } from "lucide-react";

// Local storage key for recently used emojis
const RECENT_EMOJIS_KEY = "emoji-picker-recent-emojis";
const MAX_RECENT_EMOJIS = 16;
const RECENT_TEMPLATES_KEY = "button-reaction-recent-templates";
const RECENT_INTERACTIVES_KEY = "button-reaction-recent-interactives";

// Utility functions for managing recently used emojis
const getRecentEmojis = (): string[] => {
	if (typeof window === "undefined") return [];
	try {
		const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
};

const addToRecentEmojis = (emoji: string): void => {
	if (typeof window === "undefined") return;
	try {
		const recent = getRecentEmojis();
		const filtered = recent.filter((e) => e !== emoji);
		const updated = [emoji, ...filtered].slice(0, MAX_RECENT_EMOJIS);
		localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(updated));
	} catch {
		// Silently fail if localStorage is not available
	}
};

// Recent items (templates/interativas)
type RecentItem = { id: string; name: string };
const getRecentItems = (key: string): RecentItem[] => {
	if (typeof window === "undefined") return [];
	try {
		const raw = localStorage.getItem(key);
		const arr = raw ? JSON.parse(raw) : [];
		return Array.isArray(arr) ? arr : [];
	} catch {
		return [];
	}
};
const addRecentItem = (key: string, item: RecentItem, limit = 8) => {
	if (typeof window === "undefined") return;
	try {
		const cur = getRecentItems(key);
		const filtered = cur.filter((i) => i.id !== item.id);
		const next = [item, ...filtered].slice(0, limit);
		localStorage.setItem(key, JSON.stringify(next));
	} catch {}
};

// Categorias de emojis organizadas como no WhatsApp
const EMOJI_CATEGORIES = {
	recent: {
		icon: Clock,
		name: "Recently Used",
		emojis: [], // Will be populated dynamically
	},
	smileys: {
		icon: Smile,
		name: "Smileys & People",
		emojis: [
			"😀",
			"😃",
			"😄",
			"😁",
			"😆",
			"😅",
			"🤣",
			"😂",
			"🙂",
			"🙃",
			"😉",
			"😊",
			"😇",
			"🥰",
			"😍",
			"🤩",
			"😘",
			"😗",
			"☺️",
			"😚",
			"😙",
			"🥲",
			"😋",
			"😛",
			"😜",
			"🤪",
			"😝",
			"🤑",
			"🤗",
			"🤭",
			"🤫",
			"🤔",
			"🤐",
			"🤨",
			"😐",
			"😑",
			"😶",
			"😏",
			"😒",
			"🙄",
			"😬",
			"🤥",
			"😔",
			"😪",
			"🤤",
			"😴",
			"😷",
			"🤒",
			"🤕",
			"🤢",
			"🤮",
			"🤧",
			"🥵",
			"🥶",
			"🥴",
			"😵",
			"🤯",
			"🤠",
			"🥳",
			"🥸",
			"😎",
			"🤓",
			"🧐",
			"😕",
			"😟",
			"🙁",
			"☹️",
			"😮",
			"😯",
			"😲",
			"😳",
			"🥺",
			"😦",
			"😧",
			"😨",
			"😰",
			"😥",
			"😢",
			"😭",
			"😱",
			"😖",
			"😣",
			"😞",
			"😓",
			"😩",
			"😫",
			"🥱",
			"😤",
			"😡",
			"😠",
			"🤬",
			"😈",
			"👿",
			"💀",
			"☠️",
			"💩",
			"🤡",
			"👹",
			"👺",
			"👻",
			"👽",
			"👾",
			"🤖",
			"😺",
			"😸",
			"😹",
			"😻",
			"😼",
			"😽",
			"🙀",
			"😿",
			"😾",
		],
	},
	gestures: {
		icon: Heart,
		name: "Gestures & Body",
		emojis: [
			"👋",
			"🤚",
			"🖐️",
			"✋",
			"🖖",
			"👌",
			"🤌",
			"🤏",
			"✌️",
			"🤞",
			"🤟",
			"🤘",
			"🤙",
			"👈",
			"👉",
			"👆",
			"🖕",
			"👇",
			"☝️",
			"👍",
			"👎",
			"👊",
			"✊",
			"🤛",
			"🤜",
			"👏",
			"🙌",
			"👐",
			"🤲",
			"🤝",
			"🙏",
			"✍️",
			"💅",
			"🤳",
			"💪",
			"🦾",
			"🦿",
			"🦵",
			"🦶",
			"👂",
			"🦻",
			"👃",
			"🧠",
			"🫀",
			"🫁",
			"🦷",
			"🦴",
			"👀",
			"👁️",
			"👅",
			"👄",
			"💋",
			"🩸",
		],
	},
	objects: {
		icon: Camera,
		name: "Objects",
		emojis: [
			"💌",
			"💎",
			"🔪",
			"🏺",
			"🗺️",
			"🧭",
			"🧱",
			"💈",
			"🦽",
			"🦼",
			"🛴",
			"🚲",
			"🛵",
			"🏍️",
			"🚗",
			"🚕",
			"🚙",
			"🚐",
			"🛻",
			"🚚",
			"🚛",
			"🚜",
			"🏎️",
			"🚓",
			"🚑",
			"🚒",
			"🚐",
			"🛺",
			"🚨",
			"🚔",
			"🚍",
			"🚘",
			"🚖",
			"🚡",
			"🚠",
			"🚟",
			"🚃",
			"🚋",
			"🚞",
			"🚝",
			"🚄",
			"🚅",
			"🚈",
			"🚂",
			"🚆",
			"🚇",
			"🚊",
			"🚉",
			"✈️",
			"🛫",
			"🛬",
			"🛩️",
			"💺",
			"🛰️",
			"🚀",
			"🛸",
			"🚁",
			"🛶",
			"⛵",
			"🚤",
		],
	},
	symbols: {
		icon: Flag,
		name: "Symbols",
		emojis: [
			"❤️",
			"🧡",
			"💛",
			"💚",
			"💙",
			"💜",
			"🖤",
			"🤍",
			"🤎",
			"💔",
			"❣️",
			"💕",
			"💞",
			"💓",
			"💗",
			"💖",
			"💘",
			"💝",
			"💟",
			"☮️",
			"✝️",
			"☪️",
			"🕉️",
			"☸️",
			"✡️",
			"🔯",
			"🕎",
			"☯️",
			"☦️",
			"🛐",
			"⛎",
			"♈",
			"♉",
			"♊",
			"♋",
			"♌",
			"♍",
			"♎",
			"♏",
			"♐",
			"♑",
			"♒",
			"♓",
			"🆔",
			"⚛️",
			"🉑",
			"☢️",
			"☣️",
			"📴",
			"📳",
			"🈶",
			"🈚",
			"🈸",
			"🈺",
			"🈷️",
			"✴️",
			"🆚",
			"💮",
			"🉐",
			"㊙️",
			"㊗️",
			"🈴",
			"🈵",
			"🈹",
			"🈲",
			"🅰️",
			"🅱️",
			"🆎",
			"🆑",
			"🅾️",
		],
	},
};

interface ButtonReactionPickerProps {
	onEmojiSelect: (emoji: string) => void;
	onClose: () => void;
	isOpen: boolean;
	inboxId?: string; // necessário para listar mensagens interativas por inbox
	channelType?: string; // necessário para detectar se é WhatsApp e mostrar aba Templates
}

export function ButtonReactionPicker({
	onEmojiSelect,
	onClose,
	isOpen,
	inboxId,
	channelType,
}: ButtonReactionPickerProps) {
	// Debug: verificar se inboxId está sendo recebido
	console.log("[ButtonReactionPicker] inboxId recebido:", inboxId);
	const [activeTab, setActiveTab] = useState("emojis");

	// Redirecionar para aba válida se templates estiver ativo em canal não-WhatsApp
	useEffect(() => {
		if (activeTab === "templates" && channelType !== "Channel::Whatsapp") {
			setActiveTab("emojis");
		}
	}, [activeTab, channelType]);
	const [activeCategory, setActiveCategory] = useState("recent");
	const [searchTerm, setSearchTerm] = useState("");
	const [filteredEmojis, setFilteredEmojis] = useState<string[]>([]);
	const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
	const pickerRef = useRef<HTMLDivElement>(null);
	const [selectedTemplateId, setSelectedTemplateId] = useState("");
	const [selectedInteractiveId, setSelectedInteractiveId] = useState("");
	const [templates, setTemplates] = useState<Array<{ id: string; name: string; language?: string }>>([]);
	const [interactives, setInteractives] = useState<Array<{ id: string; name: string; type?: string }>>([]);
	const [loadingOptions, setLoadingOptions] = useState(false);
	const [recentTemplates, setRecentTemplates] = useState<RecentItem[]>([]);
	const [recentInteractives, setRecentInteractives] = useState<RecentItem[]>([]);

	// Helper: derive inboxId from URL if not provided via props
	const getInboxIdFromUrl = React.useCallback((): string | undefined => {
		if (typeof window === "undefined") return undefined;
		const m = window.location?.pathname?.match(/\/inbox\/([^/]+)/);
		return m?.[1];
	}, []);

	// Load recent emojis on mount
	useEffect(() => {
		const recent = getRecentEmojis();
		setRecentEmojis(recent);
		// If no recent emojis, default to smileys category
		if (recent.length === 0) {
			setActiveCategory("smileys");
		}
	}, []);

	useEffect(() => {
		if (searchTerm) {
			const allEmojis = Object.values(EMOJI_CATEGORIES).flatMap((cat) => cat.emojis);
			setFilteredEmojis(
				allEmojis.filter(
					(emoji) => emoji.includes(searchTerm) || getEmojiName(emoji).toLowerCase().includes(searchTerm.toLowerCase()),
				),
			);
		} else {
			setFilteredEmojis([]);
		}
	}, [searchTerm]);

	// Load templates and interactive messages lazily
	useEffect(() => {
		async function loadOptions() {
			if (!isOpen) return;
			setLoadingOptions(true);
			try {
				// Load official templates (always available)
				if (activeTab === "templates") {
					// Use refresh=true to fetch only official WhatsApp templates
					const tplRes = await fetch("/api/admin/mtf-diamante/templates?refresh=true");
					if (tplRes.ok) {
						const data = await tplRes.json();
						const list = (data.templates || []).map((t: any) => ({
							id: String(t.id),
							name: t.name,
							language: t.language,
						}));
						setTemplates(list);
					}
				}
				// Load interactive messages for this inbox
				const effectiveInboxId = inboxId || getInboxIdFromUrl();
				if (activeTab === "interactives" && effectiveInboxId) {
					console.log("[ButtonReactionPicker] Carregando mensagens interativas para inbox:", effectiveInboxId);
					const url = `/api/admin/mtf-diamante/messages-with-reactions?inboxId=${encodeURIComponent(effectiveInboxId)}`;
					const imRes = await fetch(url);
					if (imRes.ok) {
						const im = await imRes.json();
						console.log("[ButtonReactionPicker] Mensagens interativas carregadas:", im);
						const list = (im.messages || []).map((m: any) => ({
							id: String(m.id),
							name: m.name,
							type: m.type,
						}));
						setInteractives(list);
					} else {
						console.error("[ButtonReactionPicker] Erro ao carregar mensagens interativas:", imRes.status);
					}
				} else if (activeTab === "interactives") {
					console.warn(
						"[ButtonReactionPicker] Aba interativas aberta mas inboxId não disponível:",
						inboxId || "(url not found)",
					);
				}
			} catch (e) {
				console.warn("[EmojiPicker] Failed loading options", e);
			} finally {
				setLoadingOptions(false);
			}
		}
		loadOptions();
	}, [isOpen, activeTab, inboxId, getInboxIdFromUrl]);

	// Load recents when entering each tab
	useEffect(() => {
		if (activeTab === "templates") setRecentTemplates(getRecentItems(RECENT_TEMPLATES_KEY));
		if (activeTab === "interactives") setRecentInteractives(getRecentItems(RECENT_INTERACTIVES_KEY));
	}, [activeTab]);

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Element;

			// Check if click is on Select dropdown content
			const isSelectDropdown =
				target.closest("[data-radix-popper-content-wrapper]") ||
				target.closest("[data-radix-select-content]") ||
				target.closest('[role="listbox"]') ||
				target.closest("[data-radix-select-trigger]");

			if (pickerRef.current && !pickerRef.current.contains(event.target as Node) && !isSelectDropdown) {
				onClose();
			}
		}

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen, onClose]);

	const getEmojiName = (emoji: string) => {
		// Mapeamento básico de emojis para nomes (pode ser expandido)
		const emojiNames: Record<string, string> = {
			"😀": "grinning face",
			"😃": "grinning face with big eyes",
			"😄": "grinning face with smiling eyes",
			"❤️": "red heart",
			"💙": "blue heart",
			"💚": "green heart",
			"👍": "thumbs up",
			"👎": "thumbs down",
			"🔥": "fire",
			"💯": "hundred points",
		};
		return emojiNames[emoji] || emoji;
	};

	const handleEmojiSelect = (emoji: string) => {
		// Add to recent emojis if it's not a special action
		if (!["TEXT_RESPONSE", "HANDOFF_ACTION", "SEND_TEMPLATE", "SEND_INTERACTIVE"].includes(emoji)) {
			addToRecentEmojis(emoji);
			setRecentEmojis(getRecentEmojis());
		}
		onEmojiSelect(emoji);
		onClose();
	};

	const handleConfirmTemplate = () => {
		if (selectedTemplateId) {
			const t = templates.find((x) => x.id === selectedTemplateId);
			if (t) addRecentItem(RECENT_TEMPLATES_KEY, { id: t.id, name: t.name });
			onEmojiSelect(`send_template:${selectedTemplateId}`);
			onClose();
		}
	};

	const handleConfirmInteractive = () => {
		if (selectedInteractiveId) {
			const m = interactives.find((x) => x.id === selectedInteractiveId);
			if (m) addRecentItem(RECENT_INTERACTIVES_KEY, { id: m.id, name: m.name });
			onEmojiSelect(`send_interactive:${selectedInteractiveId}`);
			onClose();
		}
	};

	if (!isOpen) return null;

	// Get current emojis based on active category
	const getCurrentEmojis = () => {
		if (searchTerm) {
			return filteredEmojis;
		}

		if (activeCategory === "recent") {
			return recentEmojis;
		}

		return EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES]?.emojis || [];
	};

	const currentEmojis = getCurrentEmojis();

	return (
		<div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
			<div
				ref={pickerRef}
				className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-[600px] h-full max-h-[580px] flex flex-col border border-gray-200 dark:border-gray-700 overflow-hidden"
			>
				{/* Header com botões de ação rápida */}
				<div className="p-4 border-b border-gray-200 dark:border-gray-700">
					<div className="flex items-center justify-between mb-3">
						<div className="flex items-center gap-2 flex-wrap">
							<button
								onClick={() => {
									onEmojiSelect("TEXT_RESPONSE");
									onClose();
								}}
								className="px-2 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-xs font-medium"
							>
								💬 Texto
							</button>
							<button
								onClick={() => {
									onEmojiSelect("HANDOFF_ACTION");
									onClose();
								}}
								className="px-2 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-xs font-medium"
							>
								🚨 Transferir
							</button>
						</div>
						<button
							onClick={onClose}
							className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white p-1"
						>
							✕
						</button>
					</div>
				</div>

				{/* Sistema de Abas */}
				<Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
					<TabsList
						className={`mx-4 mt-3 grid w-full ${channelType === "Channel::Whatsapp" ? "grid-cols-3" : "grid-cols-2"}`}
					>
						<TabsTrigger value="emojis" className="flex items-center gap-1">
							<Smile size={16} />
							Emojis
						</TabsTrigger>
						{/* Aba Templates - apenas para WhatsApp */}
						{channelType === "Channel::Whatsapp" && (
							<TabsTrigger value="templates" className="flex items-center gap-1">
								<FileText size={16} />
								Templates
							</TabsTrigger>
						)}
						<TabsTrigger value="interactives" className="flex items-center gap-1">
							<MessageSquare size={16} />
							Interativas
						</TabsTrigger>
					</TabsList>

					{/* Conteúdo da Aba de Emojis */}
					<TabsContent value="emojis" className="flex-1 flex flex-col m-0">
						{/* Categorias de Emoji */}
						<div className="p-4 border-b border-gray-200 dark:border-gray-700">
							<div className="flex items-center justify-center gap-1">
								{Object.entries(EMOJI_CATEGORIES).map(([key, category]) => {
									const IconComponent = category.icon;
									return (
										<button
											key={key}
											onClick={() => {
												setActiveCategory(key);
												setSearchTerm("");
											}}
											className={`p-2 rounded-lg transition-colors ${
												activeCategory === key
													? "bg-blue-600 text-white"
													: "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
											}`}
											title={category.name}
										>
											<IconComponent size={16} />
										</button>
									);
								})}
							</div>
						</div>

						{/* Search */}
						<div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
							<div className="relative">
								<Search
									className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500"
									size={16}
								/>
								<Input
									type="text"
									placeholder="Pesquisar emoji"
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
									className="pl-10 h-8 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
								/>
							</div>
						</div>

						{/* Emoji Grid */}
						<div
							className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-2 min-h-0"
							style={{
								maxHeight: "320px",
								scrollbarWidth: "thin",
								scrollbarColor: "#cbd5e1 transparent",
							}}
						>
							<div className="grid grid-cols-8 gap-2 w-full pb-2">
								{currentEmojis.map((emoji, index) => (
									<button
										key={`${emoji}-${index}`}
										onClick={() => handleEmojiSelect(emoji)}
										className="w-10 h-10 flex items-center justify-center text-2xl hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
										title={getEmojiName(emoji)}
									>
										{emoji}
									</button>
								))}
							</div>
						</div>

						{/* Footer com emojis populares */}
						<div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2">
							<div className="flex justify-center space-x-1">
								{["❤️", "😂", "😍", "👍", "🔥", "💯", "😊", "🎉"].map((emoji) => (
									<button
										key={emoji}
										onClick={() => handleEmojiSelect(emoji)}
										className="w-7 h-7 flex items-center justify-center text-sm hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
									>
										{emoji}
									</button>
								))}
							</div>
						</div>
					</TabsContent>

					{/* Conteúdo da Aba de Templates */}
					<TabsContent value="templates" className="flex-1 flex flex-col m-0">
						<div
							className="flex-1 overflow-y-auto overflow-x-hidden p-4 min-h-0"
							style={{ maxHeight: "calc(100% - 80px)" }}
						>
							<div className="space-y-4">
								<Label className="text-sm font-medium">Escolha um template oficial do WhatsApp</Label>
								{recentTemplates.length > 0 && (
									<div className="space-y-2">
										<Label className="text-xs text-muted-foreground">Últimos usados</Label>
										<div className="flex flex-wrap gap-2">
											{recentTemplates.map((t) => (
												<button
													key={t.id}
													onClick={() => setSelectedTemplateId(t.id)}
													className={`px-2 py-1 rounded-md text-xs border ${
														selectedTemplateId === t.id
															? "bg-blue-600 text-white border-blue-700"
															: "bg-muted border-border hover:bg-accent"
													}`}
													title={t.name}
												>
													{t.name}
												</button>
											))}
										</div>
									</div>
								)}
								<Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
									<SelectTrigger>
										<SelectValue placeholder={loadingOptions ? "Carregando..." : "Selecione um template"} />
									</SelectTrigger>
									<SelectContent>
										{templates.map((t) => (
											<SelectItem key={t.id} value={t.id}>
												{t.name}
												{t.language ? ` (${t.language})` : ""}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="border-t border-gray-200 dark:border-gray-700 p-4 flex justify-end">
							<Button
								onClick={handleConfirmTemplate}
								disabled={!selectedTemplateId}
								className="bg-blue-600 hover:bg-blue-700"
							>
								Confirmar Template
							</Button>
						</div>
					</TabsContent>

					{/* Conteúdo da Aba de Mensagens Interativas */}
					<TabsContent value="interactives" className="flex-1 flex flex-col m-0">
						<div
							className="flex-1 overflow-y-auto overflow-x-hidden p-4 min-h-0"
							style={{ maxHeight: "calc(100% - 80px)" }}
						>
							<div className="space-y-4">
								<Label className="text-sm font-medium">Escolha uma mensagem interativa existente</Label>
								{recentInteractives.length > 0 && (
									<div className="space-y-2">
										<Label className="text-xs text-muted-foreground">Últimos usados</Label>
										<div className="flex flex-wrap gap-2">
											{recentInteractives.map((m) => (
												<button
													key={m.id}
													onClick={() => setSelectedInteractiveId(m.id)}
													className={`px-2 py-1 rounded-md text-xs border ${
														selectedInteractiveId === m.id
															? "bg-indigo-600 text-white border-indigo-700"
															: "bg-muted border-border hover:bg-accent"
													}`}
													title={m.name}
												>
													{m.name}
												</button>
											))}
										</div>
									</div>
								)}
								{inboxId || getInboxIdFromUrl() ? (
									<Select value={selectedInteractiveId} onValueChange={setSelectedInteractiveId}>
										<SelectTrigger>
											<SelectValue placeholder={loadingOptions ? "Carregando..." : "Selecione uma mensagem"} />
										</SelectTrigger>
										<SelectContent>
											{interactives.map((m) => (
												<SelectItem key={m.id} value={m.id}>
													{m.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : (
									<div className="text-sm text-muted-foreground p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
										Informe um inboxId para listar mensagens interativas.
									</div>
								)}
							</div>
						</div>

						<div className="border-t border-gray-200 dark:border-gray-700 p-4 flex justify-end">
							<Button
								onClick={handleConfirmInteractive}
								disabled={!selectedInteractiveId || !(inboxId || getInboxIdFromUrl())}
								className="bg-indigo-600 hover:bg-indigo-700"
							>
								Confirmar Mensagem
							</Button>
						</div>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}

// Export com alias para compatibilidade (deprecated - use ButtonReactionPicker)
export { ButtonReactionPicker as EmojiPicker };
