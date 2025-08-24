"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadsList } from "./leads-list";
import { UsuariosList } from "./usuarios-list";
import Link from "next/link";

interface LeadsTabsProps {
  activeTab: string;
  onChange: (tab: string) => void;
  userRole?: string;
}

export function LeadsTabs({ activeTab, onChange, userRole }: LeadsTabsProps) {
  // Definir abas baseadas na role do usuário
  const tabs = [
    { id: "leads", label: "Leads" },
    // Só mostrar aba "Usuários" para SUPERADMIN
    ...(userRole === "SUPERADMIN" ? [{ id: "usuarios", label: "Usuários" }] : []),
  ];

  return (
    <div className="bg-background">
      <div className="flex items-center justify-between border-b border-border">
        <Tabs value={activeTab} onValueChange={onChange} className="flex-1">
          <TabsList variant="line" className="h-auto p-0 bg-transparent justify-start">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="data-[state=active]:bg-transparent"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        
        <Link 
          href="/admin/leads-chatwit/listagem"
          className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-blue-500 dark:hover:text-blue-600 transition-colors border-b-2 border-transparent hover:border-blue-500 dark:hover:border-blue-600"
        >
          Listagem Completa
        </Link>
      </div>
    </div>
  );
}