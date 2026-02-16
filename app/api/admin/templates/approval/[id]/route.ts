// app/api/admin/templates/approval/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { TemplateStatus } from "@prisma/client";

/**
 * PUT - Processa uma solicitação de aprovação (aprovar/rejeitar)
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		// Verificar se o usuário tem permissão para aprovar templates
		if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
			return NextResponse.json({ error: "Sem permissão para processar aprovações" }, { status: 403 });
		}

		const { id } = await params;
		const body = await request.json();
		const { action, responseMessage } = body; // action: 'approve' | 'reject'

		if (!id) {
			return NextResponse.json({ error: "ID da solicitação é obrigatório" }, { status: 400 });
		}

		if (!action || !["approve", "reject"].includes(action)) {
			return NextResponse.json({ error: 'Ação deve ser "approve" ou "reject"' }, { status: 400 });
		}

		// Buscar solicitação de aprovação
		const approvalRequest = await getPrismaInstance().templateApprovalRequest.findUnique({
			where: { id },
			include: {
				template: true,
			},
		});

		if (!approvalRequest) {
			return NextResponse.json({ error: "Solicitação de aprovação não encontrada" }, { status: 404 });
		}

		if (approvalRequest.status !== "pending") {
			return NextResponse.json({ error: "Esta solicitação já foi processada" }, { status: 409 });
		}

		// Processar aprovação em transação
		const result = await getPrismaInstance().$transaction(async (tx) => {
			// Atualizar solicitação de aprovação
			const updatedRequest = await tx.templateApprovalRequest.update({
				where: { id },
				data: {
					status: action === "approve" ? "approved" : "rejected",
					responseMessage,
					processedById: session.user.id,
					processedAt: new Date(),
				},
				include: {
					template: {
						select: {
							id: true,
							name: true,
							type: true,
							description: true,
						},
					},
					requestedBy: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
					processedBy: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
				},
			});

			// Atualizar status do template se aprovado
			if (action === "approve") {
				await tx.template.update({
					where: { id: approvalRequest.templateId },
					data: {
						status: TemplateStatus.APPROVED,
						isActive: true,
					},
				});
			} else {
				await tx.template.update({
					where: { id: approvalRequest.templateId },
					data: {
						status: TemplateStatus.REJECTED,
						isActive: false,
					},
				});
			}

			return updatedRequest;
		});

		console.log(`[Template Approval API] Solicitação processada: ${id} - ${action}`);

		return NextResponse.json({
			message: `Template ${action === "approve" ? "aprovado" : "rejeitado"} com sucesso`,
			approvalRequest: result,
		});
	} catch (error) {
		console.error("[Template Approval API] Erro ao processar aprovação:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}

/**
 * GET - Busca detalhes de uma solicitação de aprovação
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
		}

		const { id } = await params;

		if (!id) {
			return NextResponse.json({ error: "ID da solicitação é obrigatório" }, { status: 400 });
		}

		// Buscar solicitação com todos os dados
		const approvalRequest = await getPrismaInstance().templateApprovalRequest.findUnique({
			where: { id },
			include: {
				template: {
					include: {
						createdBy: {
							select: { id: true, name: true, email: true },
						},
						inbox: {
							select: { id: true, nome: true, inboxId: true },
						},
						interactiveContent: {
							include: {
								header: true,
								body: true,
								footer: true,
								actionCtaUrl: true,
								actionReplyButton: true,
								actionList: true,
								actionFlow: true,
								actionLocationRequest: true,
							},
						},
						whatsappOfficialInfo: true,
					},
				},
				requestedBy: {
					select: {
						id: true,
						name: true,
						email: true,
					},
				},
				processedBy: {
					select: {
						id: true,
						name: true,
						email: true,
					},
				},
			},
		});

		if (!approvalRequest) {
			return NextResponse.json({ error: "Solicitação de aprovação não encontrada" }, { status: 404 });
		}

		// Verificar permissões
		const canView =
			session.user.role === "ADMIN" ||
			session.user.role === "SUPERADMIN" ||
			approvalRequest.requestedById === session.user.id;

		if (!canView) {
			return NextResponse.json({ error: "Sem permissão para visualizar esta solicitação" }, { status: 403 });
		}

		return NextResponse.json({
			...approvalRequest,
			permissions: {
				canProcess: session.user.role === "ADMIN" || session.user.role === "SUPERADMIN",
				canView: true,
			},
		});
	} catch (error) {
		console.error("[Template Approval API] Erro ao buscar solicitação:", error);
		return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
	}
}
