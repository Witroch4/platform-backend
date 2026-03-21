"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import NavbarAdmin from "@/components/admin/navbar-admin";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminLoadingIndicator } from "./components/AdminLoadingIndicator";

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
	const { data: session, status } = useSession();
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [authorized, setAuthorized] = useState(false);

	useEffect(() => {
		if (status === "loading") return;

		if (!session?.user) {
			toast.error("Acesso negado", { description: "Você precisa estar logado." });
			router.push("/auth/login");
			return;
		}

		if (session.user.role === "SUPERADMIN") {
			setAuthorized(true);
		} else {
			toast.error("Acesso negado", { description: "Área restrita a SUPERADMIN." });
			router.push("/hub");
			return;
		}

		setLoading(false);
	}, [session, status, router]);

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-background">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
			</div>
		);
	}

	if (!authorized) return null;

	return (
		<SidebarProvider>
			<AdminSidebar />
			<SidebarInset className="flex flex-col min-h-screen bg-background">
				<NavbarAdmin />
				<main className="flex-1 overflow-y-auto bg-background p-4 md:p-6 relative">
					<AdminLoadingIndicator />
					{children}
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
};

export default AdminLayout;
