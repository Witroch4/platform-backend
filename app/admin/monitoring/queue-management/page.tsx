import { auth } from "@/auth";
import { redirect } from "next/navigation";
import QueueDashboard from "./components/QueueDashboard";

export default async function QueueManagementPage() {
	const session = await auth();

	// Verificação adicional de segurança
	if (!session?.user || session.user.role !== "SUPERADMIN") {
		redirect("/denied");
	}

	return (
		<div className="space-y-6">
			<QueueDashboard />
		</div>
	);
}
