"use client";

import type React from "react";
import { SessionProvider } from "next-auth/react";
import NavbarGeral from "@/components/navbarGeral";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/providers/theme-provider";

interface RootLayoutClientProps {
	children: React.ReactNode;
}

export default function RootLayoutClient({ children }: RootLayoutClientProps) {
	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
			<SessionProvider>
				{/* NavbarGeral será renderizado condicionalmente dentro do próprio componente */}
				<NavbarGeral />
				{children}
				<Toaster />
			</SessionProvider>
		</ThemeProvider>
	);
}
