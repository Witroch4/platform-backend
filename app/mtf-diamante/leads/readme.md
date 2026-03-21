# Melhorias no Sistema de Gerenciamento de Leads do Chatwit

Este documento descreve as melhorias implementadas no sistema de gerenciamento de leads do Chatwit.

## 1. Tratamento de Erro na Conversão de PDF para Imagem

### Problemas Corrigidos
- Tratamento de URLs inválidas durante o processo de conversão
- Validação e sanitização de URLs antes de utilizar em operações com o MinIO
- Implementação de logs detalhados para facilitar o diagnóstico de problemas

### Componentes Implementados
- `isValidUrl` e `sanitizeUrl` em `app/lib/utils/url.ts` para validação de URLs
- Classe `MinioClient` em `app/lib/minio.ts` para gerenciar conexões com o MinIO
- Sistema de logs em `app/lib/log.ts` para registro detalhado de operações

## 2. Exibição dos Dados do Lead

### Melhorias
- Campo não editável para o nome vindo do ChatWit
- Campo editável para o nome real
- Exibição do nome real abaixo do nome do ChatWit na lista de leads quando alterado

### Componentes Atualizados
- `LeadForm` - Adicionado campo não editável para o nome do ChatWit
- `LeadItem` - Exibição do nome real abaixo do nome do ChatWit quando disponível

## 3. Menu de Contexto (Context Menu)

### Implementação
- Menu de contexto com Shadcn UI para diferentes áreas da aplicação
- Opções contextuais dependendo do tipo de item clicado

### Opções do Menu
- **Geral**: Atualizar Lista, Abrir Lead
- **PDF**: Reunificar Arquivos
- **Imagens**: Reconverter para Imagem
- **Arquivos**: Excluir Arquivo

### Componentes Implementados
- `LeadContextMenu` em `app/admin/leads-chatwit/components/lead-context-menu.tsx`

## 4. Botão de Exclusão de Arquivo

### Implementação
- Botão X vermelho no canto superior de cada arquivo
- Confirmação antes da exclusão
- Tamanho aumentado para facilitar o clique

### Componentes Implementados
- `DeleteFileButton` em `app/admin/leads-chatwit/components/delete-file-button.tsx`

## 5. API para Exclusão de Arquivos

### Funcionalidades
- Rota API para exclusão de diferentes tipos de arquivos:
  - Arquivos individuais
  - PDF unificado
  - Imagens convertidas
- Remoção do arquivo do banco de dados e do MinIO

### Rotas Implementadas
- `DELETE /api/admin/leads-chatwit/arquivos` com parâmetros:
  - `id` e `type=arquivo` para arquivos individuais
  - `leadId` e `type=pdf` para PDFs unificados
  - `leadId` e `type=imagem` para imagens convertidas

## Próximos Passos

1. Testes completos da nova funcionalidade
2. Monitoramento de logs para identificar possíveis problemas
3. Expandir as melhorias para outras áreas do sistema 