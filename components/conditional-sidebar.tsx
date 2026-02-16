// components/conditional-sidebar.tsx

"use client"; // Marca o componente como cliente

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarSkeleton } from "@/components/ui/sidebar-skeleton";
import { SidebarFallback } from "@/components/ui/sidebar-fallback";

const ConditionalSidebar = () => {
	const { data: session, status } = useSession();
	const [isMounted, setIsMounted] = useState(false);
	const [hasError, setHasError] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	// Garante que o componente está montado no cliente
	useEffect(() => {
		setIsMounted(true);

		// Adiciona um timeout para garantir que o estado de carregamento seja atualizado
		const timer = setTimeout(() => {
			setIsLoading(false);
		}, 500);

		return () => clearTimeout(timer);
	}, []);

	// Efeito para verificar se há contas do Instagram conectadas
	useEffect(() => {
		if (isMounted && status === "authenticated" && session?.user?.id) {
			// Verifica se há contas do Instagram conectadas
			const checkInstagramAccounts = async () => {
				try {
					const response = await fetch("/api/auth/instagram/accounts");
					if (!response.ok) {
						console.error("Erro ao buscar contas do Instagram:", response.statusText);
						setHasError(true);
					}
				} catch (error) {
					console.error("Erro ao verificar contas do Instagram:", error);
					setHasError(true);
				} finally {
					setIsLoading(false);
				}
			};

			checkInstagramAccounts();
		}
	}, [isMounted, status, session]);

	// Se o componente não estiver montado ou estiver carregando, mostra o esqueleto
	if (!isMounted || isLoading) {
		return <SidebarSkeleton />;
	}

	// Se não estiver autenticado, não mostra a sidebar
	if (status !== "authenticated") {
		return null;
	}

	// Se ocorreu um erro, mostra a sidebar de fallback
	if (hasError) {
		console.log("Renderizando sidebar de fallback devido a erro na verificação de contas");
		return <SidebarFallback />;
	}

	// Se estiver autenticado e montado, mostra a sidebar completa
	try {
		return <AppSidebar />;
	} catch (error) {
		console.error("Erro ao renderizar AppSidebar:", error);
		return <SidebarFallback />;
	}
};

export default ConditionalSidebar;
