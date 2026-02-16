import { type NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { auth } from "@/auth";

/**
 * Handler para DELETE em /api/[accountid]/agendar/delete-grupo/[agendamentoID]
 * Exclui todos os agendamentos com o mesmo AgendamentoID.
 */
export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ accountid: string; agendamentoID: string }> },
): Promise<NextResponse> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
		}

		const { accountid, agendamentoID } = await params;
		if (!accountid || !agendamentoID) {
			return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
		}

		console.log(`[Agendar] Excluindo grupo de agendamentos com AgendamentoID: ${agendamentoID}`);

		const BASEROW_TOKEN = process.env.BASEROW_TOKEN;
		const BASEROW_TABLE_ID = process.env.BASEROW_TABLE_ID;
		if (!BASEROW_TOKEN || !BASEROW_TABLE_ID) {
			console.error("BASEROW_TOKEN ou BASEROW_TABLE_ID não definidos no .env.");
			return NextResponse.json({ error: "Configuração do servidor incorreta." }, { status: 500 });
		}

		// Primeiro, busca todos os agendamentos com o AgendamentoID especificado
		const urlBaserowSearch = `https://planilhatecnologicabd.witdev.com.br/api/database/rows/table/${BASEROW_TABLE_ID}/?user_field_names=true&filter__AgendamentoID__equal=${agendamentoID}`;

		console.log(`[Agendar] Buscando agendamentos com URL: ${urlBaserowSearch}`);

		try {
			const searchResponse = await axios.get(urlBaserowSearch, {
				headers: { Authorization: `Token ${BASEROW_TOKEN}` },
			});

			console.log(`[Agendar] Resposta da busca: ${searchResponse.status}`);

			if (!searchResponse.data || !searchResponse.data.results || searchResponse.data.results.length === 0) {
				console.log(`[Agendar] Nenhum agendamento encontrado com AgendamentoID: ${agendamentoID}`);
				return NextResponse.json({ error: "Nenhum agendamento encontrado com este ID de grupo." }, { status: 404 });
			}

			// Verifica se os agendamentos pertencem ao usuário
			const agendamentos = searchResponse.data.results;
			console.log(`[Agendar] Encontrados ${agendamentos.length} agendamentos com AgendamentoID: ${agendamentoID}`);

			const userAgendamentos = agendamentos.filter((ag: any) => ag.userID === session.user.id);

			console.log(`[Agendar] ${userAgendamentos.length} agendamentos pertencem ao usuário ${session.user.id}`);

			if (userAgendamentos.length === 0) {
				return NextResponse.json({ error: "Nenhum agendamento deste grupo pertence ao usuário." }, { status: 403 });
			}

			// Exclui cada agendamento do grupo
			const deletePromises = userAgendamentos.map(async (ag: any) => {
				try {
					const urlBaserowDelete = `https://planilhatecnologicabd.witdev.com.br/api/database/rows/table/${BASEROW_TABLE_ID}/${ag.id}/`;
					console.log(`[Agendar] Excluindo agendamento ${ag.id} com URL: ${urlBaserowDelete}`);

					const deleteResponse = await axios.delete(urlBaserowDelete, {
						headers: { Authorization: `Token ${BASEROW_TOKEN}` },
					});

					console.log(`[Agendar] Agendamento ${ag.id} excluído com sucesso: ${deleteResponse.status}`);
					return { id: ag.id, success: true };
				} catch (deleteError: any) {
					console.error(`[Agendar] Erro ao excluir agendamento ${ag.id}:`, deleteError.message);
					if (deleteError.response) {
						console.error(
							`[Agendar] Resposta de erro: ${deleteError.response.status} - ${JSON.stringify(deleteError.response.data)}`,
						);
					}
					return { id: ag.id, success: false, error: deleteError.message };
				}
			});

			const results = await Promise.allSettled(deletePromises);

			const successful = results.filter((r) => r.status === "fulfilled" && (r.value as any).success).length;
			const failed = results.filter((r) => r.status === "rejected" || !(r.value as any).success).length;

			console.log(`[Agendar] Resultados da exclusão: ${successful} sucesso, ${failed} falhas`);

			if (failed > 0) {
				return NextResponse.json(
					{
						message: `${successful} agendamentos excluídos com sucesso, ${failed} falhas.`,
						count: successful,
						errors: results
							.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !(r.value as any).success))
							.map((r) =>
								r.status === "rejected"
									? (r as PromiseRejectedResult).reason
									: (r as PromiseFulfilledResult<any>).value,
							),
					},
					{ status: 207 },
				); // Multi-Status
			}

			return NextResponse.json({
				message: `${successful} agendamentos excluídos com sucesso.`,
				count: successful,
			});
		} catch (searchError: any) {
			console.error(`[Agendar] Erro na busca de agendamentos:`, searchError.message);
			if (searchError.response) {
				console.error(
					`[Agendar] Resposta de erro: ${searchError.response.status} - ${JSON.stringify(searchError.response.data)}`,
				);
			}
			return NextResponse.json({ error: "Erro ao buscar agendamentos", details: searchError.message }, { status: 500 });
		}
	} catch (error: any) {
		console.error("[Agendar] Erro ao excluir grupo de agendamentos:", error);
		return NextResponse.json(
			{ error: "Erro ao excluir grupo de agendamentos", details: error.message },
			{ status: 500 },
		);
	}
}
