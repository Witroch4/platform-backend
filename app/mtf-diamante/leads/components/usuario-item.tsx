"use client";

import { useState } from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { MoreVertical, Trash, FileText, Users, FilePlus, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface UsuarioItemProps {
	usuario: {
		id: string;
		name: string;
		accountName: string;
		channel: string;
		leadsCount: number;
		createdAt: string;
	};
	onDelete: (id: string) => void;
	onViewLeads: (usuarioId: string) => void;
	onUnificarArquivos: (usuarioId: string) => void;
	isLoading: boolean;
}

export function UsuarioItem({ usuario, onDelete, onViewLeads, onUnificarArquivos, isLoading }: UsuarioItemProps) {
	const [confirmDelete, setConfirmDelete] = useState(false);

	const formattedDate = format(new Date(usuario.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR });

	const handleDelete = () => {
		setConfirmDelete(false);
		onDelete(usuario.id);
	};

	return (
		<>
			<TableRow className="border-border hover:bg-muted/50">
				<TableCell className="text-card-foreground">{usuario.name}</TableCell>
				<TableCell className="text-card-foreground">{usuario.accountName}</TableCell>
				<TableCell>
					<Badge variant="outline" className="border-border text-card-foreground">
						{usuario.channel}
					</Badge>
				</TableCell>
				<TableCell>
					<Badge className="bg-primary text-primary-foreground">{usuario.leadsCount}</Badge>
				</TableCell>
				<TableCell>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" className="h-8 w-8 p-0 hover:bg-accent">
								<span className="sr-only">Abrir menu</span>
								<MoreVertical className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="bg-popover border-border">
							<DropdownMenuLabel className="text-popover-foreground">Ações</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() => onViewLeads(usuario.id)}
								className="text-popover-foreground hover:bg-accent"
							>
								<Users className="mr-2 h-4 w-4" />
								Ver Leads
							</DropdownMenuItem>

							{usuario.leadsCount > 0 && (
								<DropdownMenuItem
									onClick={() => onUnificarArquivos(usuario.id)}
									disabled={isLoading}
									className="text-popover-foreground hover:bg-accent"
								>
									{isLoading ? (
										<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
									) : (
										<FilePlus className="mr-2 h-4 w-4" />
									)}
									Unificar Todos Arquivos
								</DropdownMenuItem>
							)}

							<DropdownMenuSeparator className="bg-border" />
							<DropdownMenuItem
								onClick={() => setConfirmDelete(true)}
								className="text-destructive hover:bg-destructive/10"
							>
								<Trash className="mr-2 h-4 w-4" />
								Excluir
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</TableCell>
			</TableRow>

			{/* Dialog de confirmação de exclusão */}
			<Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<DialogContent className="bg-background border-border">
					<DialogHeader>
						<DialogTitle className="text-foreground">Confirmar Exclusão</DialogTitle>
						<DialogDescription className="text-muted-foreground">
							Tem certeza que deseja excluir o usuário "{usuario.name}"? Esta ação não pode ser desfeita e todos os
							leads associados também serão removidos.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmDelete(false)} className="border-border hover:bg-accent">
							Cancelar
						</Button>
						<Button variant="destructive" onClick={handleDelete}>
							Excluir
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
