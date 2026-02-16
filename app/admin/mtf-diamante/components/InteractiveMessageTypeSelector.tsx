"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	ExternalLink,
	Workflow,
	List,
	MousePointer,
	MapPin,
	Navigation,
	Smile,
	Image as ImageIcon,
	Check,
	MessageCircle,
	Grid3x3,
	SquarePlay,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlowEffect } from "@/components/ui/glow-effect";
import type { InteractiveMessageType } from "./interactive-message-creator/types";
import { isInstagramChannel } from "@/types/interactive-messages";

interface MessageTypeConfig {
	id: InteractiveMessageType;
	label: string;
	description: string;
	icon: React.ComponentType<{ className?: string }>;
	features: string[];
	examples: string[];
	complexity: "Simples" | "Médio" | "Avançado";
	supportedChannels: ("whatsapp" | "instagram")[];
	instagramLimits?: {
		maxText?: number;
		maxButtons?: number;
		maxElements?: number;
		maxOptions?: number;
	};
}

// Instagram Message Types
const INSTAGRAM_TYPES: MessageTypeConfig[] = [
	{
		id: "quick_replies",
		label: "Respostas Rápidas",
		description: "Botões de resposta rápida com até 13 botões",
		icon: MessageCircle,
		features: ["Até 13 botões", "Título de 20 caracteres", "Prompt de 1000 caracteres"],
		examples: ["Menu de opções", "Pesquisa de satisfação", "Seleção de categoria"],
		complexity: "Simples",
		supportedChannels: ["instagram"],
		instagramLimits: {
			maxText: 1000,
			maxOptions: 13,
		},
	},
	{
		id: "generic",
		label: "Template Genérico (Carrossel)",
		description: "Carrossel com até 10 elementos, cada um com título e subtítulo de 80 caracteres",
		icon: Grid3x3,
		features: [
			"Até 10 elementos",
			"Título de 80 caracteres",
			"Subtítulo de 80 caracteres",
			"Máximo 3 botões por elemento",
		],
		examples: ["Catálogo de produtos", "Galeria de serviços", "Portfólio de projetos"],
		complexity: "Médio",
		supportedChannels: ["instagram"],
		instagramLimits: {
			maxElements: 10,
			maxButtons: 3,
		},
	},
	{
		id: "button_template",
		label: "Template de Botões",
		description: "Mensagem de texto com 1-3 botões (texto máximo de 640 caracteres)",
		icon: SquarePlay,
		features: ["Texto de 640 caracteres", "1-3 botões", "Botões web_url ou postback"],
		examples: ["Chamada para ação", "Menu de navegação", "Opções de contato"],
		complexity: "Simples",
		supportedChannels: ["instagram"],
		instagramLimits: {
			maxText: 640,
			maxButtons: 3,
		},
	},
];

// WhatsApp Message Types
const WHATSAPP_TYPES: MessageTypeConfig[] = [
	{
		id: "button",
		label: "Botões de Resposta Rápida",
		description: "Botões simples para respostas rápidas do usuário",
		icon: MousePointer,
		features: ["Até 3 botões", "Respostas instantâneas", "Fácil de usar"],
		examples: ["Menu principal", "Confirmação de agendamento", "Opções de atendimento"],
		complexity: "Simples",
		supportedChannels: ["whatsapp"],
	},
	{
		id: "list",
		label: "Lista de Opções",
		description: "Menu organizado com múltiplas seções e opções",
		icon: List,
		features: ["Múltiplas seções", "Até 10 itens por seção", "Descrições detalhadas"],
		examples: ["Catálogo de produtos", "Menu de serviços", "Opções de entrega"],
		complexity: "Médio",
		supportedChannels: ["whatsapp"],
	},
	{
		id: "cta_url",
		label: "Botão Call-to-Action com URL",
		description: "Botão que direciona para um link externo",
		icon: ExternalLink,
		features: ["Link externo", "Rastreamento de cliques", "Personalização de texto"],
		examples: ["Agendar consulta", "Ver site", "Baixar documento"],
		complexity: "Simples",
		supportedChannels: ["whatsapp"],
	},
	{
		id: "flow",
		label: "Fluxo Interativo",
		description: "Inicia um fluxo complexo do WhatsApp Business",
		icon: Workflow,
		features: ["Fluxos personalizados", "Coleta de dados", "Experiência rica"],
		examples: ["Agendamento completo", "Cadastro de cliente", "Pesquisa de satisfação"],
		complexity: "Avançado",
		supportedChannels: ["whatsapp"],
	},
	{
		id: "location",
		label: "Localização",
		description: "Envia uma localização específica para o usuário",
		icon: MapPin,
		features: ["Coordenadas GPS", "Nome do local", "Endereço completo"],
		examples: ["Localização do escritório", "Ponto de encontro", "Endereço de entrega"],
		complexity: "Simples",
		supportedChannels: ["whatsapp"],
	},
	{
		id: "location_request",
		label: "Solicitar Localização",
		description: "Solicita que o usuário compartilhe sua localização",
		icon: Navigation,
		features: ["Solicitação de GPS", "Localização em tempo real", "Fácil compartilhamento"],
		examples: ["Localização para entrega", "Encontrar cliente", "Serviço no local"],
		complexity: "Simples",
		supportedChannels: ["whatsapp"],
	},
	{
		id: "reaction",
		label: "Reação",
		description: "Reage a uma mensagem anterior com emoji",
		icon: Smile,
		features: ["Emojis diversos", "Resposta rápida", "Feedback instantâneo"],
		examples: ["Confirmação com ❤️", "Aprovação com 👍", "Celebração com 🎉"],
		complexity: "Simples",
		supportedChannels: ["whatsapp"],
	},
	{
		id: "sticker",
		label: "Sticker/Figurinha",
		description: "Envia um sticker ou figurinha personalizada",
		icon: ImageIcon,
		features: ["Stickers personalizados", "Expressão visual", "Engajamento alto"],
		examples: ["Sticker de boas-vindas", "Figurinha de agradecimento", "Emoji personalizado"],
		complexity: "Médio",
		supportedChannels: ["whatsapp"],
	},
];

interface InteractiveMessageTypeSelectorProps {
	selectedType?: InteractiveMessageType;
	onTypeSelect: (type: InteractiveMessageType) => void;
	showExamples?: boolean;
	channelType?: string;
}

export const InteractiveMessageTypeSelector: React.FC<InteractiveMessageTypeSelectorProps> = ({
	selectedType,
	onTypeSelect,
	showExamples = false,
	channelType = "Channel::WhatsApp",
}) => {
	const isInstagram = isInstagramChannel(channelType);

	// State para controlar glow effect
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [prefersReduced, setPrefersReduced] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		const handle = () => setPrefersReduced(Boolean(mq.matches));
		handle();
		try {
			mq.addEventListener?.("change", handle);
		} catch {
			mq.addListener?.(handle);
		}
		return () => {
			try {
				mq.removeEventListener?.("change", handle);
			} catch {
				mq.removeListener?.(handle);
			}
		};
	}, []);

	// Get available types based on channel
	const availableTypes = isInstagram ? INSTAGRAM_TYPES : WHATSAPP_TYPES;

	const getComplexityColor = (complexity: string) => {
		switch (complexity) {
			case "Simples":
				return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
			case "Médio":
				return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
			case "Avançado":
				return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
			default:
				return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
		}
	};

	const getChannelBadge = () => {
		if (isInstagram) {
			return (
				<Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
					Instagram
				</Badge>
			);
		} else {
			return (
				<Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
					WhatsApp
				</Badge>
			);
		}
	};

	return (
		<div className="space-y-6">
			<div className="text-center">
				<div className="flex items-center justify-center gap-2 mb-2">
					<h3 className="text-lg font-semibold text-foreground">Escolha o Tipo de Mensagem Interativa</h3>
					{getChannelBadge()}
				</div>
				<p className="text-sm text-muted-foreground">
					{isInstagram
						? "Selecione o tipo de mensagem para Instagram (com limites específicos)"
						: "Selecione o tipo de mensagem que melhor atende às suas necessidades"}
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{availableTypes.map((type) => {
					const IconComponent = type.icon;
					const isSelected = selectedType === type.id;

					return (
						<div
							key={type.id}
							className="relative"
							onMouseEnter={() => setHoveredId(type.id)}
							onMouseLeave={() => setHoveredId(null)}
						>
							{/* Glow effect - renderiza só quando hover e sem preferência por reduzir animação */}
							{!prefersReduced && hoveredId === type.id && (
								<div
									className="pointer-events-none absolute inset-0 z-0 opacity-30 transition-opacity duration-300"
									aria-hidden
									role="presentation"
								>
									<GlowEffect
										colors={
											isInstagram
												? ["#E4405F", "#833AB4", "#C13584", "#F56040"]
												: ["#25D366", "#128C7E", "#075E54", "#DCF8C6"]
										}
										mode="colorShift"
										blur="medium"
										duration={4}
									/>
								</div>
							)}

							<Card
								className={cn(
									"relative z-10 cursor-pointer transition-all duration-200 hover:shadow-md h-full flex flex-col",
									isSelected && "ring-2 ring-primary border-primary",
								)}
								onClick={() => onTypeSelect(type.id)}
							>
								<CardHeader className="pb-3">
									<div className="flex items-start justify-between">
										<div className="flex items-center gap-3">
											<div
												className={cn(
													"p-2 rounded-lg",
													isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
												)}
											>
												<IconComponent className="h-5 w-5" />
											</div>
											<div className="flex-1">
												<CardTitle className="text-sm font-medium text-foreground">{type.label}</CardTitle>
											</div>
										</div>
										{isSelected && (
											<div className="p-1 rounded-full bg-primary text-primary-foreground">
												<Check className="h-3 w-3" />
											</div>
										)}
									</div>

									<div className="flex items-center gap-2 mt-2">
										<Badge variant="outline" className={cn("text-xs", getComplexityColor(type.complexity))}>
											{type.complexity}
										</Badge>
										{isInstagram && type.instagramLimits && (
											<Badge
												variant="outline"
												className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
											>
												Limites IG
											</Badge>
										)}
									</div>
								</CardHeader>

								<CardContent className="pt-0 flex-1 flex flex-col">
									<CardDescription className="text-xs mb-3">{type.description}</CardDescription>

									<div className="space-y-3 flex-1">
										<div>
											<h4 className="text-xs font-medium text-foreground mb-1">Recursos:</h4>
											<ul className="text-xs text-muted-foreground space-y-1">
												{type.features.map((feature, index) => (
													<li key={index} className="flex items-center gap-1">
														<div className="w-1 h-1 bg-primary rounded-full" />
														{feature}
													</li>
												))}
											</ul>
										</div>

										{isInstagram && type.instagramLimits && (
											<div>
												<h4 className="text-xs font-medium text-foreground mb-1">Limites Instagram:</h4>
												<ul className="text-xs text-muted-foreground space-y-1">
													{type.instagramLimits.maxText && (
														<li className="flex items-center gap-1">
															<div className="w-1 h-1 bg-purple-500 rounded-full" />
															Texto: máx {type.instagramLimits.maxText} chars
														</li>
													)}
													{type.instagramLimits.maxButtons && (
														<li className="flex items-center gap-1">
															<div className="w-1 h-1 bg-purple-500 rounded-full" />
															Botões: máx {type.instagramLimits.maxButtons}
														</li>
													)}
													{type.instagramLimits.maxElements && (
														<li className="flex items-center gap-1">
															<div className="w-1 h-1 bg-purple-500 rounded-full" />
															Elementos: máx {type.instagramLimits.maxElements}
														</li>
													)}
													{type.instagramLimits.maxOptions && (
														<li className="flex items-center gap-1">
															<div className="w-1 h-1 bg-purple-500 rounded-full" />
															Botões: máx {type.instagramLimits.maxOptions}
														</li>
													)}
												</ul>
											</div>
										)}

										{showExamples && (
											<div>
												<h4 className="text-xs font-medium text-foreground mb-1">Exemplos de uso:</h4>
												<ul className="text-xs text-muted-foreground space-y-1">
													{type.examples.slice(0, 2).map((example, index) => (
														<li key={index} className="flex items-center gap-1">
															<div className="w-1 h-1 bg-muted-foreground rounded-full" />
															{example}
														</li>
													))}
												</ul>
											</div>
										)}
									</div>

									<Button
										variant={isSelected ? "default" : "outline"}
										className="w-full mt-4"
										onClick={(e) => {
											e.stopPropagation();
											onTypeSelect(type.id);
										}}
									>
										{isSelected ? "Selecionado" : "Selecionar"}
									</Button>
								</CardContent>
							</Card>
						</div>
					);
				})}
			</div>
		</div>
	);
};

export default InteractiveMessageTypeSelector;
