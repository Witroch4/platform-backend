"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import ConditionalSidebar from "@/components/conditional-sidebar";
import Navbar from "@/components/navbar";
import { SidebarSkeleton } from "@/components/ui/sidebar-skeleton";
import { NavbarSkeleton } from "@/components/ui/navbar-skeleton";
import { useSession } from "next-auth/react";

interface DashboardLayoutClientProps {
  children: React.ReactNode;
}

export default function DashboardLayoutClient({ children }: DashboardLayoutClientProps) {
  const { status } = useSession();
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Garante que o componente está montado no cliente
  useEffect(() => {
    setIsMounted(true);

    // Simula um pequeno atraso para garantir que o esqueleto seja exibido
    // mesmo que a autenticação seja rápida
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 800); // Aumentado para 800ms para dar mais tempo para carregar

    return () => clearTimeout(timer);
  }, []);

  // Determina se deve mostrar o esqueleto
  const showSkeleton = !isMounted || isLoading || status === 'loading';

  // Força uma nova renderização quando o status da sessão mudar
  useEffect(() => {
    if (status === 'authenticated') {
      // Adiciona um pequeno atraso para garantir que outros componentes tenham tempo de se inicializar
      const timer = setTimeout(() => {
        console.log('Sessão autenticada, forçando nova renderização');
        setIsLoading(false);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen w-full min-h-screen bg-background">
        {/* Renderiza o esqueleto ou a sidebar condicional */}
        {showSkeleton ? (
          <SidebarSkeleton />
        ) : (
          <ConditionalSidebar />
        )}

        {/* Conteúdo principal - as classes CSS no globals.css ajustam automaticamente a margem */}
        <div className="flex-1 flex flex-col min-h-screen w-full bg-background">
          {/* Renderiza o esqueleto do navbar ou o navbar real */}
          {showSkeleton ? (
            <NavbarSkeleton />
          ) : (
            <Navbar />
          )}

          <div className="flex-1 w-full bg-background pt-4">
            {children}
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}