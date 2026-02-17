"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileJson, Import, Loader2 } from "lucide-react";

interface ImportConfirmationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isImporting: boolean;
	stats?: { messages: number; reactions: number };
}

export function ImportConfirmationDialog({
	open,
	onOpenChange,
	onConfirm,
	isImporting,
	stats,
}: ImportConfirmationDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2">
						<FileJson className="h-5 w-5 text-blue-500" />
						Importar reações existentes
					</AlertDialogTitle>
					<AlertDialogDescription className="space-y-2">
						<p>
							Foram encontradas <strong>{stats?.messages ?? 0} mensagens interativas</strong> e{" "}
							<strong>{stats?.reactions ?? 0} reações de botões</strong> configuradas nesta caixa.
						</p>
						<p>
							O sistema irá criar automaticamente os nós e conexões no Flow Builder com base nessas configurações
							existentes.
						</p>
						<p className="text-sm text-muted-foreground">
							Após importar, você poderá reorganizar visualmente o fluxo usando o botão "Organizar".
						</p>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isImporting}>Cancelar</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} disabled={isImporting} className="bg-blue-600 hover:bg-blue-700">
						{isImporting ? (
							<>
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								Importando...
							</>
						) : (
							<>
								<Import className="h-4 w-4 mr-2" />
								Importar
							</>
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export default ImportConfirmationDialog;
