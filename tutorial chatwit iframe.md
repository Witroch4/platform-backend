- **Escopo**: Por conta (account_id)
- **Acesso**: Usuários da conta
- **CRUD**: Completo para usuários autorizados

### 📱 **7. Interface do Usuário**

#### **Localização no Dashboard**
- **Menu**: Configurações > Integrações > Dashboard Apps
- **Conversas**: Abas laterais quando aplicativos configurados

#### **Funcionalidades**
- **Criar**: Modal com título e URL
- **Editar**: Mesmo modal com dados preenchidos
- **Excluir**: Confirmação antes de remover
- **Visualizar**: Iframe em aba lateral

###    **8. Como Usar**

#### **Para Desenvolvedores**
1. **Criar aplicativo web** que aceite iframe
2. **Implementar postMessage** para receber contexto
3. **Configurar URL** no ChatWit
4. **Testar comunicação** entre aplicativo e ChatWit

#### **Para Administradores**
1. **Acessar**: Configurações > Integrações > Dashboard Apps
2. **Criar**: Novo aplicativo com título e URL
3. **Configurar**: URL do aplicativo externo
4. **Usar**: Aplicativo aparecerá nas conversas

### 💡 **9. Exemplo de Implementação**

#### **Aplicativo Externo (recebendo contexto)**
```javascript
// No aplicativo externo
window.addEventListener('message', (event) => {
  if (event.data === 'chatwoot-dashboard-app:fetch-info') {
    // Solicitar contexto
    window.parent.postMessage('chatwoot-dashboard-app:fetch-info', '*');
  } else {
    // Receber contexto
    const context = JSON.parse(event.data);
    console.log('Conversa:', context.conversation);
    console.log('Contato:', context.contact);
    console.log('Agente:', context.currentAgent);
  }
});
```

### ✅ **10. Status Atual**

O sistema de **Dashboard Apps** já está **totalmente implementado** no ChatWit, incluindo:

- ✅ Backend completo (modelo, controller, validações)
- ✅ Frontend completo (componentes, store, rotas)
- ✅ Sistema de comunicação via postMessage
- ✅ Interface de administração
- ✅ Integração nas conversas
- ✅ Sistema de permissões
- ✅ Validações de segurança

**Para usar, basta configurar aplicativos externos que aceitem iframe e implementem a comunicação via postMessage.**