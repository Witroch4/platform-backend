"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

import { ChevronDown, Edit, Copy, FolderPlus, Trash } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface Automacao {
	id: string;
	fraseBoasVindas: string | null;
	updatedAt: string;
	folderId: string | null;
}

interface Pasta {
	id: string;
	name: string;
	userId: string;
}

interface MenuAcoesProps {
	automacao: Automacao;
	fetchData: () => void;
	pastas: Pasta[];
	providerAccountId: string;
}

export default function MenuAcoesAutomacao({ automacao, fetchData, pastas, providerAccountId }: MenuAcoesProps) {
	// Estado do dropdown
	const [menuOpen, setMenuOpen] = useState(false);

	// Estados dos diálogos (fora do menu)
	const [openRename, setOpenRename] = useState(false);
	const [openDuplicate, setOpenDuplicate] = useState(false);
	const [openMove, setOpenMove] = useState(false);
	const [openDelete, setOpenDelete] = useState(false);

	// Inputs / Seleções
	const [renameValue, setRenameValue] = useState("");
	const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

	// Handlers de abertura dos diálogos
	function handleOpenRename() {
		setMenuOpen(false); // Fecha o menu
		setRenameValue(automacao.fraseBoasVindas || "");
		setOpenRename(true); // Abre o diálogo
	}

	function handleOpenDuplicate() {
		setMenuOpen(false);
		setOpenDuplicate(true);
	}

	function handleOpenMove() {
		setMenuOpen(false);
		setOpenMove(true);
	}

	function handleOpenDelete() {
		setMenuOpen(false);
		setOpenDelete(true);
	}

	// Funções de API
	async function handleRename() {
		try {
			const res = await fetch(`/api/automacao/${automacao.id}?providerAccountId=${providerAccountId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "rename",
					newName: renameValue,
				}),
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Falha ao renomear automação");
			}
			setRenameValue("");
			setOpenRename(false);
			fetchData();
		} catch (e: any) {
			console.error(e.message);
		}
	}

	async function handleDuplicate() {
		try {
			const res = await fetch(`/api/automacao/${automacao.id}/duplicate?providerAccountId=${providerAccountId}`, {
				method: "POST",
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Falha ao duplicar automação");
			}
			setOpenDuplicate(false);
			fetchData();
		} catch (e: any) {
			console.error(e.message);
		}
	}

	async function handleMove() {
		if (!selectedFolderId) return;

		// Determina o folderId com base na seleção
		const folderId = selectedFolderId === "root" ? null : selectedFolderId;

		try {
			const res = await fetch(`/api/automacao/${automacao.id}?providerAccountId=${providerAccountId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "move",
					folderId: folderId,
				}),
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Falha ao mover automação");
			}
			setSelectedFolderId(null);
			setOpenMove(false);
			fetchData();
		} catch (e: any) {
			console.error(e.message);
		}
	}

	async function handleDelete() {
		try {
			const res = await fetch(`/api/automacao/${automacao.id}?providerAccountId=${providerAccountId}`, {
				method: "DELETE",
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Falha ao excluir automação");
			}
			setOpenDelete(false);
			fetchData();
		} catch (e: any) {
			console.error(e.message);
		}
	}

	return (
		<>
			{/* DropdownMenu CONTROLADO */}
			<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="icon" className="p-1 border-border hover:bg-accent">
						<ChevronDown className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" className="w-44 bg-popover border-border">
					<DropdownMenuItem
						onSelect={(e) => {
							e.preventDefault();
							handleOpenRename();
						}}
						className="hover:bg-accent text-popover-foreground"
					>
						<Edit className="mr-2 h-4 w-4" />
						Renomear
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={(e) => {
							e.preventDefault();
							handleOpenDuplicate();
						}}
						className="hover:bg-accent text-popover-foreground"
					>
						<Copy className="mr-2 h-4 w-4" />
						Duplicar
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={(e) => {
							e.preventDefault();
							handleOpenMove();
						}}
						className="hover:bg-accent text-popover-foreground"
					>
						<FolderPlus className="mr-2 h-4 w-4" />
						Mover para
					</DropdownMenuItem>
					<DropdownMenuSeparator className="bg-border" />
					<DropdownMenuItem
						className="text-destructive hover:bg-accent"
						onSelect={(e) => {
							e.preventDefault();
							handleOpenDelete();
						}}
					>
						<Trash className="mr-2 h-4 w-4" />
						Apagar
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* DIÁLOGOS FORA DO MENU */}

			{/* RENOMEAR */}
			<Dialog open={openRename} onOpenChange={setOpenRename}>
				<DialogContent className="sm:max-w-[425px] bg-background border-border">
					<DialogHeader>
						<DialogTitle className="text-foreground">Renomear automação</DialogTitle>
						<DialogDescription className="text-muted-foreground">Informe um novo nome.</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid grid-cols-4 items-center gap-4">
							<Label htmlFor="nomeAutomacao" className="text-right text-foreground">
								Novo Nome
							</Label>
							<Input
								id="nomeAutomacao"
								className="col-span-3 border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring"
								value={renameValue}
								onChange={(e) => setRenameValue(e.target.value)}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setOpenRename(false)} className="border-border hover:bg-accent">
							Cancelar
						</Button>
						<Button onClick={handleRename}>Renomear</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* DUPLICAR */}
			<Dialog open={openDuplicate} onOpenChange={setOpenDuplicate}>
				<DialogContent className="sm:max-w-[425px] bg-background border-border">
					<DialogHeader>
						<DialogTitle className="text-foreground">Duplicar automação</DialogTitle>
						<DialogDescription className="text-muted-foreground">Tem certeza?</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setOpenDuplicate(false)} className="border-border hover:bg-accent">
							Cancelar
						</Button>
						<Button onClick={handleDuplicate}>Duplicar</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* MOVER PARA */}
			<Dialog open={openMove} onOpenChange={setOpenMove}>
				<DialogContent className="sm:max-w-[425px] bg-background border-border">
					<DialogHeader>
						<DialogTitle className="text-foreground">Mover automação</DialogTitle>
						<DialogDescription className="text-muted-foreground">
							Selecione a pasta de destino ou mova para a raiz.
						</DialogDescription>
					</DialogHeader>
					<div className="py-4">
						<Label className="text-foreground">Pasta:</Label>
						<Select onValueChange={(val) => setSelectedFolderId(val)}>
							<SelectTrigger className="mt-2 w-full border-border bg-background text-foreground">
								<SelectValue placeholder="Selecione uma pasta ou Raiz" />
							</SelectTrigger>
							<SelectContent className="bg-popover border-border">
								{/* Opção para mover para a Raiz */}
								<SelectItem key="root" value="root" className="text-popover-foreground hover:bg-accent">
									Raiz
								</SelectItem>
								{pastas.length > 0 && <DropdownMenuSeparator className="bg-border" />}
								{/* Lista de pastas existentes */}
								{pastas.map((p) => (
									<SelectItem key={p.id} value={p.id} className="text-popover-foreground hover:bg-accent">
										{p.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setOpenMove(false)} className="border-border hover:bg-accent">
							Cancelar
						</Button>
						<Button onClick={handleMove} disabled={!selectedFolderId}>
							Confirmar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* APAGAR */}
			<Dialog open={openDelete} onOpenChange={setOpenDelete}>
				<DialogContent className="sm:max-w-[425px] bg-background border-border">
					<DialogHeader>
						<DialogTitle className="text-foreground">Apagar automação</DialogTitle>
						<DialogDescription className="text-muted-foreground">Isso não poderá ser desfeito.</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setOpenDelete(false)} className="border-border hover:bg-accent">
							Cancelar
						</Button>
						<Button variant="destructive" onClick={handleDelete}>
							Apagar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
