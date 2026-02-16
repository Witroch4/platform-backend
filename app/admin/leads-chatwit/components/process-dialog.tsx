import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { Sparkles, FileText, Image as ImageIcon, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Componente Progress personalizado com cor azul
const BlueProgress = React.forwardRef<
	React.ElementRef<typeof ProgressPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
	<ProgressPrimitive.Root
		ref={ref}
		className={cn("relative h-3 w-full overflow-hidden rounded-full bg-muted/50", className)}
		{...props}
	>
		<ProgressPrimitive.Indicator
			className="h-full w-full flex-1 transition-all"
			style={{
				transform: `translateX(-${100 - (value || 0)}%)`,
				backgroundColor: "#00ADEF",
			}}
		/>
	</ProgressPrimitive.Root>
));
BlueProgress.displayName = "BlueProgress";

export type ProcessType = "unify" | "convert";

interface ProcessDialogProps {
	isOpen: boolean;
	onClose: () => void;
	processType: ProcessType;
	leadName: string;
	numFiles?: number;
}

export function ProcessDialog({ isOpen, onClose, processType, leadName, numFiles = 0 }: ProcessDialogProps) {
	const [progress, setProgress] = useState(0);
	const [messageIndex, setMessageIndex] = useState(0);
	const [longProcess, setLongProcess] = useState(false);
	const [isComplete, setIsComplete] = useState(false);
	const [magicEffect, setMagicEffect] = useState(false);

	// Título e subtítulo para unificação
	const unifyTitle = "✨🎩 Abracadabra, arquivos unificados! 🎩✨";
	const unifySubtitle = `📁 ${numFiles} arquivos mágicos passaram pelo portal do Chatwit-Social e se fundiram perfeitamente para o lead ${leadName}. 🪄💫`;

	// Título e subtítulo para conversão
	const convertTitle = "✨📷 Preparando a magia das imagens! 📷✨";
	const convertSubtitle = `📄✨ O PDF mágico de ${leadName} já está pronto para ser transformado!`;

	// Mensagens para unificação
	const unifyMessages = [
		"⏳🔄 Enquanto isso, os duendes da tecnologia estão fazendo o trabalho pesado...",
		"📥✨ O primeiro arquivo já chegou voando nas asas digitais!",
		"📥✨ O segundo arquivo acabou de aterrissar suavemente!",
		"🌪️✨ Misturando tudo com pó mágico... quase lá!",
		"🧙‍♂️📄 Unificando, salvando e polindo seu PDF com carinho!",
		"☁️🚀 Enviando agora para o reino mágico da nuvem...",
		"✅✨ Prontinho! Arquivos unificados com sucesso! Aproveite sua leitura encantada! 🦄📖",
	];

	// Mensagens adicionais para unificação longa
	const unifyLongMessages = [
		"⌛✨ Parece que a magia está demorando um pouquinho mais hoje, mas está tudo sob controle!",
		"🧙‍♀️📚 Nossos duendes tecnológicos ainda estão trabalhando duro, já já fica pronto!",
		"💤✨ Não cochile ainda, estamos quase lá!",
	];

	// Mensagens para conversão
	const convertMessages = [
		"⏳🔄 Enquanto isso, nossas fadas digitais preparam tudo com carinho...",
		"📸✨ Capturando a primeira página em uma imagem encantada!",
		"📸✨ Registrando cada detalhe mágico da próxima página...",
		"🌟✨ Quase lá! As imagens estão ficando incríveis!",
		"🖼️✨ Salvando as imagens com aquele toque especial...",
		"☁️🚀 Enviando agora para o reino mágico da nuvem...",
		"✅✨ Imagens prontinhas! Aproveite a visualização encantadora! 🦄🌈",
	];

	// Mensagens adicionais para conversão longa
	const convertLongMessages = [
		"⌛✨ Parece que hoje as fadas estão especialmente detalhistas, aguarde mais um pouquinho!",
		"🧚‍♀️📸 Nossos assistentes mágicos estão caprichando nas imagens, logo estará tudo pronto!",
		"💭✨ Continue sonhando acordado, falta bem pouquinho!",
	];

	// Selecionar mensagens apropriadas
	const messages = processType === "unify" ? unifyMessages : convertMessages;
	const longMessages = processType === "unify" ? unifyLongMessages : convertLongMessages;
	const title = processType === "unify" ? unifyTitle : convertTitle;
	const subtitle = processType === "unify" ? unifySubtitle : convertSubtitle;

	// Ativar efeito mágico a cada mudança de mensagem
	useEffect(() => {
		if (isOpen && messageIndex > 0) {
			setMagicEffect(true);
			const timer = setTimeout(() => {
				setMagicEffect(false);
			}, 1000);

			return () => clearTimeout(timer);
		}
	}, [messageIndex, isOpen]);

	// Efeito para simular o progresso
	useEffect(() => {
		if (!isOpen) {
			// Reiniciar estado quando o dialog fecha
			setProgress(0);
			setMessageIndex(0);
			setLongProcess(false);
			setIsComplete(false);
			return;
		}

		// Começar com a primeira mensagem
		setMessageIndex(0);

		let timer: NodeJS.Timeout;
		let timeElapsed = 0;
		const longProcessThreshold = 30; // Segundos
		const messageInterval = 3; // Segundos entre mensagens

		// Simular progresso de forma incremental
		const updateProgress = () => {
			timeElapsed += 1;

			// Atualizar progresso
			setProgress((prev) => {
				// Progresso mais lento e realista
				const increment =
					prev < 50
						? Math.random() * 3 + 1
						: // Início mais rápido
							prev < 85
							? Math.random() * 1.5 + 0.5
							: // Meio mais lento
								Math.random() * 0.5 + 0.1; // Final bem mais lento

				const newProgress = Math.min(prev + increment, 99);

				// Se completou 99%, aguardar confirmação externa
				if (newProgress >= 99 && !isComplete) {
					// Não finalizar automaticamente, aguardar sinal externo
					setMessageIndex(messages.length - 2); // Penúltima mensagem
				}

				return newProgress;
			});

			// Verificar se é um processo longo
			if (timeElapsed >= longProcessThreshold && !longProcess) {
				setLongProcess(true);
			}

			// Atualizar mensagem a cada intervalo
			if (timeElapsed % messageInterval === 0 && !isComplete) {
				setMessageIndex((prev) => {
					if (longProcess) {
						// Usar mensagens de processo longo
						const randomIndex = Math.floor(Math.random() * longMessages.length);
						return randomIndex;
					} else {
						// Incrementar para a próxima mensagem normal, exceto a última
						const nextIndex = prev + 1;
						if (nextIndex >= messages.length - 1) {
							return messages.length - 2; // Manter na penúltima mensagem
						}
						return nextIndex;
					}
				});
			}

			// Continuar atualizando até completar
			if (!isComplete) {
				timer = setTimeout(updateProgress, 1000);
			}
		};

		// Iniciar simulação de progresso
		timer = setTimeout(updateProgress, 1000);

		return () => {
			clearTimeout(timer);
		};
	}, [isOpen, messages.length, longMessages.length, longProcess, isComplete, onClose]);

	// Efeito para finalizar o progresso quando isComplete for true
	useEffect(() => {
		if (isComplete) {
			setProgress(100);
			setMessageIndex(messages.length - 1); // Última mensagem
			const timer = setTimeout(() => {
				onClose();
			}, 1500);
			return () => clearTimeout(timer);
		}
	}, [isComplete, messages.length, onClose]);

	// Obter a mensagem atual
	const getCurrentMessage = () => {
		if (isComplete) {
			return messages[messages.length - 1]; // Mensagem final
		}

		if (longProcess) {
			// Obter mensagem de processo longo
			return longMessages[messageIndex];
		}

		// Mensagem normal do processo (evitando a última mensagem que é mostrada apenas quando completa)
		return messages[messageIndex];
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && !isComplete && onClose()}>
			<DialogContent className="max-w-md backdrop-blur-xl bg-background/95 shadow-xl border-primary/20 overflow-hidden">
				<div
					className={`absolute inset-0 bg-gradient-to-r from-primary/5 via-secondary/5 to-primary/5 pointer-events-none ${magicEffect ? "opacity-30" : "opacity-0"} transition-opacity duration-1000`}
				></div>

				{/* Partículas de magia */}
				<div className="absolute inset-0 overflow-hidden pointer-events-none">
					{Array.from({ length: 12 }).map((_, i) => (
						<div
							key={i}
							className="absolute w-2 h-2 rounded-full bg-primary/30"
							style={{
								top: `${Math.random() * 100}%`,
								left: `${Math.random() * 100}%`,
								animation: `float-particle ${5 + Math.random() * 5}s linear infinite`,
								animationDelay: `${Math.random() * 5}s`,
								opacity: 0.7,
							}}
						/>
					))}
				</div>

				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-xl">
						{processType === "unify" ? (
							<>
								<FileText className="h-5 w-5 text-primary" />
								Unificando Arquivos em PDF
							</>
						) : (
							<>
								<ImageIcon className="h-5 w-5 text-primary" />
								Convertendo PDF em Imagens
							</>
						)}
					</DialogTitle>
				</DialogHeader>

				<div className="py-6">
					<div className="mb-8 flex justify-center">
						<div className="relative">
							{processType === "unify" ? (
								<div className={`relative z-10 ${magicEffect ? "animate-bounce" : ""} duration-300`}>
									<FileText className="h-16 w-16 text-primary animate-pulse" />
								</div>
							) : (
								<div className={`relative z-10 ${magicEffect ? "animate-bounce" : ""} duration-300`}>
									<ImageIcon className="h-16 w-16 text-primary animate-pulse" />
								</div>
							)}
							<div className="absolute -inset-4 bg-primary/10 rounded-full blur-xl animate-pulse"></div>
							<Wand2
								className={`absolute -right-2 -top-2 h-8 w-8 text-yellow-500 ${magicEffect ? "animate-spin" : ""} transition-transform duration-500`}
							/>
						</div>
					</div>

					<div className={`text-center mb-8 transition-all duration-500 ${magicEffect ? "scale-105" : "scale-100"}`}>
						<p className="text-lg mb-2 font-medium">{title}</p>
						<p className="text-sm mb-4 text-muted-foreground">{subtitle}</p>
						<div className="min-h-[3rem] flex items-center justify-center">
							<p className={`text-base transition-opacity duration-300 ${magicEffect ? "opacity-80" : "opacity-100"}`}>
								{getCurrentMessage()}
							</p>
						</div>
					</div>

					<div className="space-y-2">
						<div className="relative">
							<BlueProgress value={progress} />
							<div
								className={`absolute inset-0 bg-gradient-to-r from-[#00ADEF]/0 via-[#00ADEF]/30 to-[#00ADEF]/0 blur-md ${magicEffect ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
							></div>
						</div>
						<p className="text-xs text-muted-foreground text-right">{Math.round(progress)}%</p>
					</div>
				</div>

				<style jsx global>{`
          @keyframes float-particle {
            0% {
              transform: translateY(0) translateX(0);
              opacity: 0;
            }
            50% {
              opacity: 0.8;
            }
            100% {
              transform: translateY(-${100 + Math.random() * 150}px) translateX(${-50 + Math.random() * 100}px);
              opacity: 0;
            }
          }
        `}</style>
			</DialogContent>
		</Dialog>
	);
}
