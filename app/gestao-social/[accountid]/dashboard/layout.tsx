"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { GestaoSocialSidebar } from "@/components/gestao-social-sidebar";
import Navbar from "@/components/navbar";
import ErrorBoundary from "@/components/providers/error-boundary";

export default function GestaoSocialDashboardLayout({ children }: { children: React.ReactNode }) {
	const { data: session, status } = useSession();
	const router = useRouter();
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (status === "loading") return;

		if (!session?.user) {
			toast.error("Acesso negado", { description: "Você precisa estar logado." });
			router.push("/auth/login");
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

	return (
		<ErrorBoundary>
			<SidebarProvider>
				<GestaoSocialSidebar />
				<SidebarInset className="flex flex-col min-h-screen bg-background">
					<Navbar />
					<main className="flex-1 overflow-y-auto bg-background p-4 md:p-6">
						{children}
					</main>
				</SidebarInset>
			</SidebarProvider>
		</ErrorBoundary>
	);
}
