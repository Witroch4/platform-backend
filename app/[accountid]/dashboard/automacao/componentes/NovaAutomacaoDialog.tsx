"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useRouter, useParams } from "next/navigation";

interface AutomacaoParams {
	accountid: string;
	[key: string]: string | string[];
}

interface PalavraExpressaoSelectionProps {
	anyword: boolean;
	setAnyword: (value: boolean) => void;
	inputPalavra: string;
	setInputPalavra: (value: string) => void;
	disabled?: boolean;
	className?: string;
}

export default function NovaAutomacaoDialog() {
	const [open, setOpen] = useState(false);
	const router = useRouter();
	const params = useParams() as AutomacaoParams;

	// Exemplo: Se for criar uma automação "Eu Quero..."
	function handleCardAutomacaoEuQuero() {
		// Redireciona para a página de criação/edição usando o accountid da rota
		router.push(`/${params.accountid}/dashboard/automacao/guiado-facil`);
		setOpen(false);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>+ Nova Automação</Button>
			</DialogTrigger>
			<DialogContent
				className={cn("sm:max-w-[800px]", "max-h-[80vh] overflow-y-auto", "mx-auto", "bg-background border-border")}
			>
				<DialogHeader>
					<DialogTitle className="text-foreground">Modelos prontos</DialogTitle>
					<DialogDescription className="text-muted-foreground">
						Recomendados &mdash; Principais modelos para impulsionar o seu Instagram
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-4">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{/* Exemplo de Card habilitado */}
						<div
							onClick={handleCardAutomacaoEuQuero}
							className="border border-border rounded-lg p-3 cursor-pointer hover:border-primary bg-card transition-colors"
						>
							<h3 className="font-bold text-sm md:text-base mb-1 text-card-foreground">
								Automação Eu Quero - Enviar links automaticamente por DM
							</h3>
							<p className="text-xs md:text-sm text-muted-foreground">
								Envie um link sempre que alguém comentar em uma publicação ou reel
							</p>
							<div className="text-xs md:text-sm flex items-center justify-between mt-3">
								<span className="font-semibold text-card-foreground">Automação Rápida</span>
								<span className="px-2 py-1 text-xs bg-pink-500 text-white rounded-full">POPULAR</span>
							</div>
						</div>

						{/* Cards de exemplo "Em desenvolvimento" */}
						<CardEmDesenvolvimento
							titulo="Gere leads dos stories"
							descricao="Use ofertas por tempo limitado nos Stories para converter leads"
							rodape="Fluxo Canva"
						/>
						<CardEmDesenvolvimento
							titulo="Use IA para automatizar interações"
							descricao="Utilize a IA para coletar dados dos seguidores..."
							rodape="Fluxo Canva + IA"
						/>
						{/* ... outros cards que desejar ... */}
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)} className="border-border hover:bg-accent">
						Fechar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/* ------------------------------------------------------------------
   CARD "Em Desenvolvimento" (exemplo)
------------------------------------------------------------------ */
function CardEmDesenvolvimento({
	titulo,
	descricao,
	rodape,
}: {
	titulo: string;
	descricao: string;
	rodape: string;
}) {
	return (
		<div className="relative border border-border rounded-lg p-3 opacity-50 cursor-not-allowed bg-card">
			<div className="absolute top-2 -right-10 transform rotate-45 bg-red-600 text-white text-xs font-bold px-6 py-1">
				Em Desenvolvimento
			</div>
			<h3 className="font-bold text-sm md:text-base mb-1 text-card-foreground">{titulo}</h3>
			<p className="text-xs md:text-sm text-muted-foreground">{descricao}</p>
			<div className="text-xs md:text-sm flex items-center justify-between mt-3">
				<span className="text-card-foreground">{rodape}</span>
			</div>
		</div>
	);
}
