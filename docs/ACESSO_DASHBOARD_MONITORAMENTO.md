# Como Acessar o Dashboard de Monitoramento

## 🚀 Links de Acesso

### Para usuários SUPERADMIN:

1. **Dashboard de Teste (Funciona sem Redis):**

   ```
   http://localhost:3000/admin/monitoring/test
   ```

2. **Dashboard Completo (Funciona com ou sem Redis):**
   ```
   http://localhost:3000/admin/monitoring/dashboard
   ```

## ✅ Sistema Inicializado

O sistema foi inicializado com sucesso! Você pode acessar imediatamente.

## 📋 Pré-requisitos

1. **Usuário com role SUPERADMIN**
   - Verifique se seu usuário tem a role `SUPERADMIN` no banco de dados
   - Apenas usuários SUPERADMIN podem acessar o sistema de monitoramento

2. **Estar logado no sistema**
   - Faça login em: `http://localhost:3000/auth/login`

## 🔍 Como Verificar se Você é SUPERADMIN

1. Acesse o painel admin: `http://localhost:3000/admin`
2. Se você vê as opções "Sistema de Monitoramento", você é SUPERADMIN
3. Se não vê essas opções, você precisa atualizar sua role no banco

## 🛠️ Configuração do Banco (se necessário)

Se você não conseguir acessar, pode ser que precise atualizar sua role:

```sql
-- Substitua 'seu-user-id' pelo seu ID real
UPDATE "User" SET role = 'SUPERADMIN' WHERE id = 'seu-user-id';
```

## 📊 O que Você Verá

### Dashboard de Teste:

- Status do sistema
- Métricas básicas
- Componentes do sistema
- Recomendações
- Informações de debug

### Dashboard Completo:

- Monitoramento em tempo real
- Feature flags
- A/B tests
- Feedback dos usuários
- Métricas de performance
- Alertas do sistema

## 🔧 Troubleshooting

### Erro 403 - Acesso Negado

- Verifique se você tem role SUPERADMIN
- Certifique-se de estar logado

### Erro 404 - Página Não Encontrada

- Verifique se a URL está correta
- Certifique-se de que o servidor está rodando

### Dashboard Não Carrega

- Comece com o dashboard de teste
- Verifique o console do navegador para erros
- Verifique se o Redis está rodando (para dashboard completo)

## 📞 Suporte

Se ainda não conseguir acessar:

1. Verifique os logs do servidor
2. Confirme que você está usando a URL correta
3. Teste primeiro com o dashboard de teste
4. Verifique se todas as dependências estão instaladas

## 🎯 Próximos Passos

1. **Comece com o teste:** `/admin/monitoring/test`
2. **Configure o Redis** para usar o dashboard completo
3. **Execute as migrações** do banco de dados
4. **Inicialize os feature flags** com: `npm run rollout init`

---

**Nota:** O dashboard de teste funciona sem dependências externas e é ideal para verificar se tudo está configurado corretamente.
