# 📋 Guia de Backup e Restauração - Chatwit Social

Este documento explica a estrutura dos backups e como realizar restaurações no sistema Chatwit Social.

## 📁 Estrutura dos Backups

Os backups são salvos em arquivos JSON com a seguinte estrutura:

```json
{
  "metadata": {
    "created_at": "2025-07-13T14:57:57.000Z",
    "database": "faceapp",
    "version": "1.0.0",
    "backup_type": "simple"
  },
  "data": {
    // Tabelas do sistema
  }
}
```

## 🗂️ Tabelas Incluídas no Backup

### 👥 Usuários e Contas
- **users**: Usuários do sistema principal
- **accounts**: Contas de autenticação (Google, Instagram, etc.)
- **usuariosChatwit**: Usuários específicos do sistema Chatwit

### 📊 Chatwit
- **leadsChatwit**: Leads dos usuários Chatwit
- **arquivosLeadChatwit**: Arquivos associados aos leads

### 🤖 Automações
- **automacoes**: Configurações de automação
- **leads**: Leads gerais do sistema
- **leadAutomacao**: Relacionamento entre leads e automações

### 📁 Organização
- **pastas**: Pastas para organização de conteúdo

### 📱 WhatsApp
- **whatsAppConfigs**: Configurações do WhatsApp
- **whatsAppTemplates**: Templates de mensagens

### 📚 Espelhos
- **espelhosBiblioteca**: Espelhos da biblioteca (espelhos personalizados criados pelos usuários)
- **espelhosPadrao**: Espelhos padrão (templates padrão para cada especialidade jurídica)

### 💎 MTF Diamante
- **mtfDiamanteConfigs**: Configurações do MTF Diamante
- **mtfDiamanteLotes**: Lotes do MTF Diamante
- **mtfDiamanteIntentMappings**: Mapeamentos de intenções
- **disparosMtfDiamante**: Disparos realizados

### 🔔 Outros
- **subscriptions**: Assinaturas
- **notifications**: Notificações
- **agendamentos**: Agendamentos
- **midias**: Mídias
- **chats**: Chats
- **messages**: Mensagens

## 🔄 Como Fazer Restauração

### 1. Restauração Completa

```bash
# Executar o seed primeiro
npx prisma db seed

# Restaurar leads para um usuário específico
npx tsx scripts/restore-all-leads-to-amanda.ts

# Restaurar espelhos padrão
npx tsx scripts/restore-espelhos-padrao.ts

# Restaurar espelhos da biblioteca
npx tsx scripts/restore-espelhos-biblioteca.ts
```

### 2. Restauração Manual

Para restaurar dados manualmente, siga estas etapas:

#### Passo 1: Preparar o Banco
```bash
# Resetar o banco (CUIDADO: isso apaga todos os dados)
npx prisma migrate reset

# Executar o seed
npx prisma db seed
```

#### Passo 2: Restaurar UsuarioChatwit
```typescript
// Exemplo de restauração de UsuarioChatwit
await prisma.usuarioChatwit.create({
  data: {
    appUserId: "ID_DO_USER", // ID do usuário no sistema principal
    name: "Nome do Usuário",
    accountName: "Nome da Conta",
    channel: "Whatsapp", // ou "Api"
    inboxId: 4,
    inboxName: "WhatsApp - ANA",
    chatwitAccountId: "3", // ID da conta no Chatwit
  }
});
```

#### Passo 3: Restaurar Leads
```typescript
// Exemplo de restauração de LeadChatwit
await prisma.leadChatwit.create({
  data: {
    sourceId: "ID_DO_LEAD_NO_CHATWIT",
    name: "Nome do Lead",
    phoneNumber: "+5511999999999",
    email: "lead@email.com",
    usuarioId: "ID_DO_USUARIO_CHATWIT",
    // ... outros campos
  }
});
```

#### Passo 4: Restaurar Arquivos
```typescript
// Exemplo de restauração de ArquivoLeadChatwit
await prisma.arquivoLeadChatwit.create({
  data: {
    fileType: "image", // ou "pdf"
    dataUrl: "URL_DO_ARQUIVO",
    pdfConvertido: "URL_DO_PDF_CONVERTIDO", // opcional
    leadId: "ID_DO_LEAD",
  }
});
```

## 📋 Campos Importantes

### UsuarioChatwit
- **appUserId**: ID do usuário no sistema principal (User.id)
- **chatwitAccountId**: ID da conta no sistema Chatwit (obrigatório)
- **name**: Nome do usuário
- **accountName**: Nome da conta
- **channel**: Canal (Whatsapp, Api, etc.)
- **inboxId**: ID da caixa de entrada
- **inboxName**: Nome da caixa de entrada

### LeadChatwit
- **sourceId**: ID único do lead no sistema Chatwit
- **usuarioId**: ID do UsuarioChatwit (obrigatório)
- **name**: Nome do lead
- **phoneNumber**: Número de telefone
- **email**: Email do lead
- **concluido**: Se o lead foi concluído
- **anotacoes**: Anotações sobre o lead

### ArquivoLeadChatwit
- **leadId**: ID do LeadChatwit (obrigatório)
- **fileType**: Tipo do arquivo (image, pdf)
- **dataUrl**: URL do arquivo
- **pdfConvertido**: URL do PDF convertido (se aplicável)

### EspelhoPadrao
- **especialidade**: Especialidade jurídica (CIVIL, CONSTITUCIONAL, etc.)
- **nome**: Nome do espelho padrão
- **descricao**: Descrição opcional
- **textoMarkdown**: Texto do espelho em formato Markdown
- **espelhoCorrecao**: Lista de URLs das imagens do espelho em formato JSON
- **isAtivo**: Se o espelho está ativo
- **totalUsos**: Contador de quantas vezes foi usado
- **processado**: Se o espelho foi processado
- **aguardandoProcessamento**: Se está aguardando processamento
- **atualizadoPorId**: ID do UsuarioChatwit que atualizou por último

### EspelhoBiblioteca
- **nome**: Nome identificador do espelho
- **descricao**: Descrição opcional do espelho
- **textoDOEspelho**: Texto do espelho de correção (JSON)
- **espelhoCorrecao**: Lista de URLs das imagens do espelho em formato JSON
- **isAtivo**: Se o espelho está ativo na biblioteca
- **totalUsos**: Contador de quantas vezes foi usado
- **espelhoBibliotecaProcessado**: Se o espelho da biblioteca foi processado
- **aguardandoEspelho**: Se está aguardando processamento do espelho
- **criadoPorId**: ID do UsuarioChatwit que criou o espelho

## ⚠️ Observações Importantes

1. **Ordem de Restauração**: Sempre restaure primeiro os usuários, depois os leads e por último os arquivos
2. **Relacionamentos**: Mantenha os relacionamentos entre as tabelas
3. **IDs Únicos**: Não reutilize IDs existentes, deixe o Prisma gerar novos
4. **Campos Obrigatórios**: Certifique-se de preencher todos os campos obrigatórios
5. **Backup Antes**: Sempre faça um backup antes de qualquer restauração

## 🛠️ Scripts Disponíveis

- `scripts/backup-simple.ts`: Cria backup completo do sistema
- `scripts/restore-all-leads-to-amanda.ts`: Restaura todos os leads para a Amanda
- `scripts/restore-espelhos-padrao.ts`: Restaura os espelhos padrão do backup
- `scripts/restore-espelhos-biblioteca.ts`: Restaura os espelhos da biblioteca do backup
- `prisma/seed.ts`: Seed inicial do banco de dados

## 📞 Suporte

Em caso de dúvidas ou problemas durante a restauração, consulte a documentação do Prisma ou entre em contato com a equipe de desenvolvimento. 