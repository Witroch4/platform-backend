'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import MensagensInterativasTab from '@/app/admin/mtf-diamante/components/MensagensInterativasTab';
import MapeamentoTab from '@/app/admin/mtf-diamante/components/MapeamentoTab';
import { FlowBuilderTab } from '@/app/admin/mtf-diamante/components/FlowBuilderTab';
import { FlowAnalyticsDashboard } from '@/app/admin/mtf-diamante/components/FlowAnalyticsDashboard';
import { DialogflowCaixasAgentes } from '@/app/admin/mtf-diamante/components/DialogflowCaixasAgentes';
import SafeBoundary from '@/components/SafeBoundary';
import { Loader2, Settings, GitBranch, LineChart, MessageSquare, Map, Users, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useMtfData } from '@/app/admin/mtf-diamante/context/SwrProvider';

// Definição das tabs com ícones para mobile
const TAB_CONFIG = [
  { value: 'flow-builder', label: 'Flow Builder', shortLabel: 'Flow', icon: GitBranch },
  { value: 'interativas', label: 'Mensagens Interativas', shortLabel: 'Mensagens', icon: MessageSquare },
  { value: 'mapeamento', label: 'Mapeamento', shortLabel: 'Mapear', icon: Map },
  { value: 'agentes', label: 'Agentes', shortLabel: 'Agentes', icon: Users },
  { value: 'analytics', label: 'Analytics', shortLabel: 'Analytics', icon: LineChart },
  { value: 'configuracoes', label: 'Configurações', shortLabel: 'Config', icon: Settings },
] as const;

export default function InboxDashboardPage() {
  const params = useParams() as { id?: string };
  const caixaId = params?.id ?? '';
  const sp = useSearchParams();
  const router = useRouter();
  // Ler tab do URL apenas uma vez na montagem (rerender-defer-reads:
  // não se inscrever a mudanças de searchParams que causariam re-render)
  const initialTabRef = useRef(sp?.get('tab') || 'flow-builder');
  const [tab, setTab] = useState(initialTabRef.current);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // MTF Data Provider para operações com optimistic updates
  const { caixas, deleteCaixa } = useMtfData();

  // Encontrar a caixa atual
  const currentCaixa = caixas.find(c => c.id === caixaId);

  // Tab atual para exibição
  const currentTabConfig = TAB_CONFIG.find(t => t.value === tab) ?? TAB_CONFIG[0];
  const CurrentIcon = currentTabConfig.icon;

  // Sincronizar tab apenas quando o parâmetro 'tab' muda de verdade
  // (evita re-renders espúrios quando sp muda de referência)
  const tabParam = sp?.get('tab');
  useEffect(() => {
    if (tabParam) setTab(tabParam);
  }, [tabParam]);

  // Callbacks estáveis (React 19 best practice)
  const handleTabChange = useCallback((newTab: string) => {
    setTab(newTab);
  }, []);

  const handleDeleteClick = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setShowDeleteDialog(false);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!currentCaixa) return;

    const deletePromise = deleteCaixa(caixaId);

    toast.promise(deletePromise, {
      loading: "Excluindo caixa...",
      success: () => {
        setShowDeleteDialog(false);
        router.push('/admin/mtf-diamante');
        return `Caixa "${currentCaixa.nome || 'Inbox'}" excluída com sucesso`;
      },
      error: (error: unknown) => {
        const message = error instanceof Error ? error.message : "Erro ao excluir caixa";
        return message;
      },
    });
  }, [currentCaixa, deleteCaixa, caixaId, router]);

  // Callback vazio para DialogflowCaixasAgentes
  const handleCaixaSelected = useCallback(() => { }, []);

  // Guarda para evitar renderização com inboxId undefined
  if (!caixaId) {
    return (
      <div className="flex items-center justify-center p-6 min-h-[200px]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando caixa…
        </div>
      </div>
    );
  }

  return (
    <SafeBoundary>
      <div className="p-3 sm:p-4 lg:p-6">
        <Tabs value={tab} onValueChange={handleTabChange} className="space-y-3 sm:space-y-4">
          {/* Mobile: Dropdown para seleção de tab */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between min-h-[44px] border-border"
                >
                  <span className="flex items-center gap-2">
                    <CurrentIcon className="h-4 w-4" />
                    {currentTabConfig.label}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[calc(100vw-24px)] max-w-md">
                {TAB_CONFIG.map((tabItem) => {
                  const Icon = tabItem.icon;
                  return (
                    <DropdownMenuItem
                      key={tabItem.value}
                      onClick={() => handleTabChange(tabItem.value)}
                      className={`min-h-[44px] ${tab === tabItem.value ? 'bg-accent' : ''}`}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {tabItem.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Desktop: TabsList horizontal com scroll */}
          <TabsList className="hidden md:inline-flex h-auto p-1 flex-wrap gap-1">
            {TAB_CONFIG.map((tabItem) => {
              const Icon = tabItem.icon;
              return (
                <TabsTrigger
                  key={tabItem.value}
                  value={tabItem.value}
                  className="min-h-[40px] px-3 data-[state=active]:shadow-sm"
                >
                  <Icon className="w-4 h-4 mr-2 shrink-0" />
                  <span className="hidden lg:inline">{tabItem.label}</span>
                  <span className="lg:hidden">{tabItem.shortLabel}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          {/* Tab Contents — forceMount no FlowBuilder para preservar estado entre tabs */}
          <TabsContent value="flow-builder" className="mt-0 data-[state=inactive]:hidden" forceMount>
            <FlowBuilderTab caixaId={caixaId} />
          </TabsContent>

          <TabsContent value="interativas" className="mt-0">
            <MensagensInterativasTab caixaId={caixaId} />
          </TabsContent>

          <TabsContent value="mapeamento" className="mt-0">
            <MapeamentoTab caixaId={caixaId} />
          </TabsContent>

          <TabsContent value="agentes" className="mt-0">
            <DialogflowCaixasAgentes
              onCaixaSelected={handleCaixaSelected}
              filterCaixaId={caixaId}
              hideToolbar
            />
          </TabsContent>

          <TabsContent value="analytics" className="mt-0">
            <FlowAnalyticsDashboard inboxId={caixaId} />
          </TabsContent>

          <TabsContent value="configuracoes" className="mt-0">
            <Card className="border-border">
              <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                  <Settings className="w-5 h-5 shrink-0" />
                  Configurações da Caixa
                </CardTitle>
                <CardDescription className="text-sm">
                  Gerencie as configurações avançadas desta caixa de entrada
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
                <div className="space-y-4">
                  {/* Informações da Caixa */}
                  <div className="p-3 sm:p-4 border border-border rounded-lg bg-muted/20">
                    <h3 className="font-medium mb-3 text-sm sm:text-base">Informações da Caixa</h3>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="text-muted-foreground text-xs sm:text-sm shrink-0">ID Interno:</span>
                        <code className="px-2 py-1 rounded bg-muted font-mono text-xs select-all break-all">
                          {caixaId}
                        </code>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="text-muted-foreground text-xs sm:text-sm shrink-0">ID Chatwit:</span>
                        <code className="px-2 py-1 rounded bg-muted font-mono text-xs select-all break-all">
                          {currentCaixa?.inboxId ?? '—'}
                        </code>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="text-muted-foreground text-xs sm:text-sm">Nome:</span>
                        <span className="font-medium">{currentCaixa?.nome ?? '—'}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="text-muted-foreground text-xs sm:text-sm">Canal:</span>
                        <span className="font-medium">{currentCaixa?.channelType ?? '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Configurações de AI */}
                  <div className="p-3 sm:p-4 border border-border rounded-lg bg-muted/20">
                    <h3 className="font-medium mb-2 text-sm sm:text-base">Configurações de AI</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                      Configure o comportamento da inteligência artificial para esta caixa
                    </p>
                    <Button variant="outline" className="min-h-[44px] w-full sm:w-auto">
                      Abrir Configurações IA
                    </Button>
                  </div>

                  {/* Configurações de Canal */}
                  <div className="p-3 sm:p-4 border border-border rounded-lg bg-muted/20">
                    <h3 className="font-medium mb-2 text-sm sm:text-base">Configurações de Canal</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                      Ajuste as configurações específicas do canal de comunicação
                    </p>
                    <Button variant="outline" className="min-h-[44px] w-full sm:w-auto">
                      Configurar Canal
                    </Button>
                  </div>

                  {/* Zona de Perigo */}
                  <div className="p-3 sm:p-4 border border-destructive/50 rounded-lg bg-destructive/5">
                    <h3 className="font-medium mb-2 text-destructive text-sm sm:text-base">Zona de Perigo</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                      Ações irreversíveis relacionadas a esta caixa de entrada
                    </p>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteClick}
                      className="min-h-[44px] w-full sm:w-auto"
                    >
                      Excluir Caixa
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de confirmação para deletar caixa - Mobile optimizado */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="w-[calc(100vw-24px)] sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">Excluir caixa de entrada</DialogTitle>
            <DialogDescription className="text-sm">
              Tem certeza que deseja excluir a caixa &quot;{currentCaixa?.nome || 'Inbox'}&quot;?
              <span className="block mt-3">
                <strong>Esta ação não pode ser desfeita</strong> e todos os dados relacionados serão removidos:
              </span>
              <ul className="mt-2 space-y-1 text-xs sm:text-sm">
                <li>• Agentes configurados</li>
                <li>• Templates de mensagens</li>
                <li>• Mapeamentos de intenções</li>
                <li>• Histórico de conversas</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={closeDeleteDialog}
              className="min-h-[44px] w-full sm:w-auto order-2 sm:order-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmDelete}
              variant="destructive"
              className="min-h-[44px] w-full sm:w-auto order-1 sm:order-2"
            >
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SafeBoundary>
  );
}


