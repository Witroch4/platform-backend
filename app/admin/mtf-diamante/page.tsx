'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

// Tipos
interface WhatsAppConfig {
  id?: string;
  phoneNumberId: string;
  token: string;
}

import IntegracoesTab from './components/IntegracoesTab';
import TemplatesTab from './components/TemplatesTab';
import MensagensInterativasTab from './components/MensagensInterativasTab';
import MapeamentoTab from './components/MapeamentoTab';
import ConfiguracoesLoteTab from './components/ConfiguracoesLoteTab';

const MtfDiamanteAtendimentoPage = () => {
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
    fetchConfig();
  }, []);

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">MTF Diamante - Configurações de Atendimento</h2>
      </div>

      <Tabs defaultValue="integracoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="integracoes">Caixas de Entrada</TabsTrigger>
          <TabsTrigger value="lote">Configurações Globais</TabsTrigger>
          <TabsTrigger value="templates" disabled={!selectedCaixaId}>Templates</TabsTrigger>
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
            {selectedCaixaId ? <TemplatesTab caixaId={selectedCaixaId} /> : <EmptyStateTab />}
        </TabsContent>
        <TabsContent value="interativas">
            {selectedCaixaId ? <MensagensInterativasTab caixaId={selectedCaixaId} /> : <EmptyStateTab />}
        </TabsContent>
        <TabsContent value="mapeamento">
            {selectedCaixaId ? <MapeamentoTab caixaId={selectedCaixaId} /> : <EmptyStateTab />}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const EmptyStateTab = () => (
    <div className="text-center text-gray-500 py-12 border-2 border-dashed rounded-lg">
        <p className="font-semibold">Nenhuma caixa de entrada selecionada.</p>
        <p className="text-sm">Vá para a aba "Caixas de Entrada" e selecione uma para configurar.</p>
    </div>
);

export default MtfDiamanteAtendimentoPage;