# Implementação da Nova Arquitetura de Configurações do WhatsApp

## Visão Geral

Esta implementação introduz uma nova arquitetura que permite vincular configurações do WhatsApp a cada CaixaEntrada específica, com fallback para configuração padrão do usuário.

## Arquitetura Implementada

### 1. Schema do Banco de Dados (Prisma)

#### Modelo WhatsAppConfig
```prisma
model WhatsAppConfig {
  id                        String  @id @default(cuid())
  whatsappToken             String  @db.Text
  whatsappBusinessAccountId String
  fbGraphApiBase            String
  isActive                  Boolean @default(true)
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt

  // Relação principal, sempre presente
  usuarioChatwitId          String
  usuarioChatwit            UsuarioChatwit @relation(fields: [usuarioChatwitId], references: [id], onDelete: Cascade)

  // NOVA RELAÇÃO: Opcional, para configs específicas de uma caixa
  caixaEntradaId            String?        @unique // @unique garante 1 config por caixa
  caixaEntrada              CaixaEntrada?  @relation(fields: [caixaEntradaId], references: [id], onDelete: SetNull)

  @@index([usuarioChatwitId])
  @@index([caixaEntradaId])
}
```

#### Modelo WhatsAppTemplate
```prisma
model WhatsAppTemplate {
  // ... campos existentes ...

  // Relação principal, sempre presente
  usuarioChatwitId           String
  usuarioChatwit             UsuarioChatwit @relation(fields: [usuarioChatwitId], references: [id], onDelete: Cascade)
  
  // NOVA RELAÇÃO: Opcional, para templates específicos de uma caixa
  caixaEntradaId             String?
  caixaEntrada               CaixaEntrada?  @relation(fields: [caixaEntradaId], references: [id], onDelete: SetNull)

  @@index([usuarioChatwitId])
  @@index([caixaEntradaId])
  @@index([name])
}
```

#### Modelo CaixaEntrada
```prisma
model CaixaEntrada {
  id                  String             @id @default(cuid())
  nome                String
  chatwitAccountId    String
  inboxId             String
  inboxName           String
  channelType         String
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  
  // Relação principal com UsuarioChatwit
  usuarioChatwitId    String
  usuarioChatwit      UsuarioChatwit     @relation(fields: [usuarioChatwitId], references: [id], onDelete: Cascade)
  
  // NOVA RELAÇÃO INVERSA
  whatsAppConfig      WhatsAppConfig?
  whatsAppTemplates   WhatsAppTemplate[]
  
  // Relações existentes
  agentes             AgenteDialogflow[]

  @@map("caixa_entrada")
  @@unique([usuarioChatwitId, inboxId])
}
```

### 2. Backend (APIs)

#### Endpoint Principal: `/api/admin/whatsapp-config/route.ts`
- **GET**: Busca configuração com fallback (específica → padrão)
- **POST**: Salva configuração (padrão ou específica por caixa)

#### Endpoint de Caixas: `/api/admin/whatsapp-config/inboxes/route.ts`
- **GET**: Lista todas as caixas com suas configurações

#### Endpoint Específico: `/api/admin/whatsapp-config/[inboxId]/route.ts`
- **GET**: Busca configuração de uma caixa específica

#### Utilitários: `/lib/whatsapp-config.ts`
- `getWhatsAppConfig()`: Busca configuração com fallback
- `getAllWhatsAppConfigs()`: Lista todas as configurações
- `isConfigActive()`: Verifica se configuração está ativa
- `validateWhatsAppConfig()`: Valida configuração

### 3. Frontend (Componentes)

#### Componente Principal: `ApiWhatsApp.tsx`
- Suporta configuração padrão e específica por caixa
- Props: `inboxId`, `onConfigSaved`, `title`
- Lógica de fallback integrada

#### Componente de Gerenciamento: `CaixasDeEntradaConfig.tsx`
- Lista todas as caixas de entrada
- Mostra status de configuração (Configurado/Usando Padrão/Não Configurado)
- Permite configurar API por caixa via modal
- Sugere configuração padrão se não existir

#### Componente de Templates: `TemplatesPorCaixa.tsx`
- Gerencia templates específicos por caixa
- Interface para visualizar e gerenciar templates

#### Página Principal: `app/admin/atendimento/page.tsx`
- Estrutura com abas: "Configuração Padrão" e "Por Caixa de Entrada"
- Interface intuitiva para gerenciar ambas as configurações

## Lógica de Fallback

A implementação segue a premissa: **"Use a configuração específica da Caixa de Entrada. Se não existir, use a configuração padrão do usuário."**

### Fluxo de Busca:
1. Se `caixaEntradaId` fornecido:
   - Busca configuração específica da caixa
   - Se não encontrar, busca configuração padrão
2. Se `caixaEntradaId` não fornecido:
   - Busca apenas configuração padrão

### Fluxo de Salvamento:
1. Se `inboxId` fornecido:
   - Salva como configuração específica da caixa
2. Se `inboxId` não fornecido:
   - Salva como configuração padrão

## Interface do Usuário

### Aba "Configuração Padrão"
- Formulário tradicional para configuração geral
- Usada como fallback para caixas sem configuração específica

### Aba "Por Caixa de Entrada"
- Grid de cards mostrando todas as caixas
- Badges de status (Configurado/Usando Padrão/Não Configurado)
- Botões para configurar API e gerenciar templates
- Modal para configuração específica de cada caixa

## Benefícios da Nova Arquitetura

1. **Flexibilidade**: Cada caixa pode ter sua própria configuração
2. **Simplicidade**: Fallback automático para configuração padrão
3. **Escalabilidade**: Fácil adição de novas caixas
4. **Manutenibilidade**: Código organizado e reutilizável
5. **UX**: Interface intuitiva e clara

## Próximos Passos

1. **Migração do Banco**: Executar `npx prisma migrate dev`
2. **Testes**: Validar funcionalidade com dados reais
3. **Templates**: Implementar gerenciamento completo de templates por caixa
4. **Documentação**: Atualizar documentação da API
5. **Monitoramento**: Adicionar logs para debugging

## Considerações Técnicas

- **Performance**: Índices adicionados para consultas eficientes
- **Segurança**: Validação de propriedade das caixas
- **Compatibilidade**: Mantém compatibilidade com código existente
- **Extensibilidade**: Fácil adição de novos campos e funcionalidades 