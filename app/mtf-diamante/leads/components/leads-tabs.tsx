"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, MessageSquare, UserCog } from "lucide-react";
import Link from "next/link";

interface LeadsTabsProps {
	activeTab: string;
	onChange: (tab: string) => void;
	userRole?: string;
}

export function LeadsTabs({ activeTab, onChange, userRole }: LeadsTabsProps) {
	// Definir abas baseadas na role do usuário
	const tabs = [
		{ id: "leads", label: "Leads", icon: Users },
		{ id: "mensagens", label: "Mensagens", icon: MessageSquare },
		// Só mostrar aba "Usuários" para SUPERADMIN
		...(userRole === "SUPERADMIN" ? [{ id: "usuarios", label: "Usuários", icon: UserCog }] : []),
	];

	return (
		<div className="bg-background">
			<div className="flex items-center justify-between border-b border-border">
				<Tabs value={activeTab} onValueChange={onChange} className="flex-1">
					<TabsList className="h-auto p-0 bg-transparent justify-start gap-1">
						{tabs.map((tab) => {
							const Icon = tab.icon;
							return (
								<TabsTrigger
									key={tab.id}
									value={tab.id}
									className="data-[state=active]:bg-transparent flex items-center gap-2 px-4 py-2.5"
								>
									<Icon className="h-4 w-4" />
									<span className="hidden sm:inline">{tab.label}</span>
								</TabsTrigger>
							);
						})}
					</TabsList>
				</Tabs>

				<Link
					href="/mtf-diamante/leads/listagem"
					className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-blue-500 dark:hover:text-blue-600 transition-colors border-b-2 border-transparent hover:border-blue-500 dark:hover:border-blue-600"
				>
					Listagem Completa
				</Link>
			</div>
		</div>
	);
}
