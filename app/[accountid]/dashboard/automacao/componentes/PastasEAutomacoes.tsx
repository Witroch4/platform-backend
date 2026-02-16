//app\dashboard\automacao\componentes\PastasEAutomacoes.tsx
"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MenuAcoesAutomacao from "./MenuAcoesAutomacao";

interface Pasta {
	id: string;
	name: string;
	userId: string;
}
interface Automacao {
	id: string;
	fraseBoasVindas: string | null;
	updatedAt: string;
	folderId: string | null;
}

interface PastasEAutomacoesProps {
	pastas: Pasta[];
	automacoes: Automacao[];
	providerAccountId: string;
	onCreated: () => void;
}

export default function PastasEAutomacoes({
	pastas,
	automacoes,
	providerAccountId,
	onCreated,
}: PastasEAutomacoesProps) {
	const [openNovaPasta, setOpenNovaPasta] = useState(false);
	const [novaPastaName, setNovaPastaName] = useState("");

	// Estado que indica qual pasta está aberta (ou null se estiver na raiz)
	const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

	// Cria uma nova pasta
	async function handleCriarNovaPasta() {
		if (!novaPastaName.trim()) return;
		try {
			const res = await fetch("/api/pasta", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: novaPastaName.trim(),
					providerAccountId,
				}),
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Falha ao criar pasta");
			}
			setNovaPastaName("");
			setOpenNovaPasta(false);
			onCreated();
		} catch (e: any) {
			console.error(e.message);
		}
	}

	// Ao clicar em uma pasta, entramos nela (mostrando somente as automações dessa pasta)
	function handleEnterFolder(folderId: string) {
		setCurrentFolderId(folderId);
	}

	// Se estiver dentro de uma pasta, este botão volta para a raiz
	function handleGoBackToRoot() {
		setCurrentFolderId(null);
	}

	// Abre automação existente
	function handleOpenAutomacao(autoId: string) {
		window.location.href = `/${providerAccountId}/dashboard/automacao/guiado-facil/${autoId}`;
	}

	// -------------------------------------------------------------
	// Filtragem de automações baseada em currentFolderId
	// -------------------------------------------------------------
	const automacoesFiltradas = automacoes.filter((auto) => {
		// Se NÃO há pasta selecionada, mostra apenas automações sem folderId
		if (!currentFolderId) {
			return auto.folderId === null;
		}
		// Se há pasta selecionada, mostra as automações cujo folderId seja igual a currentFolderId
		return auto.folderId === currentFolderId;
	});

	// -------------------------------------------------------------
	// Renderização
	// -------------------------------------------------------------
	return (
		<div className="min-h-full w-full bg-background">
			{/* Botão "Nova Pasta" + Diálogo */}

			{/* Se estamos dentro de uma pasta, exibe o botão "Voltar" */}
			{currentFolderId && (
				<div className="mb-4">
					<Button variant="outline" onClick={handleGoBackToRoot} className="border-border hover:bg-accent">
						← Voltar para raiz
					</Button>
				</div>
			)}

			{/* LISTAGEM DE PASTAS (apenas se não houver pasta selecionada) */}
			{!currentFolderId && (
				<div className="mb-6 space-y-2">
					{pastas.map((pasta) => (
						<div
							key={pasta.id}
							className="flex items-center gap-2 cursor-pointer hover:bg-accent transition-colors p-2 rounded border border-border bg-card"
							onClick={() => handleEnterFolder(pasta.id)}
						>
							<FolderIcon />
							<span className="text-card-foreground">{pasta.name}</span>
						</div>
					))}
				</div>
			)}

			{/* LISTAGEM DE AUTOMAÇÕES (filtradas) */}
			{automacoesFiltradas.length === 0 ? (
				<div className="flex items-center justify-center min-h-[200px]">
					<div className="text-sm text-muted-foreground">
						Nenhuma automação {currentFolderId ? "nesta pasta" : "na raiz"}.
					</div>
				</div>
			) : (
				<div className="space-y-2">
					{automacoesFiltradas.map((auto) => (
						<div
							key={auto.id}
							className="flex items-center justify-between px-4 py-3 border border-border rounded bg-card"
						>
							<div
								className="flex flex-col cursor-pointer hover:bg-accent transition-colors p-2 rounded"
								onClick={() => handleOpenAutomacao(auto.id)}
							>
								<span className="font-semibold text-card-foreground">
									{auto.fraseBoasVindas || "Automação Sem Título"}
								</span>
								<div className="text-xs text-muted-foreground">ID: {auto.id}</div>
							</div>

							{/* Menu de Ações (Renomear, Duplicar, Mover, Apagar) */}
							<MenuAcoesAutomacao
								automacao={auto}
								pastas={pastas}
								fetchData={onCreated}
								providerAccountId={providerAccountId}
							/>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

/* ÍCONE DE PASTA */
function FolderIcon() {
	return (
		<svg
			width="16"
			height="16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			viewBox="0 0 24 24"
			className="text-muted-foreground"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M2.25 12.75v-5.5c0-.828.672-1.5 1.5-1.5h6l2 2h8a1.5 1.5 0 011.5 1.5v3.5M2.25 12.75h19.5M2.25 12.75l1.5 7.5c.15.75.825 1.25 1.575 1.25h13.35c.75 0 1.425-.5 1.575-1.25l1.5-7.5"
			></path>
		</svg>
	);
}
