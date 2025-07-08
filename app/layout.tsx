// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import ErrorBoundary from "@/components/providers/error-boundary";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";


// 👇 import do TooltipProvider
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ChatWit Social - Gerenciamento de Redes Sociais",
  description: "Plataforma para gerenciamento e automação de redes sociais",
  icons: {
    icon: [
      {
        url: "/W.svg",
        href: "/W.svg",
      },
    ],
  },
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
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              {/* 👇 Envolvendo a árvore de componentes com TooltipProvider */}
              <TooltipProvider>
                <div className="min-h-screen w-full bg-background">
                  {children}
                </div>
              </TooltipProvider>
            </ThemeProvider>
          </SessionProvider>
        </ErrorBoundary>
        <Toaster />
      </body>
    </html>
  );
}

