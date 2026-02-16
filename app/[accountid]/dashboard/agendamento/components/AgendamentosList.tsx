// components/agendamento/AgendamentosList.tsx
"use client";

import type React from "react";
import { useMemo } from "react";
import AgendamentoItem from "./AgendamentoItem";
import type { Agendamento } from "@/types/agendamento";

interface AgendamentosListProps {
	agendamentos: Agendamento[]; // Usa a interface completa
	refetch: () => void;
	accountid: string;
}

const AgendamentosList: React.FC<AgendamentosListProps> = ({ agendamentos, refetch, accountid }) => {
	// Agrupa os agendamentos pelo AgendamentoID
	const agendamentosAgrupados = useMemo(() => {
		const grupos: Record<string, Agendamento[]> = {};

		// Primeiro, agrupa todos os agendamentos pelo AgendamentoID
		agendamentos.forEach((agendamento) => {
			const agendamentoID = agendamento.id;

			if (!grupos[agendamentoID]) {
				grupos[agendamentoID] = [];
			}

			grupos[agendamentoID].push(agendamento);
		});

		// Depois, para cada grupo, seleciona o primeiro agendamento como representante
		// Se for um grupo de mídias individuais, adiciona informações sobre o grupo
		return Object.entries(grupos).map(([agendamentoID, grupo]) => {
			const representante = grupo[0];

			// Se for um grupo com mais de um item, adiciona informações sobre o grupo
			if (grupo.length > 1) {
				return {
					...representante,
					isGrupo: true,
					totalNoGrupo: grupo.length,
					idsNoGrupo: grupo.map((item) => item.id),
				};
			}

			return representante;
		});
	}, [agendamentos]);

	return (
		<div className="bg-background">
			<ul className="space-y-4">
				{agendamentosAgrupados.map((agendamento) => (
					<AgendamentoItem
						key={agendamento.id}
						agendamento={agendamento}
						onExcluir={() => {}}
						refetch={refetch}
						accountid={accountid}
					/>
				))}
			</ul>
		</div>
	);
};

export default AgendamentosList;
