import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { 
  Activity, 
  FileText, 
  LayoutDashboard,
  Shield
} from "lucide-react";

interface QueueManagementLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  {
    name: "Dashboard",
    href: "/admin/queue-management",
    icon: LayoutDashboard,
  },
  {
    name: "Logs de Auditoria",
    href: "/admin/queue-management/audit-logs",
    icon: FileText,
  },
  {
    name: "Monitoramento de Produção",
    href: "/admin/queue-management/production-monitoring",
    icon: Shield,
  },
];

export default async function QueueManagementLayout({
  children,
}: QueueManagementLayoutProps) {
  const session = await auth();
  
  // Verificação de segurança no layout
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    redirect("/denied");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Activity className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Sistema de Filas BullMQ
                </h1>
                <p className="text-sm text-gray-500">
                  Painel de controle para SUPERADMIN
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Logado como: {session.user.name || session.user.email}
              </span>
              <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                SUPERADMIN
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        <div className="flex gap-6">
          {/* Sidebar Navigation */}
          <div className="w-64 flex-shrink-0">
            <nav className="space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      "hover:bg-gray-100 hover:text-gray-900",
                      "text-gray-600"
                    )}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}