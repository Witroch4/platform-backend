# Guia de Integração - Sistema de Transcrição com Progresso em Tempo Real

Este documento descreve como integrar os novos componentes de transcrição no frontend.

## 📋 Componentes Criados

### 1. Hook: `useTranscriptionProgress`
**Arquivo:** `app/admin/leads-chatwit/hooks/useTranscriptionProgress.ts`

Monitora o progresso de transcrição via SSE.

**Uso:**
```tsx
import { useTranscriptionProgress } from '../hooks/useTranscriptionProgress';

const { status, history, isProcessing, isCompleted } = useTranscriptionProgress({
  leadID: 'lead-id-aqui',
  enabled: true,
  onComplete: (result) => {
    console.log('Transcrição concluída:', result);
    // Atualizar UI
  },
  onError: (error) => {
    toast.error('Erro na digitação', { description: error });
  },
});
```

### 2. Componente: `TranscriptionPanel`
**Arquivo:** `app/admin/leads-chatwit/components/transcription-panel.tsx`

Painel flutuante que mostra todas as digitações em andamento.

**Uso:**
```tsx
import { TranscriptionPanel } from './components/transcription-panel';

// No componente LeadsList ou similar
const [transcriptions, setTranscriptions] = useState<TranscriptionStatus[]>([]);

<TranscriptionPanel
  transcriptions={transcriptions}
  onViewDetails={(leadID) => {
    // Abrir dialog de detalhes
    setSelectedLeadForDetails(leadID);
    setShowDetails(true);
  }}
  onDismiss={(leadID) => {
    // Remover da lista
    setTranscriptions(prev => prev.filter(t => t.leadID !== leadID));
  }}
  onClose={() => {
    // Fechar painel
    setShowPanel(false);
  }}
/>
```

### 3. Componente: `TranscriptionDetailsDialog`
**Arquivo:** `app/admin/leads-chatwit/components/transcription-details-dialog.tsx`

Modal com detalhes e timeline da transcrição.

**Uso:**
```tsx
import { TranscriptionDetailsDialog } from './components/transcription-details-dialog';

<TranscriptionDetailsDialog
  open={showDetails}
  onOpenChange={setShowDetails}
  transcription={selectedTranscription}
  history={selectedHistory}
  onCancel={async (leadID) => {
    await fetch(`/api/admin/leads-chatwit/transcription/${leadID}/cancel`, {
      method: 'DELETE',
    });
    toast.success('Digitação cancelada');
  }}
/>
```

## 🎯 Integração Passo a Passo

### Passo 1: Adicionar Provider de Transcrições (leads-list.tsx)

No componente `LeadsList`, adicione gerenciamento de transcrições:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { TranscriptionPanel } from './transcription-panel';
import { TranscriptionDetailsDialog } from './transcription-details-dialog';
import type { TranscriptionStatus } from '../hooks/useTranscriptionProgress';

export function LeadsList() {
  // Estados para gerenciar transcrições
  const [transcriptions, setTranscriptions] = useState<TranscriptionStatus[]>([]);
  const [selectedLeadForDetails, setSelectedLeadForDetails] = useState<string | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  // Escutar eventos SSE de todos os leads com digitação em andamento
  useEffect(() => {
    // TODO: Conectar ao SSE e atualizar transcriptions quando receber eventos
    // Ver exemplo abaixo
  }, []);

  return (
    <>
      {/* Lista de leads existente */}
      {/* ... */}

      {/* Painel flutuante de transcrições */}
      {transcriptions.length > 0 && (
        <TranscriptionPanel
          transcriptions={transcriptions}
          onViewDetails={(leadID) => {
            setSelectedLeadForDetails(leadID);
            setShowDetailsDialog(true);
          }}
          onDismiss={(leadID) => {
            setTranscriptions(prev => prev.filter(t => t.leadID !== leadID));
          }}
        />
      )}

      {/* Dialog de detalhes */}
      <TranscriptionDetailsDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        transcription={transcriptions.find(t => t.leadID === selectedLeadForDetails) || null}
        history={[]} // TODO: Buscar histórico do lead
        onCancel={async (leadID) => {
          // TODO: Implementar cancelamento
          console.log('Cancelar digitação:', leadID);
        }}
      />
    </>
  );
}
```

### Passo 2: Adicionar Badge de Progresso no LeadItem

No componente que renderiza cada lead individual, adicione badge visual:

```tsx
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useTranscriptionProgress } from '../hooks/useTranscriptionProgress';

export function LeadItem({ lead }) {
  const { status, isProcessing } = useTranscriptionProgress({
    leadID: lead.id,
    enabled: lead.aguardandoManuscrito || false,
  });

  return (
    <div className="lead-card">
      {/* Conteúdo existente */}

      {/* Badge de progresso */}
      {isProcessing && (
        <Badge variant="default" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Digitando... {status.percentage ?? 0}%
        </Badge>
      )}

      {lead.aguardandoManuscrito && !isProcessing && (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Aguardando processamento
        </Badge>
      )}
    </div>
  );
}
```

### Passo 3: Gerenciar Estado de Transcrições

Crie um hook customizado para gerenciar todas as transcrições:

```tsx
// app/admin/leads-chatwit/hooks/useTranscriptionManager.ts
import { useState, useEffect, useCallback } from 'react';
import type { TranscriptionStatus } from './useTranscriptionProgress';

export function useTranscriptionManager(leads: any[]) {
  const [transcriptions, setTranscriptions] = useState<TranscriptionStatus[]>([]);

  // Inicializar transcrições para leads em aguardandoManuscrito
  useEffect(() => {
    const leadsAguardando = leads.filter(lead => lead.aguardandoManuscrito);

    leadsAguardando.forEach(lead => {
      // Adicionar à lista de transcrições se não existir
      setTranscriptions(prev => {
        if (prev.some(t => t.leadID === lead.id)) return prev;

        return [
          ...prev,
          {
            leadID: lead.id,
            status: 'processing',
            currentPage: 0,
            totalPages: 0,
            percentage: 0,
          },
        ];
      });
    });
  }, [leads]);

  const updateTranscription = useCallback((leadID: string, update: Partial<TranscriptionStatus>) => {
    setTranscriptions(prev =>
      prev.map(t => (t.leadID === leadID ? { ...t, ...update } : t))
    );
  }, []);

  const removeTranscription = useCallback((leadID: string) => {
    setTranscriptions(prev => prev.filter(t => t.leadID !== leadID));
  }, []);

  return {
    transcriptions,
    updateTranscription,
    removeTranscription,
  };
}
```

## 🔔 Notificações de Conclusão

Quando uma digitação é concluída, exibir toast não-invasivo:

```tsx
import { toast } from 'sonner';

// No callback onComplete do useTranscriptionProgress
onComplete: (result) => {
  toast.success('Digitação concluída!', {
    description: `${result.totalPages} páginas processadas em ${(result.processingTimeMs / 1000).toFixed(1)}s`,
    action: {
      label: 'Ver detalhes',
      onClick: () => {
        // Abrir dialog de detalhes ou navegar para o lead
        window.location.href = `#lead-${result.leadID}`;
      },
    },
  });

  // Atualizar lead na lista
  mutate('/api/admin/leads-chatwit');
}
```

## 🎨 Estilos e Temas

Os componentes usam Shadcn/UI e são compatíveis com tema dark/light automaticamente.

**Customizações:**
- Cores do badge: `variant="default"` (azul), `variant="secondary"` (cinza), `variant="destructive"` (vermelho)
- Tamanho do painel: Ajustar `className="w-96"` em TranscriptionPanel
- Posição do painel: Alterar `className="fixed bottom-4 right-4"` para outras posições

## ⚙️ Configurações

As configurações estão em [config.yml](../config.yml):

```yaml
oab_eval:
  agentelocal: true
  transcribe_concurrency: 10
  queue:
    max_concurrent_jobs: 3
    job_timeout: 300000
    retry_attempts: 2
  debug:
    enabled: true
    log_prompts: true
```

## 🐛 Debugging

### Logs importantes:
- `[TranscriptionQueue]` - Fila de transcrição
- `[TranscriptionAgent]` - Agente local de digitação
- `[SSE Manager]` - Conexões SSE
- `[useTranscriptionProgress]` - Hook de progresso

### Eventos SSE:
```
data: {"category":"transcription","event":{"type":"queued","position":1}}
data: {"category":"transcription","event":{"type":"started","totalPages":10}}
data: {"category":"transcription","event":{"type":"page-complete","page":3,"totalPages":10,"percentage":30}}
data: {"category":"transcription","event":{"type":"completed","result":{...}}}
```

## 📊 Monitoramento

**Métricas disponíveis:**
- Número de digitações em fila: `GET /api/admin/oab/transcription/metrics`
- Status de um job: `GET /api/admin/oab/transcription/status/:leadId`
- Cancelar job: `DELETE /api/admin/oab/transcription/:leadId`

## ✅ Checklist de Integração

- [ ] Adicionar `TranscriptionPanel` no LeadsList
- [ ] Adicionar `TranscriptionDetailsDialog`
- [ ] Implementar badge de progresso em LeadItem
- [ ] Criar hook `useTranscriptionManager`
- [ ] Conectar SSE para atualizar transcrições
- [ ] Adicionar toasts de conclusão
- [ ] Testar com múltiplas digitações simultâneas
- [ ] Verificar responsividade mobile
- [ ] Testar tema dark/light
- [ ] Validar cancelamento de jobs

## 🚀 Próximos Passos

1. **Testes E2E**: Criar testes para fluxo completo de digitação
2. **Analytics**: Adicionar métricas de tempo médio de digitação
3. **Histórico**: Persistir histórico de transcrições no banco
4. **Notificações Push**: Integrar com notificações do navegador
5. **Priorização**: Permitir usuário aumentar prioridade de um job

---

**Implementação concluída em:** `2025-10-02`
**Versão do sistema:** Next.js 15 + TypeScript
**Autor:** Claude Code Assistant
