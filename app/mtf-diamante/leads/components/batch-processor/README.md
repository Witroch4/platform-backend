# Sistema de Processamento de Leads em Lote - Orquestrador Inteligente

Este sistema foi refatorado para ser um **orquestrador inteligente** que analisa o estado dos leads no banco de dados e executa apenas as etapas necessárias, minimizando a intervenção do usuário.

## 🔧 Arquitetura do Sistema

### Fluxo Atual do Batch

#### **Passo 1: Análise e Enfileiramento**
- Analisa cada lead selecionado no banco de dados
- Verifica quais operações são necessárias baseado nos campos:
  - `pdfUnificado` (nulo/vazio = precisa unificar)
  - `imagensConvertidas` (nulo/vazio = precisa gerar imagens)
  - `provaManuscrita` (nulo/vazio + tem imagensConvertidas = precisa processar manuscrito)
  - `textoDOEspelho` (nulo/vazio + tem imagensConvertidas = precisa processar espelho)
  - `analisePreliminar` (nulo/vazio + manuscrito E espelho = pode analisar)
- Cria filas de processamento para cada tipo de tarefa
- **Importante**: Manuscritos e espelhos só são processados se há imagens convertidas disponíveis

#### **Passo 2: Execução Automatizada (PDF e Imagens)**
- Processa unificação de PDF para todos os leads que precisam
- Gera imagens a partir dos PDFs unificados
- **Interface**: `AutomatedProgressDialog` - não interativo, progresso contínuo
- Mostra feedback visual: "Unificando PDF do Lead X de Y" / "Gerando Imagens do Lead X de Y"

#### **Passo 3: Seleção de Imagens para Digitação**
- Abre o seletor de imagens lead a lead apenas para manuscritos
- O usuário escolhe quais páginas enviar para digitação de cada prova
- As seleções ficam acumuladas internamente até o último lead

#### **Passo 4: Despacho Paralelo para Digitação**
- Depois da última seleção, o batch dispara múltiplos envios em paralelo para `/api/admin/leads-chatwit/enviar-manuscrito`
- O fluxo termina aqui: não entra em espelho nem análise preliminar
- O processamento pesado segue na fila `oab-transcription`, com retry no BullMQ e fallback do agente para OpenAI

#### **Passo 5: Conclusão e Relatório Final**
- Fecha diálogos ativos
- Exibe `BatchCompletionDialog` com estatísticas de PDFs, imagens e digitações enfileiradas

## Variáveis de Ambiente Relevantes

- `NEXT_PUBLIC_OAB_EVAL_BATCH_DISPATCH_CONCURRENCY`: quantidade de leads enviados em paralelo pelo batch na UI. Padrão: `10`.
- `OAB_EVAL_TRANSCRIBE_CONCURRENCY`: quantidade de imagens/páginas processadas em paralelo dentro de cada lead. Padrão atual: `30`.
- `OAB_EVAL_MAX_CONCURRENT_JOBS`: quantidade de jobs de digitação executados simultaneamente no worker. Padrão atual: `10`.
- `OAB_EVAL_RETRY_ATTEMPTS`: retries do BullMQ para cada job de digitação. Padrão atual: `4`.
- `OAB_EVAL_RETRY_BACKOFF_MS`: backoff exponencial inicial entre retries do BullMQ. Padrão atual: `3000`.
- `OAB_EVAL_RATE_LIMIT_MAX`: limite de jobs liberados por janela do limiter da fila. Padrão atual: `10`.
- `OAB_EVAL_RATE_LIMIT_DURATION_MS`: duração da janela do limiter da fila em ms. Padrão atual: `1000`.

## 📁 Componentes

### Novos Componentes

#### `AutomatedProgressDialog.tsx`
```tsx
// Diálogo para tarefas automatizadas em segundo plano
- Sem botões de ação para o usuário
- Controlado programaticamente
- Exibe etapa atual e progresso numérico
- Tipos de steps: 'unifying-pdf' | 'generating-images' | 'preliminary-analysis'
```

### Componentes Modificados

#### `useLeadBatchProcessor.ts`
- **Nova lógica de orquestração inteligente**
- Análise de estado dos leads e criação de filas
- Gerenciamento de estatísticas de processamento
- Estados para diálogos automatizados vs manuais

#### `BatchProcessorOrchestrator.tsx`  
- **Orquestração dos 5 passos**
- Roteamento inteligente entre diálogos automatizados e manuais
- Integração com `AutomatedProgressDialog`

#### `BatchCompletionDialog.tsx`
- **Relatório detalhado de conclusão**
- Estatísticas visuais de tarefas completadas
- Alerta para leads com análise preliminar pendente

## 🎯 Benefícios da Refatoração

### ✅ Automação Inteligente
- Verifica estado real dos leads no banco de dados
- Executa apenas tarefas necessárias
- Reduz intervenção manual desnecessária

### ✅ Feedback Claro
- Progresso em tempo real para tarefas automatizadas
- Relatório final com estatísticas detalhadas
- Alertas sobre pendências

### ✅ Eficiência
- Processamento em lote otimizado
- Ordem correta de execução (PDF → Imagens → Manuscrito → Espelho → Análise)
- Evita reprocessamento desnecessário

### ✅ Robustez
- Tratamento de erros por lead individual
- Continua processamento mesmo com falhas isoladas
- Relatório de status final completo

## 🔄 Fluxo de Uso

1. **Usuário seleciona leads** e inicia processamento
2. **Sistema analisa** estado de cada lead (automático)
3. **Unifica PDFs** para leads necessários (automático)
4. **Gera imagens** para leads necessários (automático)
5. **Solicita seleção de manuscritos** (manual, se necessário)
6. **Solicita seleção de espelhos** (manual, se necessário)  
7. **Executa análise preliminar** para leads elegíveis (automático)
8. **Exibe relatório final** com estatísticas e pendências

## 🚀 Como Usar

```tsx
import { BatchProcessorOrchestrator } from './batch-processor/BatchProcessorOrchestrator'

// Em seu componente pai
<BatchProcessorOrchestrator 
  leads={selectedLeads}
  onClose={() => setShowBatchProcessor(false)}
/>
```

O sistema automaticamente:
- Analisa os leads selecionados
- Determina quais etapas são necessárias  
- Executa o processamento otimizado
- Fornece feedback detalhado
- Gera relatório final completo 