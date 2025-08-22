"use client";

import { Toaster } from "sonner";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { MtfDataProvider } from "@/app/admin/mtf-diamante/context/MtfDataProvider";

export default function IframeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <MtfDataProvider>
          <div className="h-full bg-background">
            {children}
          </div>
          <Toaster richColors position="top-right" />
        </MtfDataProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}