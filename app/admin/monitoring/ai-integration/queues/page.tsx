import { auth } from "@/auth";
import { redirect } from "next/navigation";
import QueueManagementDashboard from "./components/QueueManagementDashboard";

export default async function AIQueueManagementPage() {
  const session = await auth();
  
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    redirect("/denied");
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          AI Queue Management
        </h1>
        <p className="text-gray-600 mt-2">
          Monitor and manage AI processing queues, DLQ, and job inspection
        </p>
      </div>
      
      <QueueManagementDashboard />
    </div>
  );
}