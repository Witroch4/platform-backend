Contexto do Projeto para o Gemini Code Assist
Visão Geral do Projeto: Socialwise Chatwit
Socialwise Chatwit é uma plataforma avançada de atendimento ao cliente com inteligência artificial, especializada em automação de redes sociais e apoio jurídico para advogados. Desenvolvida para micro, pequenas e médias empresas, oferece soluções completas para gestão digital e atendimento automatizado.

🎯 Funcionalidades Principais
🤖 ChatWit IA: Assistente inteligente com integração OpenAI (GPT-4, GPT-4o, Claude), DALL-E e Whisper.

📱 Automação de Redes Sociais: Gestão completa de Instagram Business (DMs, comentários).

⚖️ Sistema Jurídico Especializado: Gestão de leads OAB e processamento automatizado de documentos.

💬 Integração WhatsApp Business: API oficial da Meta para fluxos de atendimento.

📊 Painel Administrativo Avançado: Dashboard completo, gestão de usuários e monitoramento em tempo real.

🧠 Ambiente Técnico e Configurações
Esta seção detalha a stack técnica, configurações de ambiente e scripts do projeto.

🛠️ Stack Principal e Dependências Chave
O projeto é construído com as seguintes tecnologias, conforme definido no package.json:

Frontend: Next.js 15+ (App Router), React 18, TypeScript.

Backend: Node.js, Express (para servidores customizados como Bull Board).

UI/UX: Tailwind CSS, Shadcn/UI, Framer Motion.

Banco de Dados: PostgreSQL com Prisma ORM.

Autenticação: NextAuth.js v5.

Filas e Jobs em Background: bullmq com redis.

Armazenamento de Arquivos: S3-compatible (MinIO).

IA e Serviços Externos: openai, @anthropic-ai/sdk, resend, stripe.

Qualidade de Código: @biomejs/biome para linting e formatação.

📜 Scripts (package.json)
Desenvolvimento: npm run dev (inicia o server.js customizado), npm run dev:turbo (usa o modo turbo do Next.js).

Build: npm run build (compila o Next.js e os workers TypeScript).

Workers: npm run worker (inicia o webhook.worker.ts), npm run start:worker (inicia o automacao.worker.ts).

Banco de Dados: npm run db:push (aplica schema e executa o seed), npm run db:seed (apenas seed), npm run db:studio (abre o Prisma Studio).

Backup/Restore: Scripts customizados como npm run backup e npm run restore.

Ambiente de Desenvolvimento Principal: Windows com PowerShell.

🐳 Ambiente Docker
O projeto utiliza Docker e Docker Compose para padronizar os ambientes.

Desenvolvimento (docker-compose.dev.yml)
app: Container principal que executa a aplicação Next.js com hot-reloading (CHOKIDAR_USEPOLLING: "true"). Monta o código-fonte local como um volume para refletir as alterações em tempo real.

automacao_worker: Worker dedicado para o processamento de automações (automacao.worker.ts).

webhook_worker: Worker dedicado para processar webhooks (webhook.worker.ts).

redis: Serviço do Redis para ser usado pelo BullMQ.

Rede: Todos os serviços se comunicam através de uma rede customizada (minha_rede).

Produção (docker-compose.yml e Dockerfile.prod)
Build Multi-stage: O Dockerfile.prod usa uma abordagem multi-stage.

builder: Instala todas as dependências (dependencies e devDependencies), gera o cliente Prisma e executa npm run build.

Imagem final: Copia apenas os artefatos de build (.next, public, dist), o server.js e as node_modules de produção (usando npm ci --omit=dev).

Variáveis de Ambiente: As variáveis de ambiente são passadas durante o build (ARG) e em tempo de execução (env_file), garantindo que segredos não fiquem na imagem Docker.

Serviços: O compose de produção orquestra o container da app e do redis. Os workers são executados dentro do container principal app ou como serviços separados, dependendo da configuração de deploy.

🔐 Autenticação (NextAuth.js v5 - auth.ts)
Estratégia: jwt (JSON Web Tokens).

Adaptador: @auth/prisma-adapter para sincronizar usuários e contas com o banco de dados.

Callbacks:

signIn: Bloqueia o login de usuários com credenciais se o e-mail não estiver verificado (!registeredUser?.emailVerified). Permite login direto para provedores OAuth (Google, GitHub).

jwt: Enriquece o token com dados customizados.

No login (user existe): Adiciona id, role, isOAuth, isTwoFactorAuthEnabled e busca tokens de serviços (Instagram, Chatwit) no banco.

No update (trigger === "update"): Permite a atualização do token em tempo real, por exemplo, ao habilitar 2FA.

session: Expõe os dados do token para o cliente (sessão do React), garantindo que o frontend tenha acesso a role, isTwoFactorAuthEnabled, etc.

⚙️ Configuração TypeScript (tsconfig.json)
Moderno: Configurado para um ambiente Next.js 15 com module: "esnext" e moduleResolution: "bundler".

Paths: Usa alias de path (@/*) para importações mais limpas.

Inclusão: Inclui os arquivos do app, components, middleware.ts e as definições de tipo (.d.ts).

Contexto Específico: Seed de Usuários Administradores
Uma parte crucial da configuração inicial é popular (fazer o "seed") o banco de dados com usuários administradores pré-definidos. A lógica está em prisma/seed.ts e é executada com npm run db:seed ou automaticamente com npm run db:push.

Usuários Administradores Padrão:
Nome: Amanda

Email: amandasousa22.adv@gmail.com

Senha: 123456 (senha em texto plano antes do hash)

Nome: Witalo

Email: witalo_rocha@hotmail.com

Senha: 123456 (senha em texto plano antes do hash)

Instruções para o Gemini
O projeto é uma plataforma completa chamada Socialwise Chatwit. O contexto principal está na seção de Visão Geral e Ambiente Técnico.

Meu ambiente de desenvolvimento é Windows com PowerShell. Por favor, forneça comandos compatíveis.

Ao analisar o arquivo prisma/seed.ts, lembre-se que o objetivo é criar usuários administradores de forma idempotente.

Se eu pedir para adicionar um novo usuário administrador, a melhor abordagem é adicioná-lo à lista de usuários no arquivo prisma/seed.ts.

O projeto usa NextAuth.js v5, então a lógica de autenticação está centralizada nos arquivos auth.ts e auth.config.ts.

O deploy é feito com Docker, então as sugestões devem ser compatíveis com um ambiente containerizado, especialmente em relação a variáveis de ambiente e acesso a serviços como Redis e S3.

exemplo de parasm que funciona:
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountid: string }> }
): Promise<NextResponse> {
  const { accountid } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }
