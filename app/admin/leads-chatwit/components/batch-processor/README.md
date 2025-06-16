# Sistema de Processamento de Leads em Lote - Orquestrador Inteligente

Este sistema foi refatorado para ser um **orquestrador inteligente** que analisa o estado dos leads no banco de dados e executa apenas as etapas necessárias, minimizando a intervenção do usuário.

## 🔧 Arquitetura do Sistema

### Fluxo de 5 Passos Inteligentes

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

#### **Passo 3: Execução com Intervenção (Manuscrito e Espelho)**
- Abre diálogos existentes sequencialmente para seleção de imagens
- **Manuscritos**: `BatchManuscritoDialog` para cada lead que precisa
- **Espelhos**: `BatchEspelhoDialog` para cada lead que precisa
- O usuário seleciona as imagens e o sistema envia automaticamente

#### **Passo 4: Análise Preliminar Automatizada**
- **Condição**: SÓ executa para leads que possuem `provaManuscrita` E `textoDOEspelho`
- Dispara análise em segundo plano para leads elegíveis
- **Interface**: `AutomatedProgressDialog` - "Enviando para análise preliminar: Lead X de Y"

#### **Passo 5: Conclusão e Relatório Final**
- Fecha diálogos ativos
- Exibe `BatchCompletionDialog` com estatísticas detalhadas
- **Relatório de leads não processados**: Informa sobre leads que não puderam ter análise preliminar por falta de dados

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