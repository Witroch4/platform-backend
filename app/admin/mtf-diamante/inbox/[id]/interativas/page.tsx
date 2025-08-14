'use client';

import MensagensInterativasTab from '@/app/admin/mtf-diamante/components/MensagensInterativasTab';
import { useParams } from 'next/navigation';

export default function InboxInterativasPage() {
  const params = useParams() as { id?: string };
  const caixaId = params?.id ?? '';
  if (!caixaId) return null;
  return <MensagensInterativasTab caixaId={caixaId} />;
}


