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
import { RefreshCw, Search, Info, ChevronDown, BarChart, X, Shield, BookOpen, FileText } from "lucide-react";
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
import { RegisterApiKeyDialog } from "@/components/admin/register-api-key-dialog";
import { EspelhosPadraoDrawer } from "./components/espelhos-padrao-drawer";
import { ModeloRecursoDrawer } from "./components/modelo-recurso-drawer";

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
  const [userInfo, setUserInfo] = useState({
    hasToken: false,
    role: "ADMIN",
    isLoading: true,
    chatwitAccessToken: "", // <--- Adicionar
    chatwitAccountId: ""    // <--- Adicionar
  });
  const [showEspelhosPadraoDrawer, setShowEspelhosPadraoDrawer] = useState(false);
  const [showModeloRecursoDrawer, setShowModeloRecursoDrawer] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchUserInfo();
  }, [filterPeriod, refreshCounter]);

  // Verificar se usuário ADMIN está tentando acessar aba "usuarios"
  useEffect(() => {
    if (!userInfo.isLoading && userInfo.role !== "SUPERADMIN" && activeTab === "usuarios") {
      setActiveTab("leads");
    }
  }, [userInfo.role, userInfo.isLoading, activeTab]);

  const fetchUserInfo = async () => {
    try {
      const response = await fetch("/api/admin/leads-chatwit/register-token");
      const data = await response.json();
      
      if (response.ok) {
        setUserInfo({
          hasToken: data.user.hasToken,
          role: data.user.role,
          // Assumindo que o backend agora retorna esses campos
          chatwitAccessToken: data.user.chatwitAccessToken || "",
          chatwitAccountId: data.user.chatwitAccountId || "",
          isLoading: false
        });
      }
    } catch (error) {
      console.error("Erro ao buscar informações do usuário:", error);
      setUserInfo(prev => ({ ...prev, isLoading: false }));
    }
  };

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
          {/* Botão de cadastro de API Key */}
          {!userInfo.isLoading && (
            <RegisterApiKeyDialog 
              userHasToken={userInfo.hasToken}
              // Passando os dados que já temos
              initialToken={userInfo.chatwitAccessToken}
              initialAccountId={userInfo.chatwitAccountId}
              onTokenRegistered={() => {
                fetchUserInfo();
                handleRefresh();
              }}
            />
          )}
          
          {/* Badge para SUPERADMIN */}
          {userInfo.role === "SUPERADMIN" && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 px-3 py-2 bg-purple-100 dark:bg-purple-900/20 rounded-md">
                    <Shield className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-medium text-purple-700 dark:text-purple-400">
                      SUPERADMIN
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-popover border-border">
                  <p>Você tem acesso a todos os leads e usuários</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

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
      <div className={`grid grid-cols-1 gap-4 ${userInfo.role === "SUPERADMIN" ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-card-foreground">
              {userInfo.role === "SUPERADMIN" ? "Total de Leads" : "Meus Leads"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 w-16 bg-muted animate-pulse rounded-md" />
            ) : (
              <>
                <div className="text-2xl font-bold text-card-foreground">{stats.totalLeads}</div>
                <p className="text-xs text-muted-foreground">
                  {userInfo.role === "SUPERADMIN" ? "Todos os leads cadastrados" : "Leads do seu token"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        
        {/* Card "Total de Usuários" - apenas para SUPERADMIN */}
        {userInfo.role === "SUPERADMIN" && (
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
        )}
        
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-card-foreground">
              {userInfo.role === "SUPERADMIN" ? "Total de Arquivos" : "Meus Arquivos"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 w-16 bg-muted animate-pulse rounded-md" />
            ) : (
              <>
                <div className="text-2xl font-bold text-card-foreground">{stats.totalArquivos}</div>
                <p className="text-xs text-muted-foreground">
                  {userInfo.role === "SUPERADMIN" ? "Arquivos anexados aos leads" : "Arquivos dos seus leads"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-card-foreground">
              {userInfo.role === "SUPERADMIN" ? "Leads Pendentes" : "Meus Leads Pendentes"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 w-16 bg-muted animate-pulse rounded-md" />
            ) : (
              <>
                <div className="text-2xl font-bold text-card-foreground">{stats.pendentes}</div>
                <p className="text-xs text-muted-foreground">
                  {userInfo.role === "SUPERADMIN" ? "Aguardando processamento" : "Seus leads pendentes"}
                </p>
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
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowEspelhosPadraoDrawer(true)}
            className="border-border hover:bg-accent"
          >
            <BookOpen className="h-4 w-4 mr-2" />
            Espelhos Padrão
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowModeloRecursoDrawer(true)}
            className="border-border hover:bg-accent"
          >
            <FileText className="h-4 w-4 mr-2" />
            Modelo de Recurso
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
        onChange={(tab) => {
          // Se usuário ADMIN tentar acessar aba "usuarios", redirecionar para "leads"
          if (tab === "usuarios" && userInfo.role !== "SUPERADMIN") {
            setActiveTab("leads");
          } else {
            setActiveTab(tab);
          }
        }}
        userRole={userInfo.role}
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

      {/* Drawer de Espelhos Padrão */}
      <EspelhosPadraoDrawer
        isOpen={showEspelhosPadraoDrawer}
        onClose={() => setShowEspelhosPadraoDrawer(false)}
        usuarioId="global" // Para espelhos padrão, usamos um ID global
      />

      {/* Drawer de Modelo de Recurso */}
      <ModeloRecursoDrawer
        isOpen={showModeloRecursoDrawer}
        onClose={() => setShowModeloRecursoDrawer(false)}
      />
    </div>
  );
}
