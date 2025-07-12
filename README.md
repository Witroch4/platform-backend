# ChatWit Social - Plataforma Completa de Atendimento com IA e Gestão de Redes Sociais 🚀

**ChatWit Social** é uma plataforma avançada de atendimento ao cliente com inteligência artificial, especializada em automação de redes sociais e apoio jurídico para advogados. Desenvolvida para micro, pequenas e médias empresas, oferece soluções completas para gestão digital e atendimento automatizado.

![GitHub last commit](https://img.shields.io/github/last-commit/Witroch4/ChatWit-Social)
![GitHub forks](https://img.shields.io/github/forks/Witroch4/ChatWit-Social)
![GitHub Repo stars](https://img.shields.io/github/stars/Witroch4/ChatWit-Social)
![GitHub watchers](https://img.shields.io/github/watchers/Witroch4/ChatWit-Social)

<div align="center">
  <img src="assets/chatwit_dashboard.jpg" alt="ChatWit Dashboard" width="400"/>
  <img src="assets/chatwit_automation.jpg" alt="Automação Inteligente" width="400"/>
</div>

## <img src="assets/wave.gif" alt="drawing" width="20"/> Transforme sua Presença Digital com ChatWit Social

[![Instagram Badge](https://img.shields.io/badge/-WitDevOficial-purple?style=flat-square&logo=instagram&logoColor=white&link=https://www.instagram.com/witdevoficial/)](https://www.instagram.com/witdevoficial/)
[Visite Nosso Site Oficial](https://witdev.com.br)

## 🎯 Funcionalidades Principais

### 🤖 **ChatWit IA - Assistente Inteligente**
- **Chat com IA Avançada**: Integração completa com OpenAI (GPT-4, GPT-4o, Claude)
- **Geração de Imagens**: DALL-E 2 e DALL-E 3 para criação visual
- **Reconhecimento de Voz**: Transcrição automática com modelo Whisper
- **Análise de Documentos**: Processamento inteligente de PDFs e imagens
- **Pesquisa Web**: Busca em tempo real com contexto brasileiro
- **System Prompts Personalizáveis**: IA adaptada ao seu negócio

### 📱 **Automação de Redes Sociais**
- **Instagram Business**: Automação completa de comentários e DMs
- **Respostas Automáticas**: Chatbots inteligentes para engagement
- **Quick Replies**: Respostas rápidas personalizáveis
- **Coleta de Leads**: Captura automática de contatos interessados
- **Agendamento de Posts**: Planejamento e publicação automatizada
- **Análise de Performance**: Métricas detalhadas de engajamento

### ⚖️ **Sistema Jurídico Especializado**
- **Gestão de Leads OAB**: Sistema completo para advogados
- **Processamento de Documentos**: Unificação de PDFs e conversão para imagens
- **Análise de Provas**: Digitalização e correção de manuscritos
- **Espelho de Correção**: Sistema avançado de correção automática
- **Especialidades Jurídicas**: Suporte para todas as áreas do direito
- **Análise Preliminar**: IA especializada em análise jurídica
- **Processamento em Lote**: Eficiência para múltiplos casos

### 💬 **Integração WhatsApp Business**
- **API WhatsApp**: Integração oficial com Meta Business
- **Templates Dinâmicos**: Mensagens personalizadas aprovadas
- **Configuração Flexível**: Múltiplas contas e configurações
- **Webhooks Inteligentes**: Processamento automatizado de mensagens
- **Fluxos de Atendimento**: Árvores de decisão personalizáveis

### 📊 **Painel Administrativo Avançado**
- **Dashboard Completo**: Visão geral de todas as operações
- **Gestão de Usuários**: Controle de acesso e permissões
- **Relatórios Detalhados**: Analytics em tempo real
- **Sistema de Notificações**: Alertas proativos e automáticos
- **Monitoramento SSE**: Acompanhamento em tempo real

## 🧠 ChatwitIA - Sua Versão Personalizada do ChatGPT

O **ChatwitIA** é uma integração completa com a API da OpenAI, oferecendo uma versão personalizada do ChatGPT com recursos avançados.

### **Recursos do ChatwitIA**
- 🤖 **Chat com IA Avançada**: Interface de conversação completa usando os modelos GPT-3.5/GPT-4
- 🎨 **Geração de Imagens**: Crie imagens com DALL-E 2 ou DALL-E 3 a partir de descrições textuais
- 🎤 **Entrada de Voz**: Transcreva sua voz automaticamente para texto usando o modelo Whisper
- 💬 **System Prompts Personalizáveis**: Configure a personalidade da IA para diferentes casos de uso
- 🔍 **Suporte a Todos os Modelos**: Acesso aos modelos mais recentes da OpenAI

### **Como Usar o ChatwitIA**
Acesse a página `/chatwitia` para interagir:

- **Envie mensagens**: Digite no campo de entrada e pressione Enter ou clique em "Enviar"
- **Grave áudio**: Clique no ícone do microfone para iniciar a gravação de voz
- **Gere imagens**: Clique no botão "Gerar Imagem" para abrir a interface de geração de imagens
- **Configure o comportamento**: Personalize o "System Prompt" para definir a personalidade da IA

### **Endpoints da API do ChatwitIA**

#### **1. Chat Completion API**
```bash
POST /api/chatwitia
Body: { "messages": [{"role": "user", "content": "Olá, como você está?"}] }
```

#### **2. Geração de Imagens API**
```bash
POST /api/chatwitia/image
Body: {
  "prompt": "Um gato laranja sentado em uma cadeira",
  "options": {
    "model": "dall-e-3",
    "size": "1024x1024"
  }
}
```

#### **3. Transcrição de Áudio API**
```bash
POST /api/chatwitia/transcribe
Body: FormData com o arquivo de áudio no campo "file"
```

### **Modelos Disponíveis no ChatwitIA**

**Modelos de Chat:**
- gpt-4, gpt-4-turbo
- gpt-3.5-turbo, gpt-3.5-turbo-16k
- chatgpt-4o-latest, gpt-4o-latest

**Modelos de Imagem:**
- dall-e-3, dall-e-2

**Modelo de Transcrição:**
- whisper-1

### **Exemplos de System Prompts**

**Assistente Técnico:**
```
Você é um assistente técnico especializado em programação. Forneça respostas precisas e técnicas, com exemplos de código quando relevante.
```

**Assistente Criativo:**
```
Você é um assistente criativo que ajuda a gerar ideias inovadoras. Seja inspirador e pense fora da caixa.
```

**Tutor Educacional:**
```
Você é um tutor paciente que explica conceitos difíceis de forma simples. Use analogias e exemplos para facilitar o entendimento.
```

## 🔄 Sistema de Automação em Lote para Leads

O **Sistema de Automação em Lote** permite processar múltiplos leads simultaneamente, automatizando todas as etapas do fluxo jurídico.

### **Etapas Automatizadas**
1. **Unificação de PDF** - Combina todos os arquivos do lead em um único PDF
2. **Geração de Imagens** - Converte o PDF unificado em imagens
3. **Processamento de Manuscrito** - Digitalização automática do texto da prova
4. **Espelho de Correção** - Criação do espelho para correção
5. **Pré-Análise** - Envio para análise automática

### **Como Usar o Sistema de Lote**

#### **1. Seleção de Leads**
- Na lista de leads, marque os checkboxes dos leads que deseja processar
- Um banner aparecerá mostrando quantos leads foram selecionados

#### **2. Iniciar Processamento**
- Clique no botão **"Processamento em Lote"** com ícone de raio ⚡
- Um diálogo de progresso será exibido mostrando o andamento

#### **3. Fluxo Automático**

**Etapa 1: Processamento Automático**
- **Unificação de PDF**: Se o lead não tem PDF unificado, será criado automaticamente
- **Geração de Imagens**: Se não há imagens convertidas, serão geradas do PDF
- **Verificação de Dependências**: Identifica quais leads precisam de ação manual

**Etapa 2: Ações Manuais (Manuscrito)**
- O processamento pausa automaticamente
- Diálogos sequenciais são abertos para cada lead
- Você seleciona as imagens e envia para digitação
- O sistema aguarda o processamento externo

**Etapa 3: Ações Manuais (Espelho)**
- Novamente o processamento pausa
- Diálogos para seleção de imagens do espelho
- Envio para processamento de correção

**Etapa 4: Finalização**
- Leads completos são enviados para pré-análise automaticamente
- Relatório final é exibido

### **Benefícios do Sistema de Lote**

#### **Para o Administrador**
- **Economia de Tempo**: Automatiza 80% das tarefas repetitivas
- **Menos Cliques**: Reduz de ~50 cliques por lead para ~5 cliques total
- **Processamento Noturno**: Pode ser executado em lotes grandes
- **Controle Granular**: Possibilidade de pular leads problemáticos

#### **Para o Sistema**
- **Eficiência**: Processamento paralelo onde possível
- **Robustez**: Tratamento de erros individual por lead
- **Escalabilidade**: Pode processar centenas de leads
- **Observabilidade**: Logs detalhados de cada etapa

### **Regras de Negócio do Sistema de Lote**

#### **Leads Ignorados**
- **Consultoria Ativa**: Leads com `consultoriaFase2 = true` são pulados automaticamente
- **Notification**: O usuário é notificado sobre leads ignorados

#### **Dependências Respeitadas**
- PDF deve existir antes de gerar imagens
- Imagens devem existir antes de processar manuscrito
- Manuscrito e espelho devem existir antes da análise

#### **Pausas Inteligentes**
- **Manuscrito**: Para quando leads precisam de digitação manual
- **Espelho**: Para quando leads precisam de espelho de correção
- **Continuação**: O usuário pode executar novamente para continuar

## 🏗️ Arquitetura Técnica

### **Stack Principal**
- **Frontend**: Next.js 13+ (App Router), React 18+, TypeScript
- **Backend**: Node.js, Prisma ORM, PostgreSQL
- **UI/UX**: Tailwind CSS, Shadcn/UI, Framer Motion
- **Autenticação**: NextAuth.js com múltiplos providers
- **Cloud**: Docker, Redis, MinIO (S3-compatible)

### **Integrações de IA**
- **OpenAI**: GPT-4, GPT-4o, DALL-E, Whisper
- **Anthropic**: Claude 3.5 Sonnet
- **Processamento**: Responses API, Files API, Assistants API
- **Análise**: Classificação de intenções, geração de conteúdo

### **Apis e Serviços**
- **Instagram Graph API**: Automação completa
- **WhatsApp Business API**: Mensagens oficiais
- **Meta Business Platform**: Integração empresarial
- **Stripe**: Sistema de pagamentos e assinaturas
- **Resend**: Notificações por email

## 🚀 Recursos Exclusivos

### **Sistema de Filas Inteligentes**
- **Bull Queue**: Processamento assíncrono robusto
- **Worker Jobs**: Tarefas em background otimizadas
- **Retry Logic**: Tentativas automáticas com backoff
- **Monitoring**: Painel de monitoramento em tempo real

### **Processamento de Documentos**
- **Unificação de PDFs**: Combina múltiplos documentos
- **Conversão para Imagem**: Renderização de alta qualidade
- **OCR Avançado**: Reconhecimento de texto manuscrito
- **Análise Jurídica**: IA especializada em direito

### **Automação Avançada**
- **Fluxos Condicionais**: Lógica complexa de atendimento
- **Segmentação de Público**: Targeting inteligente
- **A/B Testing**: Otimização de campanhas
- **Integração CRM**: Sincronização com sistemas externos

## 🎯 Casos de Uso Específicos

### **Para Advogados**
- ✅ **Gestão de Clientes OAB**: Controle completo de leads
- ✅ **Correção Automática**: Análise de provas e recursos
- ✅ **Especialização por Área**: Direito Civil, Penal, Tributário, etc.
- ✅ **Biblioteca de Espelhos**: Templates reutilizáveis
- ✅ **Análise Preliminar**: IA jurídica especializada

### **Para Empresas**
- ✅ **Atendimento 24/7**: Automação inteligente
- ✅ **Geração de Leads**: Captura automática de interessados
- ✅ **Vendas Automatizadas**: Fluxos de conversão otimizados
- ✅ **Suporte Técnico**: Respostas contextualizadas
- ✅ **Marketing Digital**: Campanhas automatizadas

### **Para Agências**
- ✅ **Gestão Multi-Cliente**: Múltiplas contas e configurações
- ✅ **White Label**: Personalização completa da marca
- ✅ **Relatórios Detalhados**: Analytics por cliente
- ✅ **Automação Escalável**: Milhares de interações simultâneas

## 📋 Instalação e Configuração

### **Pré-requisitos**
- Node.js 18.x ou superior
- PostgreSQL 14+
- Redis 6+
- Docker e Docker Compose

### **Instalação Rápida**
```bash
# Clone o repositório
git clone https://github.com/Witroch4/ChatWit-Social.git
cd ChatWit-Social

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com suas configurações

# Execute as migrações do banco
npx prisma migrate dev

# Inicie o servidor de desenvolvimento
npm run dev
```

### **Configuração com Docker**
```bash
# Build e start com Docker Compose
docker-compose up -d

# Para produção
docker-compose -f docker-compose-prod.yml up -d
```

## 🔧 Configuração de Ambiente

### **Variáveis Essenciais**
```env
# Banco de Dados
DATABASE_URL="postgresql://user:password@localhost:5432/chatwit"

# Autenticação
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="seu-secret-aqui"

# OpenAI
OPENAI_API_KEY="sk-..."

# Instagram
NEXT_PUBLIC_INSTAGRAM_APP_ID="seu-app-id"
INSTAGRAM_APP_SECRET="seu-secret"

# WhatsApp
WHATSAPP_TOKEN="seu-token-permanent"
WHATSAPP_BUSINESS_ID="seu-business-id"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
```

### **Configurações Avançadas**
```env
# Redis para filas
REDIS_URL="redis://localhost:6379"

# MinIO para arquivos
S3_ENDPOINT="https://seu-minio.com"
S3_ACCESS_KEY="seu-access-key"
S3_SECRET_KEY="seu-secret-key"

# Webhooks
WEBHOOK_SECRET="seu-webhook-secret"
```

## 🛠️ Desenvolvimento

### **Scripts Disponíveis**
```bash
# Desenvolvimento
npm run dev          # Inicia servidor de desenvolvimento
npm run build        # Build para produção
npm run start        # Inicia servidor de produção

# Banco de dados
npm run db:migrate   # Executa migrações
npm run db:seed      # Popula dados iniciais
npm run db:studio    # Abre Prisma Studio

# Qualidade de código
npm run lint         # Verifica linting
npm run type-check   # Verifica tipos TypeScript
```

### **Estrutura do Projeto**
```
Chatwit-Social-dev/
├── app/                    # App Router (Next.js 13+)
│   ├── api/               # API Routes
│   ├── admin/             # Painel administrativo
│   ├── chatwitia/         # Interface do ChatWit IA
│   └── components/        # Componentes React
├── lib/                   # Bibliotecas e utilitários
├── prisma/               # Schema e migrações
├── public/               # Arquivos estáticos
├── scripts/              # Scripts de automação
├── services/             # Serviços externos
└── worker/               # Background jobs
```

## 📊 Monitoramento e Analytics

### **Métricas Principais**
- **Engajamento**: Taxa de resposta, tempo de resposta
- **Conversão**: Leads gerados, vendas realizadas
- **Performance**: Uptime, latência, erros
- **Uso de IA**: Tokens consumidos, modelos utilizados

### **Dashboards Disponíveis**
- **Operacional**: Status do sistema em tempo real
- **Comercial**: Métricas de vendas e conversão
- **Técnico**: Performance e logs de erro
- **Jurídico**: Análises processadas e precisão

## 🔐 Segurança e Privacidade

### **Medidas de Segurança**
- ✅ **Autenticação Multi-Fator**: 2FA obrigatório para admins
- ✅ **Criptografia**: Dados sensíveis criptografados
- ✅ **Rate Limiting**: Proteção contra ataques DDoS
- ✅ **Audit Logs**: Registro completo de ações
- ✅ **RBAC**: Controle de acesso baseado em funções

### **Conformidade**
- ✅ **LGPD**: Compliance com proteção de dados
- ✅ **Meta Policies**: Seguimento das políticas do Facebook
- ✅ **OpenAI Guidelines**: Uso responsável de IA
- ✅ **WhatsApp Terms**: Conformidade com termos de uso

## 🚀 Roadmap

### **Próximas Versões**
- [ ] **Facebook e TikTok**: Expansão para outras redes
- [ ] **IA Multimodal**: Análise de vídeos e áudios
- [ ] **CRM Integrado**: Sistema completo de relacionamento
- [ ] **App Mobile**: Aplicativo iOS e Android
- [ ] **API Pública**: Integrações com terceiros

### **Melhorias Planejadas**
- [ ] **Performance**: Otimização de velocidade
- [ ] **Escalabilidade**: Suporte para milhões de usuários
- [ ] **Localização**: Suporte a múltiplos idiomas
- [ ] **Integração**: Conectores para mais plataformas

## 🤝 Contribuição

### **Como Contribuir**
1. Fork o repositório
2. Crie uma branch feature (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

### **Diretrizes**
- Siga os padrões de código estabelecidos
- Inclua testes para novas funcionalidades
- Documente mudanças na API
- Mantenha compatibilidade com versões anteriores

## 📞 Suporte e Comunidade

### **Canais de Suporte**
- **Discord**: [Servidor da Comunidade](https://discord.gg/chatwit)
- **GitHub Issues**: Para bugs e feature requests
- **Email**: suporte@witdev.com.br
- **WhatsApp**: +55 11 99999-9999

### **Comunidade**
- **YouTube**: Tutoriais e webinars
- **Blog**: Artigos técnicos e casos de uso
- **Newsletter**: Novidades e atualizações
- **Meetups**: Eventos presenciais e online

## 📜 Licença

Este projeto está licenciado sob a **MIT License**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## 🏆 Reconhecimentos

- **OpenAI**: Pela tecnologia de IA que potencializa nossa plataforma
- **Meta**: Pelas APIs que permitem integração com redes sociais
- **Comunidade Open Source**: Por todas as bibliotecas e ferramentas utilizadas
- **Nossos Usuários**: Por confiarem em nossa solução

---

<div align="center">
  <p><strong>Desenvolvido com ❤️ pela equipe WitDev</strong></p>
  <p>© 2024 ChatWit Social. Todos os direitos reservados.</p>
</div>

