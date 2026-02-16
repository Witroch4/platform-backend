// app/[accountid]/dashboard/layout.tsx

import type React from "react";
import type { Metadata } from "next";
import DashboardLayoutClient from "@/components/dashboard-layout-client";
import ErrorBoundary from "@/components/providers/error-boundary";

export const metadata: Metadata = {
	title: "Dashboard da Conta",
	description: "Gerencie suas redes sociais",
};

export default function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<ErrorBoundary>
			<DashboardLayoutClient>{children}</DashboardLayoutClient>
		</ErrorBoundary>
	);
}
