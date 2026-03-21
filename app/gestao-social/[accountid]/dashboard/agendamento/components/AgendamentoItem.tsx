"use client";

import type React from "react";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import EditAgendamentoDialog from "./EditAgendamentoDialog";
import axios from "axios";
import { toast } from "sonner";
import type { Agendamento } from "@/types/agendamento";
import { Badge } from "@/components/ui/badge";

// Estende o tipo Agendamento para incluir informações de grupo
interface AgendamentoExtendido extends Agendamento {
	isGrupo?: boolean;
	totalNoGrupo?: number;
	idsNoGrupo?: string[];
}

interface AgendamentoItemProps {
	agendamento: AgendamentoExtendido;
	onExcluir: (id: string) => void;
	refetch: () => void;
	accountid: string;
}

const AgendamentoItem: React.FC<AgendamentoItemProps> = ({ agendamento, onExcluir, refetch, accountid }) => {
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	// Função para deletar agendamento
	const handleExcluir = async () => {
		if (!agendamento.id) {
			toast("Erro", { description: "ID do agendamento não fornecido." });
			return;
		}

		setIsDeleting(true);

		try {
			// Se for um grupo, exclui todos os agendamentos do grupo
			if (agendamento.isGrupo && agendamento.idsNoGrupo) {
				// Exclui todos os agendamentos do grupo
				await Promise.all(agendamento.idsNoGrupo.map((id) => axios.delete(`/api/${accountid}/agendar/delete/${id}`)));

				toast("Grupo de Agendamentos Excluído", {
					description: `Foram excluídos ${agendamento.totalNoGrupo} agendamentos com sucesso.`,
				});
				refetch();
			} else {
				// Exclui um único agendamento
				const response = await axios.delete(`/api/${accountid}/agendar/delete/${agendamento.id}`);

				if (response.status === 200) {
					toast("Agendamento Excluído", { description: "Seu agendamento foi excluído com sucesso." });
					refetch();
				} else {
					throw new Error("Erro ao excluir agendamento");
				}
			}
		} catch (error: any) {
			console.error("Erro ao excluir agendamento:", error);
			toast("Erro ao Excluir", {
				description: error.response?.data?.error || "Ocorreu um erro ao excluir o agendamento.",
			});
		} finally {
			setIsDeleting(false);
		}
	};

	// Determina o título do agendamento
	const getTitulo = () => {
		if (agendamento.isGrupo) {
			return `Grupo de ${agendamento.totalNoGrupo} postagens`;
		}
		return "Agendamento";
	};

	return (
		<li className="p-4 border border-border rounded-md shadow-sm bg-card">
			<div className="flex justify-between items-start">
				<div>
					<div className="flex items-center gap-2">
						<p className="text-lg font-medium text-card-foreground">{getTitulo()}</p>
						{agendamento.isGrupo && (
							<Badge
								variant="outline"
								className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-border"
							>
								Grupo
							</Badge>
						)}
						{agendamento.Diario && (
							<Badge
								variant="outline"
								className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-border"
							>
								Diário
							</Badge>
						)}
						{agendamento.Randomizar && (
							<Badge
								variant="outline"
								className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-border"
							>
								Aleatório
							</Badge>
						)}
					</div>
					<p className="text-muted-foreground">
						{format(new Date(agendamento.Data), "PPP", { locale: ptBR })} às{" "}
						{format(new Date(agendamento.Data), "HH:mm")}
					</p>
					<p className="text-muted-foreground mt-1">{agendamento.Descricao}</p>

					{agendamento.isGrupo && (
						<p className="text-sm text-muted-foreground mt-2">
							Este grupo contém {agendamento.totalNoGrupo} postagens que serão publicadas{" "}
							{agendamento.Diario ? "diariamente" : ""}
							{agendamento.Diario && agendamento.Randomizar ? ", " : ""}
							{agendamento.Randomizar ? "aleatoriamente" : ""}.
						</p>
					)}
				</div>

				<div className="flex space-x-2">
					<Button variant="outline" onClick={() => setIsEditOpen(true)} className="border-border hover:bg-accent">
						Editar
					</Button>
					<Button variant="destructive" onClick={handleExcluir} disabled={isDeleting}>
						{isDeleting ? "Excluindo..." : "Excluir"}
					</Button>
				</div>
			</div>

			{isEditOpen && (
				<EditAgendamentoDialog
					agendamento={agendamento}
					isOpen={isEditOpen}
					onClose={() => setIsEditOpen(false)}
					refetch={refetch}
					accountid={accountid}
				/>
			)}
		</li>
	);
};

export default AgendamentoItem;
