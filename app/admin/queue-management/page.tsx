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
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Gerenciamento de Filas
        </h1>
        <p className="text-gray-600 mt-2">
          Dashboard para monitoramento e gerenciamento de filas BullMQ
        </p>
      </div>
      
      <QueueDashboard />
    </div>
  );
}