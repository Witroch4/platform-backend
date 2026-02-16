import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AuditLogsViewer from "./components/AuditLogsViewer";

export default async function AuditLogsPage() {
	const session = await auth();

	// Verificação adicional de segurança
	if (!session?.user || session.user.role !== "SUPERADMIN") {
		redirect("/denied");
	}

	return (
		<div className="container mx-auto p-6">
			<div className="mb-6">
				<h1 className="text-3xl font-bold text-gray-900">Logs de Auditoria</h1>
				<p className="text-gray-600 mt-2">Histórico de todas as ações realizadas no sistema de filas</p>
			</div>

			<AuditLogsViewer />
		</div>
	);
}
