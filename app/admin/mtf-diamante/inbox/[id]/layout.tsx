'use client';

import type React from 'react';
import { MtfDataProvider } from '@/app/admin/mtf-diamante/context/MtfDataProvider';

// Usa o layout de /app/admin/layout.tsx como contêiner único de sidebar.
// Este layout aninhado apenas renderiza o conteúdo da página.
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return <MtfDataProvider>{children}</MtfDataProvider>;
}


