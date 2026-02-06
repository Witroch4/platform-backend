'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import MensagensInterativasTab from '@/app/admin/mtf-diamante/components/MensagensInterativasTab';
import MapeamentoTab from '@/app/admin/mtf-diamante/components/MapeamentoTab';
import { FlowBuilderTab } from '@/app/admin/mtf-diamante/components/FlowBuilderTab';
import { DialogflowCaixasAgentes } from '@/app/admin/mtf-diamante/components/DialogflowCaixasAgentes';
import SafeBoundary from '@/components/SafeBoundary';
import { Loader2, Settings, BarChart3, GitBranch } from 'lucide-react';
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
import { toast } from 'sonner';
import { useMtfData } from '@/app/admin/mtf-diamante/context/SwrProvider';

export default function InboxDashboardPage() {
  const params = useParams() as { id?: string };
  const caixaId = params?.id ?? '';
  const sp = useSearchParams();
  const router = useRouter();
  const initialTab = sp?.get('tab') || 'flow-builder';
  const [tab, setTab] = useState(initialTab);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // MTF Data Provider para operações com optimistic updates
  const { caixas, deleteCaixa } = useMtfData();

  // Encontrar a caixa atual
  const currentCaixa = caixas.find(c => c.id === caixaId);

  useEffect(() => {
    if (sp?.get('tab')) setTab(sp.get('tab')!);
  }, [sp]);

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!currentCaixa) return;

    const deletePromise = deleteCaixa(caixaId);

    toast.promise(deletePromise, {
      loading: "Excluindo caixa...",
      success: () => {
        setShowDeleteDialog(false);
        // Redirecionar para a página principal após exclusão
        router.push('/admin/mtf-diamante');
        return `Caixa "${currentCaixa.nome || 'Inbox'}" excluída com sucesso`;
      },
      error: (error) => {
        return error?.message || "Erro ao excluir caixa";
      },
    });
  };

  // Guarda para evitar renderização com inboxId undefined
  if (!caixaId) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando caixa…
        </div>
      </div>
    );
  }

  return (
    <SafeBoundary>
      <div className="p-4 md:p-6">
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList >
            <TabsTrigger value="flow-builder">
              <GitBranch className="w-4 h-4 mr-2" />
              Flow Builder
            </TabsTrigger>
            <TabsTrigger value="interativas">Mensagens Interativas</TabsTrigger>
            <TabsTrigger value="mapeamento">Mapeamento</TabsTrigger>
            <TabsTrigger value="agentes">Agentes</TabsTrigger>
            <TabsTrigger value="configuracoes">
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="metricas">
              <BarChart3 className="w-4 h-4 mr-2" />
              Métricas
            </TabsTrigger>
          </TabsList>
          <TabsContent value="flow-builder">
            <FlowBuilderTab caixaId={caixaId} />
          </TabsContent>
          <TabsContent value="interativas">
            <MensagensInterativasTab caixaId={caixaId} />
          </TabsContent>
          <TabsContent value="mapeamento">
            <MapeamentoTab caixaId={caixaId} />
          </TabsContent>
          <TabsContent value="agentes">
            <DialogflowCaixasAgentes onCaixaSelected={() => {}} filterCaixaId={caixaId} hideToolbar />
          </TabsContent>
          <TabsContent value="configuracoes">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Configurações da Caixa
                </CardTitle>
                <CardDescription>
                  Gerencie as configurações avançadas desta caixa de entrada
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border border-border rounded-lg bg-muted/20">
                    <h3 className="font-medium mb-2">Configurações de AI</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Configure o comportamento da inteligência artificial para esta caixa
                    </p>
                    <Button variant="outline" >
                      Abrir Configurações IA
                    </Button>
                  </div>
                  
                  <div className="p-4 border border-border rounded-lg bg-muted/20">
                    <h3 className="font-medium mb-2">Configurações de Canal</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Ajuste as configurações específicas do canal de comunicação
                    </p>
                    <Button variant="outline" >
                      Configurar Canal
                    </Button>
                  </div>
                  
                  <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/5">
                    <h3 className="font-medium mb-2 text-destructive">Zona de Perigo</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Ações irreversíveis relacionadas a esta caixa de entrada
                    </p>
                    <Button
                      variant="destructive"
                      
                      onClick={handleDeleteClick}
                    >
                      Excluir Caixa
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="metricas">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Métricas e Analytics
                </CardTitle>
                <CardDescription>
                  Acompanhe o desempenho e estatísticas desta caixa de entrada
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 border border-border rounded-lg">
                    <h4 className="font-medium text-sm text-muted-foreground">Total de Mensagens</h4>
                    <p className="text-2xl font-bold">1,234</p>
                    <p className="text-xs text-green-600">+12% este mês</p>
                  </div>
                  
                  <div className="p-4 border border-border rounded-lg">
                    <h4 className="font-medium text-sm text-muted-foreground">Tempo de Resposta</h4>
                    <p className="text-2xl font-bold">2.3s</p>
                    <p className="text-xs text-green-600">-15% este mês</p>
                  </div>
                  
                  <div className="p-4 border border-border rounded-lg">
                    <h4 className="font-medium text-sm text-muted-foreground">Taxa de Sucesso</h4>
                    <p className="text-2xl font-bold">94.2%</p>
                    <p className="text-xs text-green-600">+3% este mês</p>
                  </div>
                  
                  <div className="p-4 border border-border rounded-lg">
                    <h4 className="font-medium text-sm text-muted-foreground">Conversas Ativas</h4>
                    <p className="text-2xl font-bold">48</p>
                    <p className="text-xs text-blue-600">Agora</p>
                  </div>
                  
                  <div className="p-4 border border-border rounded-lg">
                    <h4 className="font-medium text-sm text-muted-foreground">Intents Detectados</h4>
                    <p className="text-2xl font-bold">892</p>
                    <p className="text-xs text-green-600">+8% este mês</p>
                  </div>
                  
                  <div className="p-4 border border-border rounded-lg">
                    <h4 className="font-medium text-sm text-muted-foreground">Handoffs</h4>
                    <p className="text-2xl font-bold">23</p>
                    <p className="text-xs text-orange-600">+2 hoje</p>
                  </div>
                </div>
                
                <div className="mt-6 p-4 border border-border rounded-lg bg-muted/20">
                  <h3 className="font-medium mb-3">Relatórios Detalhados</h3>
                  <div className="flex gap-2">
                    <Button variant="outline" >
                      Exportar Dados
                    </Button>
                    <Button variant="outline" >
                      Relatório Semanal
                    </Button>
                    <Button variant="outline" >
                      Análise de Performance
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de confirmação para deletar caixa */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir caixa de entrada</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a caixa "{currentCaixa?.nome || 'Inbox'}"?
              <br /><br />
              <strong>Esta ação não pode ser desfeita</strong> e todos os dados relacionados serão removidos:
              <br />
              • Agentes configurados
              <br />
              • Templates de mensagens
              <br />
              • Mapeamentos de intenções
              <br />
              • Histórico de conversas
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmDelete}
              variant="destructive"
            >
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SafeBoundary>
  );
}


