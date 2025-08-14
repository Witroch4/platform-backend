# Guia do Agente

Este arquivo fornece um resumo do projeto **Socialwise Chatwit** para auxiliar agentes de IA e novos contribuidores. Consulte o `.cursorrules` para regras completas.

## Visão Geral
- Plataforma full-stack construída com **Next.js 15**, **React**, **TypeScript** e **Prisma**.
- Integrações principais: **OpenAI** (GPT-4, GPT-4o, DALL-E, Whisper) e **Meta/WhatsApp Business**.
- Banco de dados **PostgreSQL** gerenciado via Prisma ORM.

## Estrutura do Projeto
- `app/` – rotas e componentes do Next.js.
- `app/api/` – rotas de API (params de rota são `Promise`).
- `app/admin/` – painel administrativo.
- `app/chatwitia/` – interface do assistente de IA.
- `lib/` – utilitários e bibliotecas.
- `prisma/` – schema e migrações do banco.
- `worker/` – jobs e automações em background.

## Regras de Desenvolvimento
- Todo código novo **deve ser em TypeScript**.
- Comentários e textos visíveis ao usuário em **Português do Brasil**; nomes de variáveis, funções e arquivos em **inglês**.
- Use **optimistic updates** na UI sempre que possível.
- Diálogos de confirmação/alerta devem usar **shadcn/ui** (`Dialog`) em vez de `confirm()` ou `alert()`.
- Interações com o banco devem usar **Prisma**. Ao alterar `prisma/schema.prisma`, gere uma migração.
- Para limpar campos `JSON`, utilize `Prisma.JsonNull`.

## Padrões de Autenticação
- A autenticação é feita com **NextAuth.js v5** (`auth.ts` e `auth.config.ts`).
- Em rotas de API:
  1. `const session = await auth();`
  2. Verifique `session?.user?.id`.
  3. Se vazio, retorne `NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });`

## Comandos Úteis
```bash
npm run dev         # inicia servidor de desenvolvimento
npm run build       # gera build de produção
npm run start       # inicia servidor em produção
npm run db:migrate  # executa migrações Prisma
npm run db:seed     # popula dados iniciais
npm run db:studio   # abre Prisma Studio
npm run lint        # verifica linting
npm run type-check  # verifica tipos TypeScript
npm test            # executa testes
```

## Observações
- Arquivos de configuração principais: `auth.config.ts`, `prisma/schema.prisma`, `.env.example`.
- Utilize **Tailwind CSS** para estilos.
- Este repositório já está na **raiz do projeto**.
