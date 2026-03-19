import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface LeadsWaitingIndicatorProps {
	className?: string;
}

export function LeadsWaitingIndicator({ className = "" }: LeadsWaitingIndicatorProps) {
	const [waitingCount, setWaitingCount] = useState(0);
	const pathname = usePathname();

	useEffect(() => {
		// Função para buscar leads aguardando processamento
		const fetchWaitingLeads = async () => {
			try {
				const response = await fetch("/api/admin/leads-chatwit/stats");
				if (response.ok) {
					const data = await response.json();
					// Assumindo que a API retorna { aguardandoProcessamento: number }
					setWaitingCount(data.aguardandoProcessamento || 0);
				}
			} catch (error) {
				console.error("Erro ao buscar leads aguardando:", error);
			}
		};

		// Buscar inicialmente
		fetchWaitingLeads();

		// Atualizar a cada 30 segundos
		const interval = setInterval(fetchWaitingLeads, 30000);

		// Escutar eventos personalizados para atualização imediata
		const handleLeadUpdate = () => {
			fetchWaitingLeads();
		};

		// Eventos de leads
		window.addEventListener("lead-update", handleLeadUpdate);
		window.addEventListener("leads-waiting-update", handleLeadUpdate);

		return () => {
			clearInterval(interval);
			window.removeEventListener("lead-update", handleLeadUpdate);
			window.removeEventListener("leads-waiting-update", handleLeadUpdate);
		};
	}, []);

	// Só mostrar nas rotas de admin
	const isAdminRoute = pathname?.startsWith("/admin");

	if (waitingCount === 0 || !isAdminRoute) {
		return null;
	}

	return (
		<div
			className={`flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md text-xs font-medium text-orange-700 dark:text-orange-300 ${className}`}
		>
			<div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></div>
			<span>{waitingCount} Aguardando</span>
		</div>
	);
}
