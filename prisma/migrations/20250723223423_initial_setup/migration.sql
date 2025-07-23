-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DEFAULT', 'ADMIN', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED');

-- CreateEnum
CREATE TYPE "EspecialidadeJuridica" AS ENUM ('ADMINISTRATIVO', 'CIVIL', 'CONSTITUCIONAL', 'TRABALHO', 'EMPRESARIAL', 'PENAL', 'TRIBUTARIO');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('WHATSAPP_OFFICIAL', 'INTERACTIVE_MESSAGE', 'AUTOMATION_REPLY');

-- CreateEnum
CREATE TYPE "TemplateScope" AS ENUM ('GLOBAL', 'PRIVATE');

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'X');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('POST', 'STORIES', 'REELS');

-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('NONE', 'DAILY', 'WEEKLY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'DEFAULT',
    "password" TEXT,
    "isTwoFactorAuthEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorAuthVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isNew" BOOLEAN NOT NULL DEFAULT true,
    "mtfDiamanteSeedExecuted" BOOLEAN NOT NULL DEFAULT false,
    "mtfVariaveisPopuladas" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "igUserId" TEXT,
    "igUsername" TEXT,
    "isMain" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwoFactorToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResetPasswordToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResetPasswordToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automacao" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT,
    "accountId" TEXT NOT NULL,
    "selectedMediaId" TEXT,
    "anyMediaSelected" BOOLEAN NOT NULL DEFAULT false,
    "anyword" BOOLEAN NOT NULL DEFAULT true,
    "palavrasChave" TEXT,
    "fraseBoasVindas" TEXT,
    "quickReplyTexto" TEXT,
    "mensagemEtapa3" TEXT,
    "linkEtapa3" TEXT,
    "legendaBotaoEtapa3" TEXT,
    "responderPublico" BOOLEAN NOT NULL DEFAULT false,
    "pedirEmailPro" BOOLEAN NOT NULL DEFAULT false,
    "emailPrompt" TEXT,
    "pedirParaSeguirPro" BOOLEAN NOT NULL DEFAULT false,
    "followPrompt" TEXT,
    "followButtonPayload" TEXT,
    "contatoSemClique" BOOLEAN NOT NULL DEFAULT false,
    "noClickPrompt" TEXT,
    "publicReply" TEXT,
    "buttonPayload" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "igSenderId" TEXT NOT NULL,
    "email" TEXT,
    "whatsapp" TEXT,
    "seguidor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "lastMessage" TIMESTAMP(3),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("igSenderId")
);

-- CreateTable
CREATE TABLE "LeadAutomacao" (
    "id" TEXT NOT NULL,
    "leadIgSenderId" TEXT NOT NULL,
    "automacaoId" TEXT NOT NULL,
    "linkSent" BOOLEAN NOT NULL DEFAULT false,
    "waitingForEmail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAutomacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pasta" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pasta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agendamento" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "Data" TIMESTAMP(3) NOT NULL,
    "Descricao" TEXT,
    "Facebook" BOOLEAN NOT NULL DEFAULT false,
    "Instagram" BOOLEAN NOT NULL DEFAULT false,
    "Linkedin" BOOLEAN NOT NULL DEFAULT false,
    "X" BOOLEAN NOT NULL DEFAULT false,
    "Stories" BOOLEAN NOT NULL DEFAULT false,
    "Reels" BOOLEAN NOT NULL DEFAULT false,
    "PostNormal" BOOLEAN NOT NULL DEFAULT false,
    "Diario" BOOLEAN NOT NULL DEFAULT false,
    "Semanal" BOOLEAN NOT NULL DEFAULT false,
    "Randomizar" BOOLEAN NOT NULL DEFAULT false,
    "TratarComoUnicoPost" BOOLEAN NOT NULL DEFAULT false,
    "TratarComoPostagensIndividuais" BOOLEAN NOT NULL DEFAULT false,
    "Concluido_FB" BOOLEAN NOT NULL DEFAULT false,
    "Concluido_IG" BOOLEAN NOT NULL DEFAULT false,
    "Concluido_LK" BOOLEAN NOT NULL DEFAULT false,
    "Concluido_X" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agendamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Midia" (
    "id" TEXT NOT NULL,
    "agendamentoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "contador" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Midia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isFromLead" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioChatwit" (
    "id" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "availableName" TEXT,
    "accountName" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "chatwitAccessToken" TEXT,
    "chatwitAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsuarioChatwit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TemplateType" NOT NULL,
    "scope" "TemplateScope" NOT NULL DEFAULT 'PRIVATE',
    "description" TEXT,
    "tags" TEXT[],
    "language" TEXT NOT NULL DEFAULT 'pt_BR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "caixaId" TEXT,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractiveContent" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "bodyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteractiveContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Header" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "interactiveContentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Header_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Body" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Body_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Footer" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "interactiveContentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Footer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionCtaUrl" (
    "id" TEXT NOT NULL,
    "displayText" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "interactiveContentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionCtaUrl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionReplyButton" (
    "id" TEXT NOT NULL,
    "buttons" JSONB NOT NULL,
    "interactiveContentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionReplyButton_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionList" (
    "id" TEXT NOT NULL,
    "buttonText" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "interactiveContentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionFlow" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "flowCta" TEXT NOT NULL,
    "flowMode" TEXT NOT NULL DEFAULT 'published',
    "flowData" JSONB,
    "interactiveContentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLocationRequest" (
    "id" TEXT NOT NULL,
    "requestText" TEXT NOT NULL,
    "interactiveContentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionLocationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppOfficialInfo" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "qualityScore" TEXT,
    "components" JSONB NOT NULL,
    "templateIdRel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppOfficialInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadChatwit" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT,
    "nomeReal" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "thumbnail" TEXT,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "anotacoes" TEXT,
    "pdfUnificado" TEXT,
    "imagensConvertidas" TEXT,
    "leadUrl" TEXT,
    "fezRecurso" BOOLEAN NOT NULL DEFAULT false,
    "datasRecurso" TEXT,
    "provaManuscrita" JSONB,
    "manuscritoProcessado" BOOLEAN NOT NULL DEFAULT false,
    "aguardandoManuscrito" BOOLEAN NOT NULL DEFAULT false,
    "espelhoCorrecao" TEXT,
    "textoDOEspelho" JSONB,
    "espelhoProcessado" BOOLEAN NOT NULL DEFAULT false,
    "aguardandoEspelho" BOOLEAN NOT NULL DEFAULT false,
    "analiseUrl" TEXT,
    "argumentacaoUrl" TEXT,
    "analiseProcessada" BOOLEAN NOT NULL DEFAULT false,
    "aguardandoAnalise" BOOLEAN NOT NULL DEFAULT false,
    "analisePreliminar" JSONB,
    "analiseValidada" BOOLEAN NOT NULL DEFAULT false,
    "consultoriaFase2" BOOLEAN NOT NULL DEFAULT false,
    "recursoPreliminar" JSONB,
    "recursoValidado" BOOLEAN NOT NULL DEFAULT false,
    "recursoUrl" TEXT,
    "recursoArgumentacaoUrl" TEXT,
    "aguardandoRecurso" BOOLEAN NOT NULL DEFAULT false,
    "seccional" TEXT,
    "areaJuridica" TEXT,
    "notaFinal" DOUBLE PRECISION,
    "situacao" TEXT,
    "inscricao" TEXT,
    "examesParticipados" JSONB,
    "espelhoBibliotecaId" TEXT,
    "especialidade" "EspecialidadeJuridica",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "LeadChatwit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArquivoLeadChatwit" (
    "id" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "pdfConvertido" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leadId" TEXT NOT NULL,

    CONSTRAINT "ArquivoLeadChatwit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConfig" (
    "id" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "whatsappToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "whatsappBusinessAccountId" TEXT NOT NULL,
    "fbGraphApiBase" TEXT NOT NULL DEFAULT 'https://graph.facebook.com/v22.0',
    "usuarioChatwitId" TEXT NOT NULL,
    "caixaEntradaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subCategory" TEXT,
    "language" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "qualityScore" TEXT,
    "correctCategory" TEXT,
    "ctaUrlLinkTrackingOptedOut" BOOLEAN,
    "libraryTemplateName" TEXT,
    "messageSendTtlSeconds" INTEGER,
    "parameterFormat" TEXT,
    "previousCategory" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "lastEdited" TIMESTAMP(3),
    "editHistory" JSONB,
    "publicMediaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usuarioChatwitId" TEXT NOT NULL,
    "caixaEntradaId" TEXT,

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nova conversa',
    "model" TEXT NOT NULL DEFAULT 'chatgpt-4o-latest',
    "summary" TEXT,
    "lastResponseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "audioData" TEXT,
    "imageUrl" TEXT,
    "previousResponseId" TEXT,
    "responseId" TEXT,
    "modelUsed" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "temperature" DOUBLE PRECISION,
    "topP" DOUBLE PRECISION,
    "responseStatus" TEXT,
    "responseCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatFile" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "openaiFileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'stored',
    "purpose" TEXT,
    "thumbnail_url" TEXT,
    "filename" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "ChatFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedImage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "prompt" TEXT NOT NULL,
    "revisedPrompt" TEXT,
    "model" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "size" TEXT,
    "quality" TEXT,
    "previousResponseId" TEXT,
    "responseId" TEXT,
    "openaiFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ButtonReactionMapping" (
    "id" TEXT NOT NULL,
    "buttonId" TEXT NOT NULL,
    "emoji" TEXT,
    "textReaction" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "messageId" TEXT,

    CONSTRAINT "ButtonReactionMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspelhoBiblioteca" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "textoDOEspelho" JSONB,
    "espelhoCorrecao" TEXT,
    "isAtivo" BOOLEAN NOT NULL DEFAULT true,
    "totalUsos" INTEGER NOT NULL DEFAULT 0,
    "espelhoBibliotecaProcessado" BOOLEAN NOT NULL DEFAULT false,
    "aguardandoEspelho" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT NOT NULL,

    CONSTRAINT "EspelhoBiblioteca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspelhoPadrao" (
    "id" TEXT NOT NULL,
    "especialidade" "EspecialidadeJuridica" NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "textoMarkdown" TEXT,
    "espelhoCorrecao" TEXT,
    "isAtivo" BOOLEAN NOT NULL DEFAULT true,
    "totalUsos" INTEGER NOT NULL DEFAULT 0,
    "processado" BOOLEAN NOT NULL DEFAULT false,
    "aguardandoProcessamento" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "atualizadoPorId" TEXT NOT NULL,

    CONSTRAINT "EspelhoPadrao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MtfDiamanteConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MtfDiamanteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MtfDiamanteVariavel" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MtfDiamanteVariavel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MtfDiamanteLote" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MtfDiamanteLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MtfDiamanteIntentMapping" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "intentName" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "parameters" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MtfDiamanteIntentMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisparoMtfDiamante" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "leadNome" TEXT,
    "leadTelefone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "parameters" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisparoMtfDiamante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeloRecurso" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModeloRecurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote_oab" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "valorAnalise" DECIMAL(10,2) NOT NULL,
    "chavePix" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usuarioChatwitId" TEXT NOT NULL,

    CONSTRAINT "lote_oab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagem_interativa" (
    "id" TEXT NOT NULL,
    "nome" TEXT,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "headerTipo" TEXT,
    "headerConteudo" TEXT,
    "rodape" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usuarioChatwitId" TEXT NOT NULL,
    "caixaEntradaId" TEXT,

    CONSTRAINT "mensagem_interativa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "botao_mensagem" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mensagemId" TEXT NOT NULL,

    CONSTRAINT "botao_mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caixa_entrada" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "chatwitAccountId" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "inboxName" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usuarioChatwitId" TEXT NOT NULL,
    "fallbackParaCaixaId" TEXT,

    CONSTRAINT "caixa_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_dialogflow" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'global',
    "hookId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usuarioChatwitId" TEXT NOT NULL,
    "caixaId" TEXT NOT NULL,

    CONSTRAINT "agente_dialogflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_oab" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "payload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usuarioChatwitId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,

    CONSTRAINT "lead_oab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapeamentoIntencao" (
    "id" TEXT NOT NULL,
    "intentName" TEXT NOT NULL,
    "caixaEntradaId" TEXT NOT NULL,
    "templateId" TEXT,
    "mensagemInterativaId" TEXT,
    "unifiedTemplateId" TEXT,
    "interactiveMessageId" TEXT,

    CONSTRAINT "MapeamentoIntencao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_library" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "isApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalUsageCount" INTEGER NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL,
    "category" TEXT,
    "language" TEXT NOT NULL DEFAULT 'pt_BR',
    "tags" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_approval_request" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestMessage" TEXT,
    "responseMessage" TEXT,
    "customVariables" JSONB,
    "templateLibraryId" TEXT NOT NULL,
    "unifiedTemplateId" TEXT,
    "requestedById" TEXT NOT NULL,
    "processedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "template_approval_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_message" (
    "id" TEXT NOT NULL,
    "whatsappMessageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "messageContent" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "whatsappApiKey" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_thread" (
    "id" TEXT NOT NULL,
    "whatsappConversationId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DialogflowIntent" (
    "id" TEXT NOT NULL,
    "intentName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DialogflowIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractiveMessage" (
    "id" TEXT NOT NULL,
    "caixaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "headerType" TEXT,
    "headerContent" TEXT,
    "bodyText" TEXT NOT NULL,
    "footerText" TEXT,
    "actionData" JSONB,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationName" TEXT,
    "locationAddress" TEXT,
    "reactionEmoji" TEXT,
    "targetMessageId" TEXT,
    "stickerMediaId" TEXT,
    "stickerUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteractiveMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE INDEX "accounts_providerAccountId_idx" ON "accounts"("providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_email_key" ON "VerificationToken"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_email_token_key" ON "VerificationToken"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorToken_email_key" ON "TwoFactorToken"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorToken_token_key" ON "TwoFactorToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorToken_email_token_key" ON "TwoFactorToken"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "ResetPasswordToken_email_key" ON "ResetPasswordToken"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ResetPasswordToken_token_key" ON "ResetPasswordToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ResetPasswordToken_email_token_key" ON "ResetPasswordToken"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Automacao_buttonPayload_key" ON "Automacao"("buttonPayload");

-- CreateIndex
CREATE INDEX "Automacao_userId_idx" ON "Automacao"("userId");

-- CreateIndex
CREATE INDEX "Automacao_accountId_idx" ON "Automacao"("accountId");

-- CreateIndex
CREATE INDEX "Lead_accountId_idx" ON "Lead"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadAutomacao_leadIgSenderId_automacaoId_key" ON "LeadAutomacao"("leadIgSenderId", "automacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Midia_agendamentoId_idx" ON "Midia"("agendamentoId");

-- CreateIndex
CREATE INDEX "Chat_accountId_idx" ON "Chat"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Chat_leadId_accountId_key" ON "Chat"("leadId", "accountId");

-- CreateIndex
CREATE INDEX "Message_chatId_idx" ON "Message"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioChatwit_appUserId_key" ON "UsuarioChatwit"("appUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioChatwit_chatwitAccessToken_key" ON "UsuarioChatwit"("chatwitAccessToken");

-- CreateIndex
CREATE INDEX "Template_createdById_idx" ON "Template"("createdById");

-- CreateIndex
CREATE INDEX "Template_caixaId_idx" ON "Template"("caixaId");

-- CreateIndex
CREATE INDEX "Template_type_idx" ON "Template"("type");

-- CreateIndex
CREATE INDEX "Template_scope_idx" ON "Template"("scope");

-- CreateIndex
CREATE INDEX "Template_isActive_idx" ON "Template"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InteractiveContent_templateId_key" ON "InteractiveContent"("templateId");

-- CreateIndex
CREATE INDEX "InteractiveContent_templateId_idx" ON "InteractiveContent"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "Header_interactiveContentId_key" ON "Header"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "Footer_interactiveContentId_key" ON "Footer"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionCtaUrl_interactiveContentId_key" ON "ActionCtaUrl"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionReplyButton_interactiveContentId_key" ON "ActionReplyButton"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionList_interactiveContentId_key" ON "ActionList"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionFlow_interactiveContentId_key" ON "ActionFlow"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionLocationRequest_interactiveContentId_key" ON "ActionLocationRequest"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppOfficialInfo_templateIdRel_key" ON "WhatsAppOfficialInfo"("templateIdRel");

-- CreateIndex
CREATE INDEX "WhatsAppOfficialInfo_templateId_idx" ON "WhatsAppOfficialInfo"("templateId");

-- CreateIndex
CREATE INDEX "WhatsAppOfficialInfo_status_idx" ON "WhatsAppOfficialInfo"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LeadChatwit_sourceId_key" ON "LeadChatwit"("sourceId");

-- CreateIndex
CREATE INDEX "LeadChatwit_usuarioId_idx" ON "LeadChatwit"("usuarioId");

-- CreateIndex
CREATE INDEX "LeadChatwit_sourceId_idx" ON "LeadChatwit"("sourceId");

-- CreateIndex
CREATE INDEX "LeadChatwit_espelhoBibliotecaId_idx" ON "LeadChatwit"("espelhoBibliotecaId");

-- CreateIndex
CREATE INDEX "LeadChatwit_especialidade_idx" ON "LeadChatwit"("especialidade");

-- CreateIndex
CREATE INDEX "ArquivoLeadChatwit_leadId_idx" ON "ArquivoLeadChatwit"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConfig_caixaEntradaId_key" ON "WhatsAppConfig"("caixaEntradaId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConfig_usuarioChatwitId_caixaEntradaId_key" ON "WhatsAppConfig"("usuarioChatwitId", "caixaEntradaId");

-- CreateIndex
CREATE INDEX "WhatsAppTemplate_usuarioChatwitId_idx" ON "WhatsAppTemplate"("usuarioChatwitId");

-- CreateIndex
CREATE INDEX "WhatsAppTemplate_caixaEntradaId_idx" ON "WhatsAppTemplate"("caixaEntradaId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplate_templateId_usuarioChatwitId_key" ON "WhatsAppTemplate"("templateId", "usuarioChatwitId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplate_templateId_key" ON "WhatsAppTemplate"("templateId");

-- CreateIndex
CREATE INDEX "ChatSession_userId_idx" ON "ChatSession"("userId");

-- CreateIndex
CREATE INDEX "ChatSession_createdAt_idx" ON "ChatSession"("createdAt");

-- CreateIndex
CREATE INDEX "ChatSession_lastResponseId_idx" ON "ChatSession"("lastResponseId");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX "ChatMessage_responseId_idx" ON "ChatMessage"("responseId");

-- CreateIndex
CREATE INDEX "ChatFile_sessionId_idx" ON "ChatFile"("sessionId");

-- CreateIndex
CREATE INDEX "ChatFile_openaiFileId_idx" ON "ChatFile"("openaiFileId");

-- CreateIndex
CREATE INDEX "GeneratedImage_userId_idx" ON "GeneratedImage"("userId");

-- CreateIndex
CREATE INDEX "GeneratedImage_sessionId_idx" ON "GeneratedImage"("sessionId");

-- CreateIndex
CREATE INDEX "GeneratedImage_createdAt_idx" ON "GeneratedImage"("createdAt");

-- CreateIndex
CREATE INDEX "GeneratedImage_responseId_idx" ON "GeneratedImage"("responseId");

-- CreateIndex
CREATE INDEX "GeneratedImage_previousResponseId_idx" ON "GeneratedImage"("previousResponseId");

-- CreateIndex
CREATE INDEX "GeneratedImage_openaiFileId_idx" ON "GeneratedImage"("openaiFileId");

-- CreateIndex
CREATE UNIQUE INDEX "ButtonReactionMapping_buttonId_key" ON "ButtonReactionMapping"("buttonId");

-- CreateIndex
CREATE INDEX "ButtonReactionMapping_buttonId_idx" ON "ButtonReactionMapping"("buttonId");

-- CreateIndex
CREATE INDEX "ButtonReactionMapping_isActive_idx" ON "ButtonReactionMapping"("isActive");

-- CreateIndex
CREATE INDEX "ButtonReactionMapping_messageId_idx" ON "ButtonReactionMapping"("messageId");

-- CreateIndex
CREATE INDEX "ButtonReactionMapping_createdBy_idx" ON "ButtonReactionMapping"("createdBy");

-- CreateIndex
CREATE INDEX "EspelhoBiblioteca_criadoPorId_idx" ON "EspelhoBiblioteca"("criadoPorId");

-- CreateIndex
CREATE INDEX "EspelhoBiblioteca_isAtivo_idx" ON "EspelhoBiblioteca"("isAtivo");

-- CreateIndex
CREATE INDEX "EspelhoBiblioteca_nome_idx" ON "EspelhoBiblioteca"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "EspelhoPadrao_especialidade_key" ON "EspelhoPadrao"("especialidade");

-- CreateIndex
CREATE INDEX "EspelhoPadrao_especialidade_idx" ON "EspelhoPadrao"("especialidade");

-- CreateIndex
CREATE INDEX "EspelhoPadrao_isAtivo_idx" ON "EspelhoPadrao"("isAtivo");

-- CreateIndex
CREATE INDEX "MtfDiamanteConfig_userId_idx" ON "MtfDiamanteConfig"("userId");

-- CreateIndex
CREATE INDEX "MtfDiamanteConfig_isActive_idx" ON "MtfDiamanteConfig"("isActive");

-- CreateIndex
CREATE INDEX "MtfDiamanteVariavel_configId_idx" ON "MtfDiamanteVariavel"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "MtfDiamanteVariavel_configId_chave_key" ON "MtfDiamanteVariavel"("configId", "chave");

-- CreateIndex
CREATE INDEX "MtfDiamanteLote_configId_idx" ON "MtfDiamanteLote"("configId");

-- CreateIndex
CREATE INDEX "MtfDiamanteLote_numero_idx" ON "MtfDiamanteLote"("numero");

-- CreateIndex
CREATE INDEX "MtfDiamanteIntentMapping_configId_idx" ON "MtfDiamanteIntentMapping"("configId");

-- CreateIndex
CREATE INDEX "MtfDiamanteIntentMapping_intentName_idx" ON "MtfDiamanteIntentMapping"("intentName");

-- CreateIndex
CREATE UNIQUE INDEX "MtfDiamanteIntentMapping_configId_intentName_key" ON "MtfDiamanteIntentMapping"("configId", "intentName");

-- CreateIndex
CREATE INDEX "DisparoMtfDiamante_userId_idx" ON "DisparoMtfDiamante"("userId");

-- CreateIndex
CREATE INDEX "DisparoMtfDiamante_status_idx" ON "DisparoMtfDiamante"("status");

-- CreateIndex
CREATE INDEX "DisparoMtfDiamante_scheduledAt_idx" ON "DisparoMtfDiamante"("scheduledAt");

-- CreateIndex
CREATE INDEX "DisparoMtfDiamante_leadId_idx" ON "DisparoMtfDiamante"("leadId");

-- CreateIndex
CREATE INDEX "ModeloRecurso_isGlobal_idx" ON "ModeloRecurso"("isGlobal");

-- CreateIndex
CREATE UNIQUE INDEX "caixa_entrada_usuarioChatwitId_inboxId_key" ON "caixa_entrada"("usuarioChatwitId", "inboxId");

-- CreateIndex
CREATE UNIQUE INDEX "MapeamentoIntencao_intentName_caixaEntradaId_key" ON "MapeamentoIntencao"("intentName", "caixaEntradaId");

-- CreateIndex
CREATE INDEX "template_library_createdById_idx" ON "template_library"("createdById");

-- CreateIndex
CREATE INDEX "template_library_type_idx" ON "template_library"("type");

-- CreateIndex
CREATE INDEX "template_library_scope_idx" ON "template_library"("scope");

-- CreateIndex
CREATE INDEX "template_library_isActive_idx" ON "template_library"("isActive");

-- CreateIndex
CREATE INDEX "template_library_category_idx" ON "template_library"("category");

-- CreateIndex
CREATE INDEX "template_approval_request_templateLibraryId_idx" ON "template_approval_request"("templateLibraryId");

-- CreateIndex
CREATE INDEX "template_approval_request_requestedById_idx" ON "template_approval_request"("requestedById");

-- CreateIndex
CREATE INDEX "template_approval_request_status_idx" ON "template_approval_request"("status");

-- CreateIndex
CREATE INDEX "webhook_message_whatsappMessageId_idx" ON "webhook_message"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "webhook_message_conversationId_idx" ON "webhook_message"("conversationId");

-- CreateIndex
CREATE INDEX "webhook_message_contactPhone_idx" ON "webhook_message"("contactPhone");

-- CreateIndex
CREATE INDEX "webhook_message_inboxId_idx" ON "webhook_message"("inboxId");

-- CreateIndex
CREATE INDEX "webhook_message_timestamp_idx" ON "webhook_message"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_thread_whatsappConversationId_key" ON "conversation_thread"("whatsappConversationId");

-- CreateIndex
CREATE INDEX "conversation_thread_contactPhone_idx" ON "conversation_thread"("contactPhone");

-- CreateIndex
CREATE INDEX "conversation_thread_lastMessageAt_idx" ON "conversation_thread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "InteractiveMessage_caixaId_idx" ON "InteractiveMessage"("caixaId");

-- CreateIndex
CREATE INDEX "InteractiveMessage_type_idx" ON "InteractiveMessage"("type");

-- CreateIndex
CREATE INDEX "InteractiveMessage_createdById_idx" ON "InteractiveMessage"("createdById");

-- CreateIndex
CREATE INDEX "InteractiveMessage_isActive_idx" ON "InteractiveMessage"("isActive");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automacao" ADD CONSTRAINT "Automacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automacao" ADD CONSTRAINT "Automacao_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Pasta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automacao" ADD CONSTRAINT "Automacao_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAutomacao" ADD CONSTRAINT "LeadAutomacao_leadIgSenderId_fkey" FOREIGN KEY ("leadIgSenderId") REFERENCES "Lead"("igSenderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAutomacao" ADD CONSTRAINT "LeadAutomacao_automacaoId_fkey" FOREIGN KEY ("automacaoId") REFERENCES "Automacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pasta" ADD CONSTRAINT "Pasta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Midia" ADD CONSTRAINT "Midia_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("igSenderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioChatwit" ADD CONSTRAINT "UsuarioChatwit_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "caixa_entrada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractiveContent" ADD CONSTRAINT "InteractiveContent_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractiveContent" ADD CONSTRAINT "InteractiveContent_bodyId_fkey" FOREIGN KEY ("bodyId") REFERENCES "Body"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Header" ADD CONSTRAINT "Header_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Footer" ADD CONSTRAINT "Footer_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionCtaUrl" ADD CONSTRAINT "ActionCtaUrl_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionReplyButton" ADD CONSTRAINT "ActionReplyButton_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionList" ADD CONSTRAINT "ActionList_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionFlow" ADD CONSTRAINT "ActionFlow_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLocationRequest" ADD CONSTRAINT "ActionLocationRequest_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppOfficialInfo" ADD CONSTRAINT "WhatsAppOfficialInfo_templateIdRel_fkey" FOREIGN KEY ("templateIdRel") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatwit" ADD CONSTRAINT "LeadChatwit_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChatwit" ADD CONSTRAINT "LeadChatwit_espelhoBibliotecaId_fkey" FOREIGN KEY ("espelhoBibliotecaId") REFERENCES "EspelhoBiblioteca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArquivoLeadChatwit" ADD CONSTRAINT "ArquivoLeadChatwit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "LeadChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConfig" ADD CONSTRAINT "WhatsAppConfig_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConfig" ADD CONSTRAINT "WhatsAppConfig_caixaEntradaId_fkey" FOREIGN KEY ("caixaEntradaId") REFERENCES "caixa_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppTemplate" ADD CONSTRAINT "WhatsAppTemplate_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppTemplate" ADD CONSTRAINT "WhatsAppTemplate_caixaEntradaId_fkey" FOREIGN KEY ("caixaEntradaId") REFERENCES "caixa_entrada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatFile" ADD CONSTRAINT "ChatFile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImage" ADD CONSTRAINT "GeneratedImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImage" ADD CONSTRAINT "GeneratedImage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButtonReactionMapping" ADD CONSTRAINT "ButtonReactionMapping_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "InteractiveMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButtonReactionMapping" ADD CONSTRAINT "ButtonReactionMapping_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspelhoBiblioteca" ADD CONSTRAINT "EspelhoBiblioteca_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspelhoPadrao" ADD CONSTRAINT "EspelhoPadrao_atualizadoPorId_fkey" FOREIGN KEY ("atualizadoPorId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MtfDiamanteConfig" ADD CONSTRAINT "MtfDiamanteConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MtfDiamanteVariavel" ADD CONSTRAINT "MtfDiamanteVariavel_configId_fkey" FOREIGN KEY ("configId") REFERENCES "MtfDiamanteConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MtfDiamanteLote" ADD CONSTRAINT "MtfDiamanteLote_configId_fkey" FOREIGN KEY ("configId") REFERENCES "MtfDiamanteConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MtfDiamanteIntentMapping" ADD CONSTRAINT "MtfDiamanteIntentMapping_configId_fkey" FOREIGN KEY ("configId") REFERENCES "MtfDiamanteConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisparoMtfDiamante" ADD CONSTRAINT "DisparoMtfDiamante_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_oab" ADD CONSTRAINT "lote_oab_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_interativa" ADD CONSTRAINT "mensagem_interativa_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_interativa" ADD CONSTRAINT "mensagem_interativa_caixaEntradaId_fkey" FOREIGN KEY ("caixaEntradaId") REFERENCES "caixa_entrada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "botao_mensagem" ADD CONSTRAINT "botao_mensagem_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "mensagem_interativa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa_entrada" ADD CONSTRAINT "caixa_entrada_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa_entrada" ADD CONSTRAINT "caixa_entrada_fallbackParaCaixaId_fkey" FOREIGN KEY ("fallbackParaCaixaId") REFERENCES "caixa_entrada"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agente_dialogflow" ADD CONSTRAINT "agente_dialogflow_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_dialogflow" ADD CONSTRAINT "agente_dialogflow_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "caixa_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_oab" ADD CONSTRAINT "lead_oab_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_oab" ADD CONSTRAINT "lead_oab_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lote_oab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_caixaEntradaId_fkey" FOREIGN KEY ("caixaEntradaId") REFERENCES "caixa_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("templateId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_mensagemInterativaId_fkey" FOREIGN KEY ("mensagemInterativaId") REFERENCES "mensagem_interativa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_unifiedTemplateId_fkey" FOREIGN KEY ("unifiedTemplateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_interactiveMessageId_fkey" FOREIGN KEY ("interactiveMessageId") REFERENCES "InteractiveMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_library" ADD CONSTRAINT "template_library_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_approval_request" ADD CONSTRAINT "template_approval_request_templateLibraryId_fkey" FOREIGN KEY ("templateLibraryId") REFERENCES "template_library"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_approval_request" ADD CONSTRAINT "template_approval_request_unifiedTemplateId_fkey" FOREIGN KEY ("unifiedTemplateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_approval_request" ADD CONSTRAINT "template_approval_request_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_approval_request" ADD CONSTRAINT "template_approval_request_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractiveMessage" ADD CONSTRAINT "InteractiveMessage_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "caixa_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractiveMessage" ADD CONSTRAINT "InteractiveMessage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
