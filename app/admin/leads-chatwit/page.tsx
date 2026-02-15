"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  RefreshCw,
  Search,
  Info,
  BarChart,
  X,
  Shield,
  BookOpen,
  FileText,
  Download,
  Menu
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeadsList } from "./components/leads-list";
import { UsuariosList } from "./components/usuarios-list";
import { RegisterApiKeyDialog } from "@/components/admin/register-api-key-dialog";
import { EspelhosPadraoDrawer } from "./components/espelhos-padrao-drawer";
import { ModeloRecursoDrawer } from "./components/modelo-recurso-drawer";

// Tipo para estatísticas - derivado do estado
interface Stats {
  totalLeads: number;
  totalUsuarios: number;
  totalArquivos: number;
  pendentes: number;
}

// Tipo para informações do usuário
interface UserInfo {
  hasToken: boolean;
  role: string;
  isLoading: boolean;
  chatwitAccessToken: string;
  chatwitAccountId: string;
}

// Estado inicial lazy - React 19 best practice (rerender-lazy-state-init)
const initialStats: Stats = {
  totalLeads: 0,
  totalUsuarios: 0,
  totalArquivos: 0,
  pendentes: 0
};

const initialUserInfo: UserInfo = {
  hasToken: false,
  role: "ADMIN",
  isLoading: true,
  chatwitAccessToken: "",
  chatwitAccountId: ""
};

export default function LeadsChatwitPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState<Stats>(() => initialStats);
  const [showDashboard, setShowDashboard] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState("ultimos7");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [activeTab, setActiveTab] = useState("leads");
  const [userInfo, setUserInfo] = useState<UserInfo>(() => initialUserInfo);
  const [showEspelhosPadraoDrawer, setShowEspelhosPadraoDrawer] = useState(false);
  const [showModeloRecursoDrawer, setShowModeloRecursoDrawer] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  // Memoizar se é superadmin para evitar recálculos (rerender-derived-state)
  const isSuperAdmin = userInfo.role === "SUPERADMIN";

  // Callbacks estáveis com useCallback (rerender-functional-setstate)
  const fetchUserInfo = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/leads-chatwit/register-token");
      const data = await response.json();

      if (response.ok) {
        setUserInfo({
          hasToken: data.user.hasToken,
          role: data.user.role,
          chatwitAccessToken: data.user.chatwitAccessToken || "",
          chatwitAccountId: data.user.chatwitAccountId || "",
          isLoading: false
        });
      }
    } catch (error) {
      console.error("Erro ao buscar informações do usuário:", error);
      setUserInfo(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/leads-chatwit/stats");
      const data = await response.json();

      if (response.ok) {
        setStats(data.stats);
      } else {
        throw new Error(data.error || "Erro ao buscar estatísticas");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Não foi possível carregar as estatísticas";
      console.error("Erro ao buscar estatísticas:", error);
      toast.error("Erro", { description: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchUserInfo();
  }, [filterPeriod, refreshCounter, fetchStats, fetchUserInfo]);

  // Verificar se usuário ADMIN está tentando acessar aba "usuarios"
  useEffect(() => {
    if (!userInfo.isLoading && !isSuperAdmin && activeTab === "usuarios") {
      setActiveTab("leads");
    }
  }, [isSuperAdmin, userInfo.isLoading, activeTab]);

  // Callbacks estáveis (rerender-functional-setstate)
  const handleRefresh = useCallback(() => {
    setRefreshCounter(prev => prev + 1);
    toast("Atualizando", { description: "Atualizando dados dos leads..." });
  }, []);

  const toggleDashboard = useCallback(() => {
    setShowDashboard(prev => !prev);
  }, []);

  const handleExportCsv = useCallback(async () => {
    setIsExportingCsv(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) {
        params.append("search", searchQuery);
      }

      const response = await fetch(`/api/admin/leads-chatwit/export-csv?${params.toString()}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao exportar CSV");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-chatwit-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("CSV exportado", { description: "Arquivo baixado com sucesso", duration: 2000 });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Não foi possível exportar o CSV";
      console.error("Erro ao exportar CSV:", error);
      toast.error("Erro na exportação", { description: errorMessage });
    } finally {
      setIsExportingCsv(false);
    }
  }, [searchQuery]);

  // Callback para mudança de tab
  const handleTabChange = useCallback((tab: string) => {
    if (tab === "usuarios" && !isSuperAdmin) {
      setActiveTab("leads");
    } else {
      setActiveTab(tab);
    }
  }, [isSuperAdmin]);

  // Callbacks para drawers
  const openEspelhosPadrao = useCallback(() => setShowEspelhosPadraoDrawer(true), []);
  const closeEspelhosPadrao = useCallback(() => setShowEspelhosPadraoDrawer(false), []);
  const openModeloRecurso = useCallback(() => setShowModeloRecursoDrawer(true), []);
  const closeModeloRecurso = useCallback(() => setShowModeloRecursoDrawer(false), []);
  const clearSearch = useCallback(() => setSearchQuery(""), []);

  // Callback para ver leads de um usuário específico
  const handleViewLeadsFromUsuario = useCallback((_usuarioId: string) => {
    setActiveTab("leads");
  }, []);

  // Callback combinado para token registrado
  const handleTokenRegistered = useCallback(() => {
    fetchUserInfo();
    handleRefresh();
  }, [fetchUserInfo, handleRefresh]);

  return (
    <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 bg-background">
      {/* Cabeçalho - Mobile First */}
      <div className="flex flex-col gap-4">
        {/* Título e Badge */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground truncate">
              Gerenciamento de Leads
            </h1>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              Gerencie leads, unifique PDFs e converta documentos
            </p>
          </div>

          {/* Badge SUPERADMIN - visível em todas as telas */}
          {isSuperAdmin && (
            <div className="flex items-center gap-2 px-3 py-2 bg-purple-100 dark:bg-purple-900/20 rounded-md shrink-0 self-start">
              <Shield className="h-4 w-4 text-purple-600" />
              <span className="text-xs sm:text-sm font-medium text-purple-700 dark:text-purple-400">
                SUPERADMIN
              </span>
            </div>
          )}
        </div>

        {/* Controles - Layout responsivo */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Linha 1 mobile: Período + Ações principais */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Select de período - adaptado para mobile */}
            <Select
              defaultValue="ultimos7"
              value={filterPeriod}
              onValueChange={setFilterPeriod}
            >
              <SelectTrigger className="w-[140px] sm:w-[160px] border-border min-h-[44px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="ultimos7">Últimos 7 dias</SelectItem>
                <SelectItem value="ultimos30">Últimos 30 dias</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>

            {/* Botão de cadastro de API Key */}
            {!userInfo.isLoading && (
              <RegisterApiKeyDialog
                userHasToken={userInfo.hasToken}
                initialToken={userInfo.chatwitAccessToken}
                initialAccountId={userInfo.chatwitAccountId}
                onTokenRegistered={handleTokenRegistered}
              />
            )}

            {/* Botão Atualizar */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleRefresh}
                    disabled={isLoading}
                    className="border-border hover:bg-accent min-h-[44px] min-w-[44px] sm:min-w-auto sm:px-4"
                    aria-label="Atualizar dados"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline ml-2">Atualizar</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-popover border-border">
                  <p>Atualizar dados dos leads</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Botão Ajuda */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="border-border hover:bg-accent min-h-[44px] min-w-[44px] sm:min-w-auto sm:px-4"
                  aria-label="Ajuda"
                >
                  <Info className="h-4 w-4" />
                  <span className="hidden sm:inline ml-2">Ajuda</span>
                </Button>
              </SheetTrigger>
              <SheetContent className="bg-background border-border w-[90vw] sm:max-w-md">
                <SheetHeader>
                  <SheetTitle className="text-foreground">Sistema de Gerenciamento de Leads</SheetTitle>
                  <SheetDescription className="text-muted-foreground">
                    Instruções para utilização do sistema
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Cadastro de Leads</h3>
                    <p className="text-sm text-muted-foreground">
                      Os leads são cadastrados automaticamente via webhook do Chatwit.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Unificação de PDFs</h3>
                    <p className="text-sm text-muted-foreground">
                      Clique em &quot;Unificar&quot; para juntar todos os PDFs do lead em um único documento.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Conversão para Imagens</h3>
                    <p className="text-sm text-muted-foreground">
                      Após unificar, converta o PDF em imagens clicando em &quot;Converter em Imagens&quot;.
                    </p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
      
      {/* Cards de Estatísticas - Mobile: 2 colunas, Desktop: 3-4 colunas */}
      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${isSuperAdmin ? "lg:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Card className="border-border bg-card">
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-card-foreground">
              {isSuperAdmin ? "Total de Leads" : "Meus Leads"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            {isLoading ? (
              <div className="h-8 sm:h-12 w-12 sm:w-16 bg-muted animate-pulse rounded-md" />
            ) : (
              <>
                <div className="text-xl sm:text-2xl font-bold text-card-foreground tabular-nums">
                  {stats.totalLeads.toLocaleString('pt-BR')}
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {isSuperAdmin ? "Todos cadastrados" : "Do seu token"}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card "Total de Usuários" - apenas para SUPERADMIN */}
        {isSuperAdmin && (
          <Card className="border-border bg-card">
            <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-card-foreground">
                Total de Usuários
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              {isLoading ? (
                <div className="h-8 sm:h-12 w-12 sm:w-16 bg-muted animate-pulse rounded-md" />
              ) : (
                <>
                  <div className="text-xl sm:text-2xl font-bold text-card-foreground tabular-nums">
                    {stats.totalUsuarios.toLocaleString('pt-BR')}
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    Com leads cadastrados
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-border bg-card">
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-card-foreground">
              {isSuperAdmin ? "Total Arquivos" : "Meus Arquivos"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            {isLoading ? (
              <div className="h-8 sm:h-12 w-12 sm:w-16 bg-muted animate-pulse rounded-md" />
            ) : (
              <>
                <div className="text-xl sm:text-2xl font-bold text-card-foreground tabular-nums">
                  {stats.totalArquivos.toLocaleString('pt-BR')}
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {isSuperAdmin ? "Anexados aos leads" : "Dos seus leads"}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-card-foreground">
              {isSuperAdmin ? "Pendentes" : "Meus Pendentes"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            {isLoading ? (
              <div className="h-8 sm:h-12 w-12 sm:w-16 bg-muted animate-pulse rounded-md" />
            ) : (
              <>
                <div className="text-xl sm:text-2xl font-bold text-card-foreground tabular-nums">
                  {stats.pendentes.toLocaleString('pt-BR')}
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  Aguardando processamento
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Toggles e Dashboard - Mobile optimizado */}
      <div className="flex flex-col gap-3 sm:gap-4">
        {/* Linha de ações + busca */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          {/* Ações principais */}
          <div className="flex items-center gap-2">
            {/* Dashboard toggle - sempre visível */}
            <Button
              variant={showDashboard ? "default" : "outline"}
              onClick={toggleDashboard}
              className={`min-h-[44px] text-sm ${showDashboard ? "" : "border-border hover:bg-accent"}`}
            >
              <BarChart className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{showDashboard ? "Ocultar" : "Dashboard"}</span>
            </Button>

            {/* Desktop: botões individuais | Mobile: dropdown menu */}
            <div className="hidden sm:flex items-center gap-2">
              <Button
                variant="outline"
                onClick={openEspelhosPadrao}
                className="border-border hover:bg-accent min-h-[44px]"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                Espelhos Padrão
              </Button>

              <Button
                variant="outline"
                onClick={openModeloRecurso}
                className="border-border hover:bg-accent min-h-[44px]"
              >
                <FileText className="h-4 w-4 mr-2" />
                Modelo de Recurso
              </Button>

              <Button
                variant="outline"
                onClick={handleExportCsv}
                disabled={isExportingCsv}
                className="border-border hover:bg-accent min-h-[44px]"
              >
                {isExportingCsv ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Gerar CSV
              </Button>
            </div>

            {/* Mobile: Menu dropdown para ações secundárias */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="sm:hidden">
                <Button
                  variant="outline"
                  size="icon"
                  className="border-border hover:bg-accent min-h-[44px] min-w-[44px]"
                  aria-label="Mais ações"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={openEspelhosPadrao} className="min-h-[44px]">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Espelhos Padrão
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openModeloRecurso} className="min-h-[44px]">
                  <FileText className="h-4 w-4 mr-2" />
                  Modelo de Recurso
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleExportCsv}
                  disabled={isExportingCsv}
                  className="min-h-[44px]"
                >
                  {isExportingCsv ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Gerar CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Campo de busca - full width em mobile */}
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Buscar leads..."
              className="w-full sm:w-[280px] lg:w-[320px] pl-9 pr-10 border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring min-h-[44px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-accent"
                onClick={clearSearch}
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* Dashboard - Condicional com transição */}
      {showDashboard && (
        <div className="grid grid-cols-1 gap-3 sm:gap-4">
          <LeadsDashboard
            period={filterPeriod}
            refreshCounter={refreshCounter}
            isOpen={showDashboard}
          />
        </div>
      )}

      {/* Tabs - Responsivo */}
      <LeadsTabs
        activeTab={activeTab}
        onChange={handleTabChange}
        userRole={userInfo.role}
      />

      {/* Lista de Leads - rendering-conditional-render: usar ternário */}
      {activeTab === "leads" ? (
        <div className="border border-border rounded-md bg-card overflow-hidden">
          <LeadsList
            searchQuery={searchQuery}
            onRefresh={handleRefresh}
            initialLoading={isLoading}
            refreshCounter={refreshCounter}
          />
        </div>
      ) : null}

      {/* Lista de Usuários - rendering-conditional-render: usar ternário */}
      {activeTab === "usuarios" ? (
        <div className="border border-border rounded-md bg-card overflow-hidden">
          <UsuariosList
            searchQuery={searchQuery}
            onRefresh={handleRefresh}
            initialLoading={isLoading}
            onViewLeads={handleViewLeadsFromUsuario}
          />
        </div>
      ) : null}

      {/* Drawer de Espelhos Padrão */}
      <EspelhosPadraoDrawer
        isOpen={showEspelhosPadraoDrawer}
        onClose={closeEspelhosPadrao}
        usuarioId="global"
      />

      {/* Drawer de Modelo de Recurso */}
      <ModeloRecursoDrawer
        isOpen={showModeloRecursoDrawer}
        onClose={closeModeloRecurso}
      />
    </div>
  );
}
