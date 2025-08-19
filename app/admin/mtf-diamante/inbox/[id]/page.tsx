'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import MensagensInterativasTab from '@/app/admin/mtf-diamante/components/MensagensInterativasTab';
import MapeamentoTab from '@/app/admin/mtf-diamante/components/MapeamentoTab';
import { DialogflowCaixasAgentes } from '@/app/admin/mtf-diamante/components/DialogflowCaixasAgentes';
import SafeBoundary from '@/components/SafeBoundary';
import { Loader2 } from 'lucide-react';

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
          <TabsList>
            <TabsTrigger value="interativas">Mensagens Interativas</TabsTrigger>
            <TabsTrigger value="mapeamento">Mapeamento</TabsTrigger>
            <TabsTrigger value="agentes">Agentes</TabsTrigger>
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
        </Tabs>
      </div>
    </SafeBoundary>
  );
}


