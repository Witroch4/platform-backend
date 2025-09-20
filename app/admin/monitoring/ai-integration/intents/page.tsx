import { auth } from "@/auth";
import { redirect } from "next/navigation";
import IntentManagementDashboard from "./components/IntentManagementDashboard";

export default async function IntentManagementPage() {
  const session = await auth();
  
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    redirect("/denied");
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Intent Management
        </h1>
        <p className="text-gray-600 mt-2">
          Configure AI intents for message classification and response generation
        </p>
      </div>
      
      <IntentManagementDashboard />
    </div>
  );
}