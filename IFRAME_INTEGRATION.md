# 🖼️ Integração Iframe - Socialwise Dashboard

## 📋 **Resumo**

Sistema completo para integração do dashboard Socialwise dentro do Chatwit via iframe, com autenticação baseada em URLs autorizadas e comunicação via postMessage.

## ✅ **Funcionalidades Implementadas**

### 🔐 **Sistema de Autenticação**
- ✅ Verificação automática de domínio referrer
- ✅ Lista de domínios padrão autorizados (incluindo Chatwit)
- ✅ Gerenciamento de URLs autorizadas via SUPERADMIN
- ✅ Logs de auditoria para todos os acessos

### 🎨 **Interface Iframe**
- ✅ Layout isolado sem interferir no sistema principal
- ✅ Dashboard completo adaptado para iframe
- ✅ Navegação funcional entre páginas
- ✅ Indicador visual de "Modo Iframe"

### 📡 **Comunicação PostMessage**
- ✅ Listener para comandos do Chatwit
- ✅ Envio de contexto para o aplicativo pai
- ✅ Segurança baseada em origem verificada

### ⚙️ **Gerenciamento SUPERADMIN**
- ✅ Interface para adicionar/editar/remover domínios
- ✅ Ativação/desativação de domínios
- ✅ Visualização de logs de acesso
- ✅ URL do iframe para configuração

## 🚀 **Como Usar**

### **1. Para Usuários Chatwit**

#### **URL do Iframe:**
```
https://seu-dominio.com/iframe/admin
```

#### **Configuração no Chatwit:**
1. Acesse **Configurações > Integrações > Dashboard Apps**
2. Clique em **"Novo Aplicativo"**
3. **Título:** "Socialwise Dashboard"
4. **URL:** `https://seu-dominio.com/iframe/admin`
5. Salve a configuração

### **2. Para Administradores Socialwise**

#### **Configurar Domínios Autorizados:**
1. Acesse `/iframe/admin/iframe-config` (apenas SUPERADMIN)
2. Clique em **"Novo Domínio"**
3. Adicione a URL completa: `https://chatwit.witdev.com.br`
4. Adicione uma descrição opcional
5. Salve a configuração

#### **URLs Padrão Autorizadas:**
- `https://chatwit.witdev.com.br` (Chatwit produção)
- `http://localhost:3000` (desenvolvimento)
- `https://localhost:3000` (desenvolvimento SSL)

## 🔧 **Estrutura Técnica**

### **Arquivos Criados:**

```
app/iframe/
├── layout.tsx                     # Layout isolado para iframe
├── admin/
│   ├── page.tsx                   # Dashboard principal iframe
│   └── iframe-config/
│       └── page.tsx               # Configuração domínios (SUPERADMIN)

app/api/
├── iframe/
│   └── auth-check/
│       └── route.ts               # Verificação de autorização
└── admin/iframe/authorized-domains/
    └── route.ts                   # CRUD domínios autorizados

prisma/schema.prisma               # Modelo IframeAuthorizedDomain
```

### **Banco de Dados:**

#### **Modelo `IframeAuthorizedDomain`:**
```prisma
model IframeAuthorizedDomain {
  id          String   @id @default(cuid())
  domain      String   @unique
  description String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   String
  user        User     @relation(fields: [createdBy], references: [id])
}
```

## 🔒 **Segurança**

### **Verificações Implementadas:**
1. **Verificação de Referrer:** Apenas domínios autorizados podem acessar
2. **Logs de Auditoria:** Todos os acessos são registrados
3. **CSP Headers:** Frame-ancestors configurado no layout
4. **Validação de Origem:** PostMessage verifica origem antes de responder

### **Headers de Segurança:**
```html
<meta httpEquiv="Content-Security-Policy" 
      content="frame-ancestors 'self' https://chatwit.witdev.com.br https://*.witdev.com.br;" />
```

## 🔄 **Comunicação PostMessage**

### **Chatwit → Socialwise:**
```javascript
// Solicitar contexto
window.postMessage('chatwoot-dashboard-app:fetch-info', '*');
```

### **Socialwise → Chatwit:**
```javascript
// Resposta com contexto
{
  user: { id, name, email, role },
  pathname: "/iframe/admin/...",
  timestamp: "2024-01-01T00:00:00.000Z"
}
```

## 📊 **Monitoramento**

### **Logs de Auditoria:**
- **iframe_access_authorized:** Acesso autorizado
- **iframe_access_denied:** Tentativa negada
- **iframe_domain_created:** Domínio adicionado
- **iframe_domain_updated:** Domínio modificado
- **iframe_domain_deleted:** Domínio removido

### **Dados Registrados:**
- Referrer URL
- User Agent
- Timestamp
- IP Address (se disponível)
- Ações de CRUD nos domínios

## 🚨 **Resolução de Problemas**

### **"Acesso Não Autorizado"**
1. Verificar se o domínio está na lista autorizada
2. Confirmar que o domínio está ativo
3. Verificar logs de auditoria para detalhes

### **"Página não carrega no iframe"**
1. Verificar CSP headers
2. Confirmar que o domínio pai está configurado
3. Testar acesso direto à URL do iframe

### **"PostMessage não funciona"**
1. Verificar origem do evento
2. Confirmar que a verificação de autorização passou
3. Debuggar no console do navegador

## 🔄 **Próximos Passos Opcionais**

- [ ] Implementar cache Redis para domínios autorizados
- [ ] Adicionar métricas de uso do iframe
- [ ] Criar webhooks para notificar mudanças
- [ ] Implementar rate limiting por domínio
- [ ] Adicionar suporte a subdomínios dinâmicos

## 📝 **Notas Importantes**

1. **Isolamento Completo:** O sistema iframe não interfere nas funcionalidades existentes
2. **Autenticação Flexível:** Baseada em URL, não requer tokens especiais
3. **Segurança Robusta:** Múltiplas camadas de verificação
4. **Fácil Manutenção:** Interface SUPERADMIN para gerenciar domínios
5. **Auditoria Completa:** Todos os acessos são registrados