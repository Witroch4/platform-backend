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
        <h1 className="text-3xl font-bold text-gray-900">
          AI Integration Management
        </h1>
        <p className="text-gray-600 mt-2">
          Manage AI integration components including intents and queue monitoring
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Intent Management</h2>
          <p className="text-gray-600 mb-4">
            Configure and manage AI intents for message classification
          </p>
          <a 
            href="/admin/ai-integration/intents"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Manage Intents
          </a>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Queue Management</h2>
          <p className="text-gray-600 mb-4">
            Monitor and manage AI processing queues
          </p>
          <a 
            href="/admin/ai-integration/queues"
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Manage Queues
          </a>
        </div>
      </div>
    </div>
  );
}