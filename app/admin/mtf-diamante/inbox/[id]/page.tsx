'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import MensagensInterativasTab from '@/app/admin/mtf-diamante/components/MensagensInterativasTab';
import MapeamentoTab from '@/app/admin/mtf-diamante/components/MapeamentoTab';
import { DialogflowCaixasAgentes } from '@/app/admin/mtf-diamante/components/DialogflowCaixasAgentes';
import SafeBoundary from '@/components/SafeBoundary';
import { Loader2, Settings, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function InboxDashboardPage() {
  const params = useParams() as { id?: string };
  const caixaId = params?.id ?? '';
  const sp = useSearchParams();
  const initialTab = sp?.get('tab') || 'interativas';
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    if (sp?.get('tab')) setTab(sp.get('tab')!);
  }, [sp]);

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
          <TabsList variant="line">
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
                    <Button variant="outline" size="sm">
                      Abrir Configurações IA
                    </Button>
                  </div>
                  
                  <div className="p-4 border border-border rounded-lg bg-muted/20">
                    <h3 className="font-medium mb-2">Configurações de Canal</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Ajuste as configurações específicas do canal de comunicação
                    </p>
                    <Button variant="outline" size="sm">
                      Configurar Canal
                    </Button>
                  </div>
                  
                  <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/5">
                    <h3 className="font-medium mb-2 text-destructive">Zona de Perigo</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Ações irreversíveis relacionadas a esta caixa de entrada
                    </p>
                    <Button variant="destructive" size="sm">
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
                    <Button variant="outline" size="sm">
                      Exportar Dados
                    </Button>
                    <Button variant="outline" size="sm">
                      Relatório Semanal
                    </Button>
                    <Button variant="outline" size="sm">
                      Análise de Performance
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SafeBoundary>
  );
}


