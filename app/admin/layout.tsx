"use client";

import type React from "react";
import { useEffect, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import NavbarAdmin from "@/components/admin/navbar-admin";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import AppAdminDashboard from "@/components/app-admin-dashboard";
import { SwrProvider } from "@/app/admin/mtf-diamante/context/SwrProvider";
import { AdminLoadingIndicator } from "./components/AdminLoadingIndicator";

interface AdminLayoutProps {
	children: React.ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
	const { data: session, status } = useSession();
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [isAdmin, setIsAdmin] = useState(false);

	useEffect(() => {
		const checkAdminAccess = async () => {
			if (status === "loading") return;

			if (!session?.user) {
				toast.error("Acesso negado", {
					description: "Você precisa estar logado para acessar esta página",
				});
				router.push("/auth/login");
				return;
			}

			try {
				const userRole = session.user.role;
				if (userRole === "ADMIN" || userRole === "SUPERADMIN") {
					setIsAdmin(true);
				} else {
					toast.error("Acesso negado", {
						description: "Você não tem permissão para acessar esta área.",
					});
					router.push("/");
					return;
				}
			} catch (error) {
				console.error("Erro ao verificar acesso de administrador:", error);
				toast.error("Erro", {
					description: "Erro ao verificar permissões. Tente novamente mais tarde.",
				});
				router.push("/");
			} finally {
				setLoading(false);
			}
		};

		checkAdminAccess();
	}, [session, status, router]);

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-background">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
			</div>
		);
	}

	if (!isAdmin) return null;

	return (
		<SidebarProvider>
			<SwrProvider>
				<AppAdminDashboard />
				<SidebarInset className="flex flex-col min-h-screen bg-background">
					<NavbarAdmin />
					<main className="flex-1 overflow-y-auto bg-background p-4 md:p-6 relative">
						<AdminLoadingIndicator />
						{children}
					</main>
				</SidebarInset>
			</SwrProvider>
		</SidebarProvider>
	);
};

export default AdminLayout;
