// components/AgendamentosTable.tsx

"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Paper,
	Button,
	Typography,
	CircularProgress,
	Alert,
} from "@mui/material";

interface Agendamento {
	id: number;
	userID: string;
	Data: string;
	Descrição: string;
	status: string;
	// Outros campos conforme necessário
}

const AgendamentosTable = () => {
	const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string>("");

	useEffect(() => {
		const fetchAgendamentos = async () => {
			try {
				const response = await axios.get("/api/admin/agendamentos");
				setAgendamentos(response.data.agendamentos);
			} catch (err: any) {
				setError("Erro ao carregar agendamentos.");
				console.error(err);
			} finally {
				setLoading(false);
			}
		};

		fetchAgendamentos();
	}, []);

	const handleDelete = async (id: number | string) => {
		if (!confirm("Tem certeza que deseja excluir este agendamento?")) return;

		try {
			await axios.delete(`/api/admin/agendamentos/${id}`);
			setAgendamentos(agendamentos.filter((ag) => ag.id !== id));
		} catch (err: any) {
			setError("Erro ao excluir agendamento.");
			console.error(err);
		}
	};

	if (loading) return <CircularProgress />;

	if (error) return <Alert severity="error">{error}</Alert>;

	return (
		<TableContainer component={Paper}>
			<Typography variant="h6" component="div" style={{ padding: "16px" }}>
				Lista de Agendamentos
			</Typography>
			<Table>
				<TableHead>
					<TableRow>
						<TableCell>ID</TableCell>
						<TableCell>User ID</TableCell>
						<TableCell>Data</TableCell>
						<TableCell>Descrição</TableCell>
						<TableCell>Status</TableCell>
						<TableCell>Ações</TableCell>
					</TableRow>
				</TableHead>
				<TableBody>
					{agendamentos.map((agendamento) => (
						<TableRow key={agendamento.id}>
							<TableCell>{agendamento.id}</TableCell>
							<TableCell>{agendamento.userID}</TableCell>
							<TableCell>{new Date(agendamento.Data).toLocaleString()}</TableCell>
							<TableCell>{agendamento.Descrição}</TableCell>
							<TableCell>{agendamento.status}</TableCell>
							<TableCell>
								<Button variant="contained" color="secondary" onClick={() => handleDelete(agendamento.id)}>
									Excluir
								</Button>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</TableContainer>
	);
};

export default AgendamentosTable;
