import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function AIIntegrationPage() {
	const session = await auth();

	if (!session?.user || session.user.role !== "SUPERADMIN") {
		redirect("/denied");
	}

	return (
		<div className="container mx-auto p-6">
			<div className="mb-6">
				<h1 className="text-3xl font-bold text-gray-900">AI Integration Management</h1>
				<p className="text-gray-600 mt-2">Manage AI integration components including intents and queue monitoring</p>
			</div>

			{/* [CLEANUP 2026-02-16] Queue Management removido - eram código morto */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div className="bg-white dark:bg-card rounded-lg shadow p-6">
					<h2 className="text-xl font-semibold mb-4">Gestão de Intents</h2>
					<p className="text-muted-foreground mb-4">Configure e gerencie intents de IA para classificação de mensagens</p>
					<a
						href="/admin/monitoring/ai-integration/intents"
						className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
					>
						Gerenciar Intents
					</a>
				</div>

				<div className="bg-white dark:bg-card rounded-lg shadow p-6">
					<h2 className="text-xl font-semibold mb-4">Filas do Sistema</h2>
					<p className="text-muted-foreground mb-4">Para monitorar filas, use o Queue Management geral</p>
					<a
						href="/admin/monitoring/queue-management"
						className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
					>
						Ir para Queue Management
					</a>
				</div>
			</div>
		</div>
	);
}
