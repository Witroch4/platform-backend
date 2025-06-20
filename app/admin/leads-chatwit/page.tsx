"use client";

import { useState, useEffect } from "react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription,
  CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { RefreshCw, Search, Info, ChevronDown, BarChart, X } from "lucide-react";
import { LeadsTabs } from "./components/leads-tabs";
import { LeadsDashboard } from "./components/dashboard";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeadsList } from "./components/leads-list";
import { UsuariosList } from "./components/usuarios-list";

export default function LeadsChatwitPage() {
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({
    totalLeads: 0,
    totalUsuarios: 0,
    totalArquivos: 0,
    pendentes: 0
  });
  const [showDashboard, setShowDashboard] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState("ultimos7");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [activeTab, setActiveTab] = useState("leads");

  useEffect(() => {
    fetchStats();
  }, [filterPeriod, refreshCounter]);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/leads-chatwit/stats");
      const data = await response.json();
      
      if (response.ok) {
        setStats(data.stats);
      } else {
        throw new Error(data.error || "Erro ao buscar estatísticas");
      }
    } catch (error: any) {
      console.error("Erro ao buscar estatísticas:", error);
      toast.error("Erro", {
        description: error.message || "Não foi possível carregar as estatísticas",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshCounter(prev => prev + 1);
    
    toast("Atualizando", {
      description: "Atualizando dados dos leads...",
    });
  };

  const toggleDashboard = () => {
    setShowDashboard(prev => !prev);
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6 bg-background">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gerenciamento de Leads do Chatwit</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie leads recebidos via webhook, unifique PDFs e converta documentos
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select 
            defaultValue="ultimos7" 
            value={filterPeriod}
            onValueChange={setFilterPeriod}
          >
            <SelectTrigger className="w-[180px] border-border">
              <SelectValue placeholder="Filtrar por período" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="ultimos7">Últimos 7 dias</SelectItem>
              <SelectItem value="ultimos30">Últimos 30 dias</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="border-border hover:bg-accent"
                >
                  {isLoading ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Atualizar
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-popover border-border">
                <p>Atualizar dados dos leads</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="border-border hover:bg-accent">
                <Info className="h-4 w-4 mr-2" />
                Ajuda
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-background border-border">
              <SheetHeader>
                <SheetTitle className="text-foreground">Sistema de Gerenciamento de Leads</SheetTitle>
                <SheetDescription className="text-muted-foreground">
                  Instruções para utilização do sistema de leads do Chatwit
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Cadastro de Leads</h3>
                  <p className="text-sm text-muted-foreground">
                    Os leads são automaticamente cadastrados através do webhook enviado pelo Chatwit.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Unificação de PDFs</h3>
                  <p className="text-sm text-muted-foreground">
                    Clique em "Unificar" para juntar todos os arquivos PDF do lead em um único documento.
                    O arquivo será salvo no MinIO após a unificação.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Conversão para Imagens</h3>
                  <p className="text-sm text-muted-foreground">
                    Após unificar, você pode converter o PDF em imagens clicando no botão "Converter em Imagens".
                    As imagens serão salvas no MinIO automaticamente.
                  </p>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      
      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-card-foreground">Total de Leads</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 w-16 bg-muted animate-pulse rounded-md" />
            ) : (
              <>
                <div className="text-2xl font-bold text-card-foreground">{stats.totalLeads}</div>
                <p className="text-xs text-muted-foreground">Todos os leads cadastrados</p>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-card-foreground">Total de Usuários</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 w-16 bg-muted animate-pulse rounded-md" />
            ) : (
              <>
                <div className="text-2xl font-bold text-card-foreground">{stats.totalUsuarios}</div>
                <p className="text-xs text-muted-foreground">Usuários com leads cadastrados</p>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-card-foreground">Total de Arquivos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 w-16 bg-muted animate-pulse rounded-md" />
            ) : (
              <>
                <div className="text-2xl font-bold text-card-foreground">{stats.totalArquivos}</div>
                <p className="text-xs text-muted-foreground">Arquivos anexados aos leads</p>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-card-foreground">Leads Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 w-16 bg-muted animate-pulse rounded-md" />
            ) : (
              <>
                <div className="text-2xl font-bold text-card-foreground">{stats.pendentes}</div>
                <p className="text-xs text-muted-foreground">Aguardando processamento</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Toggles e Dashboard */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div className="flex items-center gap-2">
          <Button 
            variant={showDashboard ? "default" : "outline"} 
            size="sm"
            onClick={toggleDashboard}
            className={showDashboard ? "" : "border-border hover:bg-accent"}
          >
            <BarChart className="h-4 w-4 mr-2" />
            {showDashboard ? "Ocultar Dashboard" : "Mostrar Dashboard"}
          </Button>
        </div>
        
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar leads..."
            className="w-full md:w-[300px] pl-8 border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-accent"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Dashboard */}
      {showDashboard && (
        <div className="grid grid-cols-1 gap-4">
          <LeadsDashboard 
            period={filterPeriod} 
            refreshCounter={refreshCounter}
            isOpen={showDashboard}
          />
        </div>
      )}
      
      {/* Tabs */}
      <LeadsTabs 
        activeTab={activeTab}
        onChange={setActiveTab}
      />
      
      {/* Lista de Leads */}
      {activeTab === "leads" && (
        <div className="border border-border rounded-md bg-card">
          <LeadsList 
            searchQuery={searchQuery}
            onRefresh={handleRefresh}
            initialLoading={isLoading}
            refreshCounter={refreshCounter}
          />
        </div>
      )}
      
      {/* Lista de Usuários */}
      {activeTab === "usuarios" && (
        <div className="border border-border rounded-md bg-card">
          <UsuariosList 
            searchQuery={searchQuery}
            onRefresh={handleRefresh}
            initialLoading={isLoading}
            onViewLeads={(usuarioId: string) => {
              setActiveTab("leads");
            }}
          />
        </div>
      )}
    </div>
  );
}
