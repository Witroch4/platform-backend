'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

// Tipos
interface WhatsAppConfig {
  id?: string;
  phoneNumberId: string;
  token: string;
}

import IntegracoesTab from './components/IntegracoesTab';
import TemplatesTab from './components/TemplatesTab/index';
import MensagensInterativasTab from './components/MensagensInterativasTab';
import MapeamentoTab from './components/MapeamentoTab';
import ConfiguracoesLoteTab from './components/ConfiguracoesLoteTab';
import { TemplateLibraryTab } from './components/TemplateLibraryTab';
import { MtfDataProvider } from './context/MtfDataProvider';

const MtfDiamanteAtendimentoPage = () => {
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab');
  
  const [activeTab, setActiveTab] = useState<string>(tabParam || 'integracoes');
  const [selectedCaixaId, setSelectedCaixaId] = useState<string | null>(null);
  const [configPadrao, setConfigPadrao] = useState<WhatsAppConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const fetchConfig = async () => {
    setLoadingConfig(true);
    try {
      const response = await fetch('/api/admin/mtf-diamante/configuracoes');
      if (!response.ok) throw new Error('Falha ao buscar configurações globais.');
      const data = await response.json();
      setConfigPadrao(data.configPadrao || null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    // Executa o seed automático das variáveis MTF Diamante
    const initializeMtfVariaveis = async () => {
      try {
        await fetch('/api/admin/mtf-diamante/variaveis/seed', {
          method: 'POST'
        });
      } catch (error) {
        console.error('Erro no seed automático:', error);
      }
    };

    initializeMtfVariaveis();
    fetchConfig();
    
    // Se vier um parâmetro de tab na URL, ativar essa tab
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]); // Removida dependência fetchConfig para evitar re-renders

  return (
    <MtfDataProvider>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">MTF Diamante - Configurações de Atendimento</h2>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="integracoes">Caixas de Entrada</TabsTrigger>
            <TabsTrigger value="lote">Configurações Globais</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="library">Template Library</TabsTrigger>
            <TabsTrigger value="interativas" disabled={!selectedCaixaId}>Mensagens Interativas</TabsTrigger>
            <TabsTrigger value="mapeamento" disabled={!selectedCaixaId}>Mapeamento</TabsTrigger>
          </TabsList>

          <TabsContent value="integracoes">
            <IntegracoesTab onCaixaSelected={setSelectedCaixaId} />
          </TabsContent>

          <TabsContent value="lote">
              {loadingConfig ? <Loader2 className="animate-spin" /> : <ConfiguracoesLoteTab configPadrao={configPadrao} onUpdate={fetchConfig} />}
          </TabsContent>
          
          <TabsContent value="templates">
              <TemplatesTab />
          </TabsContent>
          
          <TabsContent value="library">
              <TemplateLibraryTab />
          </TabsContent>
          
          <TabsContent value="interativas">
              {selectedCaixaId ? <MensagensInterativasTab caixaId={selectedCaixaId} /> : <EmptyStateTab />}
          </TabsContent>
          <TabsContent value="mapeamento">
              {selectedCaixaId ? <MapeamentoTab caixaId={selectedCaixaId} /> : <EmptyStateTab />}
          </TabsContent>
        </Tabs>
      </div>
    </MtfDataProvider>
  );
};

const EmptyStateTab = () => (
    <div className="text-center text-gray-500 py-12 border-2 border-dashed rounded-lg">
        <p className="font-semibold">Nenhuma caixa de entrada selecionada.</p>
        <p className="text-sm">Vá para a aba "Caixas de Entrada" e selecione uma para configurar.</p>
    </div>
);

export default MtfDiamanteAtendimentoPage;