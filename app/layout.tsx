// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { ReactQueryProvider } from "@/components/providers/react-query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { SWRProvider } from "@/components/providers/SwrProvider";
import ErrorBoundary from "@/components/providers/error-boundary";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

// 👇 import do TooltipProvider
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "Socialwise - Gerenciamento de Redes Sociais",
	description: "Plataforma para gerenciamento e automação de redes sociais",
	icons: {
		icon: [
			{
				url: "/assets/favicon/favicon.ico",
				type: "image/x-icon",
			},
			{
				url: "/assets/favicon/favicon-16x16.png",
				sizes: "16x16",
				type: "image/png",
			},
			{
				url: "/assets/favicon/favicon-32x32.png",
				sizes: "32x32",
				type: "image/png",
			},
			{
				url: "/assets/favicon/favicon-96x96.png",
				sizes: "96x96",
				type: "image/png",
			},
		],
		apple: [
			{
				url: "/assets/favicon/apple-icon-57x57.png",
				sizes: "57x57",
				type: "image/png",
			},
			{
				url: "/assets/favicon/apple-icon-60x60.png",
				sizes: "60x60",
				type: "image/png",
			},
			{
				url: "/assets/favicon/apple-icon-72x72.png",
				sizes: "72x72",
				type: "image/png",
			},
			{
				url: "/assets/favicon/apple-icon-76x76.png",
				sizes: "76x76",
				type: "image/png",
			},
			{
				url: "/assets/favicon/apple-icon-114x114.png",
				sizes: "114x114",
				type: "image/png",
			},
			{
				url: "/assets/favicon/apple-icon-120x120.png",
				sizes: "120x120",
				type: "image/png",
			},
			{
				url: "/assets/favicon/apple-icon-144x144.png",
				sizes: "144x144",
				type: "image/png",
			},
			{
				url: "/assets/favicon/apple-icon-152x152.png",
				sizes: "152x152",
				type: "image/png",
			},
			{
				url: "/assets/favicon/apple-icon-180x180.png",
				sizes: "180x180",
				type: "image/png",
			},
		],
		other: [
			{
				rel: "icon",
				url: "/assets/favicon/android-icon-192x192.png",
				sizes: "192x192",
				type: "image/png",
			},
			{
				rel: "icon",
				url: "/assets/favicon/favicon-512x512.png",
				sizes: "512x512",
				type: "image/png",
			},
		],
	},
	manifest: "/assets/favicon/manifest.json",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="pt-BR" suppressHydrationWarning>
			<body className={cn(inter.className, "min-h-screen bg-background")}>
				<ErrorBoundary>
					<SessionProvider>
						<ReactQueryProvider>
							<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
								{/* 👇 SWR Provider para otimização global */}
								<SWRProvider>
									{/* 👇 Envolvendo a árvore de componentes com TooltipProvider */}
									<TooltipProvider>
										<div className="min-h-screen w-full bg-background">{children}</div>
									</TooltipProvider>
								</SWRProvider>
							</ThemeProvider>
						</ReactQueryProvider>
					</SessionProvider>
				</ErrorBoundary>
				<Toaster />
			</body>
		</html>
	);
}
