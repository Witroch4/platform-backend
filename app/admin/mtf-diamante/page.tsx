'use client';

import { useState, useEffect, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

// Tipos
interface WhatsAppConfig {
  id?: string;
  phoneNumberId: string;
  whatsappBusinessAccountId?: string;
  fbGraphApiBase?: string;
  whatsappToken?: string;
  tokenMask?: string;
  hasToken?: boolean;
}

import IntegracoesTab from './components/IntegracoesTab';
import TemplatesTab from './components/TemplatesTab/index';
import ConfiguracoesLoteTab from './components/ConfiguracoesLoteTab';
import { TemplateLibraryTab } from './components/TemplateLibraryTab';
 

const MtfDiamanteContent = () => {
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab');

  // Agora a página concentra apenas Globais/Templates/Library
  const [activeTab, setActiveTab] = useState<string>(tabParam || 'lote');
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
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">MTF Diamante</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList variant="line">
          <TabsTrigger value="lote">Configurações Globais</TabsTrigger>
          <TabsTrigger value="templates">Templates Oficiais</TabsTrigger>
          <TabsTrigger value="library">Template Library</TabsTrigger>
        </TabsList>

        <TabsContent value="lote">
            {loadingConfig ? <Loader2 className="animate-spin" /> : <ConfiguracoesLoteTab configPadrao={configPadrao} onUpdate={fetchConfig} />}
        </TabsContent>

        <TabsContent value="templates">
            <TemplatesTab />
        </TabsContent>

        <TabsContent value="library">
            <TemplateLibraryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const MtfDiamanteAtendimentoPage = () => {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin" /></div>}>
      <MtfDiamanteContent />
    </Suspense>
  );
};

export default MtfDiamanteAtendimentoPage;