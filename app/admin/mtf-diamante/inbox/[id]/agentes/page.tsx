'use client';

import { DialogflowCaixasAgentes } from '@/app/admin/mtf-diamante/components/DialogflowCaixasAgentes';
import { useParams } from 'next/navigation';

export default function InboxAgentesPage() {
  const params = useParams() as { id?: string };
  const caixaId = params?.id ?? '';
  if (!caixaId) return null;
  // Renderiza apenas a caixa específica, sem toolbar
  return (
    <DialogflowCaixasAgentes onCaixaSelected={() => {}} filterCaixaId={caixaId} hideToolbar />
  );
}


