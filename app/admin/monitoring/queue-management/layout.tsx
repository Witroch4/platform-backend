import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Activity, FileText, LayoutDashboard, Shield, ChevronRight } from "lucide-react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface QueueManagementLayoutProps {
	children: React.ReactNode;
}

const navigation = [
	{
		name: "Dashboard",
		href: "/admin/monitoring/queue-management",
		icon: LayoutDashboard,
	},
	{
		name: "Logs de Auditoria",
		href: "/admin/monitoring/queue-management/audit-logs",
		icon: FileText,
	},
	{
		name: "Monitoramento de Produção",
		href: "/admin/monitoring/queue-management/production-monitoring",
		icon: Shield,
	},
];

export default async function QueueManagementLayout({ children }: QueueManagementLayoutProps) {
	const session = await auth();

	// Verificação de segurança no layout
	if (!session?.user || session.user.role !== "SUPERADMIN") {
		redirect("/denied");
	}

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<div className="bg-card shadow-sm border-b border-border">
				<div className="container mx-auto px-6 py-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center space-x-4">
							<Activity className="h-8 w-8 text-primary" />
							<div>
								<h1 className="text-xl font-semibold text-foreground">Sistema de Filas BullMQ</h1>
								<p className="text-sm text-muted-foreground">Painel de controle para SUPERADMIN</p>
							</div>
						</div>
						<div className="flex items-center space-x-4">
							<span className="text-sm text-muted-foreground">
								Logado como: {session.user.name || session.user.email}
							</span>
							<span className="px-2 py-1 bg-destructive/10 text-destructive text-xs font-medium rounded-full border border-destructive/20">
								SUPERADMIN
							</span>
						</div>
					</div>
				</div>
			</div>

			<div className="container mx-auto px-6 py-6">
				{/* Breadcrumbs */}
				<div className="mb-6">
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink href="/admin">Admin</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator>
								<ChevronRight className="h-4 w-4" />
							</BreadcrumbSeparator>
							<BreadcrumbItem>
								<BreadcrumbLink href="/admin/monitoring">Monitoramento</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator>
								<ChevronRight className="h-4 w-4" />
							</BreadcrumbSeparator>
							<BreadcrumbItem>
								<BreadcrumbPage>Filas</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</div>

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
											"hover:bg-muted hover:text-foreground",
											"text-muted-foreground",
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
					<div className="flex-1">{children}</div>
				</div>
			</div>
		</div>
	);
}
