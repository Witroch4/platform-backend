-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('DEFAULT', 'ADMIN', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED');

-- CreateEnum
CREATE TYPE "public"."EspecialidadeJuridica" AS ENUM ('ADMINISTRATIVO', 'CIVIL', 'CONSTITUCIONAL', 'TRABALHO', 'EMPRESARIAL', 'PENAL', 'TRIBUTARIO');

-- CreateEnum
CREATE TYPE "public"."LeadSource" AS ENUM ('INSTAGRAM', 'CHATWIT_OAB', 'MANUAL');

-- CreateEnum
CREATE TYPE "public"."TemplateType" AS ENUM ('WHATSAPP_OFFICIAL', 'INTERACTIVE_MESSAGE', 'AUTOMATION_REPLY');

-- CreateEnum
CREATE TYPE "public"."TemplateScope" AS ENUM ('GLOBAL', 'PRIVATE');

-- CreateEnum
CREATE TYPE "public"."TemplateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."ActionType" AS ENUM ('SEND_TEMPLATE', 'ADD_TAG', 'START_FLOW', 'ASSIGN_TO_AGENT');

-- CreateEnum
CREATE TYPE "public"."QueueState" AS ENUM ('healthy', 'warning', 'critical', 'paused', 'stopped');

-- CreateEnum
CREATE TYPE "public"."JobState" AS ENUM ('waiting', 'active', 'completed', 'failed', 'delayed', 'paused', 'stuck');

-- CreateEnum
CREATE TYPE "public"."AlertSeverity" AS ENUM ('info', 'warning', 'error', 'critical');

-- CreateEnum
CREATE TYPE "public"."AlertStatus" AS ENUM ('active', 'acknowledged', 'resolved');

-- CreateEnum
CREATE TYPE "public"."MetricType" AS ENUM ('counter', 'gauge', 'histogram', 'summary');

-- CreateEnum
CREATE TYPE "public"."TimeGranularity" AS ENUM ('ONE_MINUTE', 'FIVE_MINUTES', 'ONE_HOUR', 'ONE_DAY', 'ONE_WEEK', 'ONE_MONTH');

-- CreateEnum
CREATE TYPE "public"."EventType" AS ENUM ('QUEUE_CREATED', 'QUEUE_UPDATED', 'QUEUE_DELETED', 'QUEUE_PAUSED', 'QUEUE_RESUMED', 'JOB_CREATED', 'JOB_STARTED', 'JOB_COMPLETED', 'JOB_FAILED', 'JOB_RETRIED', 'JOB_REMOVED', 'JOB_PROMOTED', 'JOB_DELAYED', 'FLOW_STARTED', 'FLOW_COMPLETED', 'FLOW_FAILED', 'FLOW_CANCELLED', 'ALERT_TRIGGERED', 'ALERT_ACKNOWLEDGED', 'ALERT_RESOLVED', 'ALERT_ESCALATED', 'SYSTEM_STARTED', 'SYSTEM_STOPPED', 'SYSTEM_ERROR', 'USER_LOGIN', 'USER_LOGOUT', 'USER_ACTION');

-- CreateEnum
CREATE TYPE "public"."WebhookEvent" AS ENUM ('QUEUE_HEALTH_CHANGED', 'JOB_COMPLETED', 'JOB_FAILED', 'ALERT_TRIGGERED', 'FLOW_COMPLETED', 'FLOW_FAILED');

-- CreateEnum
CREATE TYPE "public"."QueueUserRole" AS ENUM ('viewer', 'operator', 'admin', 'superadmin');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "public"."UserRole" NOT NULL DEFAULT 'DEFAULT',
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
CREATE TABLE "public"."Account" (
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

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "source" "public"."LeadSource" NOT NULL,
    "sourceIdentifier" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "accountId" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadInstagramProfile" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "isFollower" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LeadInstagramProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadOabData" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "nomeReal" TEXT,
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
    "especialidade" "public"."EspecialidadeJuridica",
    "usuarioChatwitId" TEXT NOT NULL,
    "espelhoBibliotecaId" TEXT,

    CONSTRAINT "LeadOabData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ArquivoLeadOab" (
    "id" TEXT NOT NULL,
    "leadOabDataId" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "pdfConvertido" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArquivoLeadOab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UsuarioChatwit" (
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
CREATE TABLE "public"."WhatsAppGlobalConfig" (
    "id" TEXT NOT NULL,
    "usuarioChatwitId" TEXT NOT NULL,
    "whatsappApiKey" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "whatsappBusinessAccountId" TEXT NOT NULL,
    "graphApiBaseUrl" TEXT NOT NULL DEFAULT 'https://graph.facebook.com/v22.0',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppGlobalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatwitInbox" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usuarioChatwitId" TEXT NOT NULL,
    "whatsappApiKey" TEXT,
    "phoneNumberId" TEXT,
    "whatsappBusinessAccountId" TEXT,
    "fallbackParaInboxId" TEXT,

    CONSTRAINT "ChatwitInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "public"."TemplateType" NOT NULL,
    "scope" "public"."TemplateScope" NOT NULL DEFAULT 'PRIVATE',
    "status" "public"."TemplateStatus" NOT NULL DEFAULT 'APPROVED',
    "language" TEXT NOT NULL DEFAULT 'pt_BR',
    "tags" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "simpleReplyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "inboxId" TEXT,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TemplateApprovalRequest" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestMessage" TEXT,
    "responseMessage" TEXT,
    "requestedById" TEXT NOT NULL,
    "processedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "TemplateApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MapeamentoBotao" (
    "id" TEXT NOT NULL,
    "buttonId" TEXT NOT NULL,
    "actionType" "public"."ActionType" NOT NULL,
    "actionPayload" JSONB NOT NULL,
    "description" TEXT,
    "inboxId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapeamentoBotao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InteractiveContent" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "bodyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteractiveContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WhatsAppOfficialInfo" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "metaTemplateId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "qualityScore" TEXT,
    "components" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppOfficialInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Header" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "interactiveContentId" TEXT NOT NULL,

    CONSTRAINT "Header_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Body" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "Body_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Footer" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "interactiveContentId" TEXT NOT NULL,

    CONSTRAINT "Footer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActionCtaUrl" (
    "id" TEXT NOT NULL,
    "displayText" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "interactiveContentId" TEXT NOT NULL,

    CONSTRAINT "ActionCtaUrl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActionReplyButton" (
    "id" TEXT NOT NULL,
    "buttons" JSONB NOT NULL,
    "interactiveContentId" TEXT NOT NULL,

    CONSTRAINT "ActionReplyButton_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActionList" (
    "id" TEXT NOT NULL,
    "buttonText" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "interactiveContentId" TEXT NOT NULL,

    CONSTRAINT "ActionList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActionFlow" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "flowCta" TEXT NOT NULL,
    "flowMode" TEXT NOT NULL DEFAULT 'published',
    "flowData" JSONB,
    "interactiveContentId" TEXT NOT NULL,

    CONSTRAINT "ActionFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActionLocationRequest" (
    "id" TEXT NOT NULL,
    "requestText" TEXT NOT NULL,
    "interactiveContentId" TEXT NOT NULL,

    CONSTRAINT "ActionLocationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgenteDialogflow" (
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
    "inboxId" TEXT NOT NULL,

    CONSTRAINT "AgenteDialogflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MapeamentoIntencao" (
    "id" TEXT NOT NULL,
    "intentName" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapeamentoIntencao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Automacao" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT,
    "accountId" TEXT NOT NULL,
    "selectedMediaId" TEXT,
    "anyMediaSelected" BOOLEAN NOT NULL DEFAULT false,
    "anyword" BOOLEAN NOT NULL DEFAULT true,
    "palavrasChave" TEXT,
    "fraseBoasVindas" TEXT,
    "publicReply" TEXT,
    "buttonPayload" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadAutomacao" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "automacaoId" TEXT NOT NULL,
    "linkSent" BOOLEAN NOT NULL DEFAULT false,
    "waitingForEmail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAutomacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MtfDiamanteConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MtfDiamanteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MtfDiamanteVariavel" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MtfDiamanteVariavel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DisparoMtfDiamante" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
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
CREATE TABLE "public"."VerificationToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TwoFactorToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwoFactorToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ResetPasswordToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResetPasswordToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Pasta" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pasta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "status" "public"."SubscriptionStatus" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
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
CREATE TABLE "public"."Agendamento" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT,
    "facebook" BOOLEAN NOT NULL DEFAULT false,
    "instagram" BOOLEAN NOT NULL DEFAULT false,
    "linkedin" BOOLEAN NOT NULL DEFAULT false,
    "x" BOOLEAN NOT NULL DEFAULT false,
    "stories" BOOLEAN NOT NULL DEFAULT false,
    "reels" BOOLEAN NOT NULL DEFAULT false,
    "postNormal" BOOLEAN NOT NULL DEFAULT false,
    "diario" BOOLEAN NOT NULL DEFAULT false,
    "semanal" BOOLEAN NOT NULL DEFAULT false,
    "randomizar" BOOLEAN NOT NULL DEFAULT false,
    "tratarComoUnicoPost" BOOLEAN NOT NULL DEFAULT false,
    "tratarComoPostagensIndividuais" BOOLEAN NOT NULL DEFAULT false,
    "concluidoFB" BOOLEAN NOT NULL DEFAULT false,
    "concluidoIG" BOOLEAN NOT NULL DEFAULT false,
    "concluidoLK" BOOLEAN NOT NULL DEFAULT false,
    "concluidoX" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agendamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Midia" (
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
CREATE TABLE "public"."Chat" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isFromLead" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nova conversa',
    "model" TEXT NOT NULL DEFAULT 'chatgpt-4o-latest',
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "audioData" TEXT,
    "imageUrl" TEXT,
    "modelUsed" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "temperature" DOUBLE PRECISION,
    "topP" DOUBLE PRECISION,
    "responseStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatFile" (
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
CREATE TABLE "public"."GeneratedImage" (
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
    "openaiFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EspelhoBiblioteca" (
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
CREATE TABLE "public"."EspelhoPadrao" (
    "id" TEXT NOT NULL,
    "especialidade" "public"."EspecialidadeJuridica" NOT NULL,
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
CREATE TABLE "public"."ModeloRecurso" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModeloRecurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WebhookMessage" (
    "id" TEXT NOT NULL,
    "whatsappMessageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "messageContent" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "inboxId" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConversationThread" (
    "id" TEXT NOT NULL,
    "whatsappConversationId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeatureFlag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercentage" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "featureFlagContext" JSONB,
    "systemContext" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QueueConfig" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(255),
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "rateLimiter" JSONB,
    "retryPolicy" JSONB NOT NULL,
    "cleanupPolicy" JSONB NOT NULL,
    "alertThresholds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" VARCHAR(255) NOT NULL,

    CONSTRAINT "QueueConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QueueMetrics" (
    "id" TEXT NOT NULL,
    "queueName" VARCHAR(255) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "waitingCount" INTEGER NOT NULL,
    "activeCount" INTEGER NOT NULL,
    "completedCount" INTEGER NOT NULL,
    "failedCount" INTEGER NOT NULL,
    "delayedCount" INTEGER NOT NULL,
    "throughputPerMinute" DECIMAL(10,2),
    "avgProcessingTime" DECIMAL(10,2),
    "successRate" DECIMAL(5,2),
    "errorRate" DECIMAL(5,2),
    "memoryUsage" BIGINT,
    "cpuUsage" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JobMetrics" (
    "id" TEXT NOT NULL,
    "jobId" VARCHAR(255) NOT NULL,
    "queueName" VARCHAR(255) NOT NULL,
    "jobName" VARCHAR(255),
    "jobType" VARCHAR(255),
    "status" "public"."JobState" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "processingTime" INTEGER,
    "waitTime" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "memoryPeak" BIGINT,
    "cpuTime" INTEGER,
    "errorMessage" TEXT,
    "correlationId" VARCHAR(255),
    "flowId" VARCHAR(255),
    "parentJobId" VARCHAR(255),
    "payloadSize" INTEGER,
    "resultSize" INTEGER,

    CONSTRAINT "JobMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AlertRule" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "queueName" VARCHAR(255),
    "condition" JSONB NOT NULL,
    "severity" "public"."AlertSeverity" NOT NULL,
    "channels" JSONB NOT NULL,
    "cooldown" INTEGER NOT NULL DEFAULT 5,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" VARCHAR(255) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Alert" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "queueName" VARCHAR(255),
    "severity" "public"."AlertSeverity" NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "message" TEXT NOT NULL,
    "metrics" JSONB,
    "status" "public"."AlertStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" VARCHAR(255),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JobFlow" (
    "id" TEXT NOT NULL,
    "flowId" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "description" TEXT,
    "rootJobId" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "totalJobs" INTEGER NOT NULL DEFAULT 0,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "failedJobs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "estimatedCompletion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "JobFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JobDependency" (
    "id" TEXT NOT NULL,
    "flowId" VARCHAR(255) NOT NULL,
    "jobId" VARCHAR(255) NOT NULL,
    "parentJobId" VARCHAR(255),
    "dependencyType" VARCHAR(50) NOT NULL DEFAULT 'sequential',
    "condition" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemConfig" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" VARCHAR(255),

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QueueUser" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "role" "public"."QueueUserRole" NOT NULL DEFAULT 'viewer',
    "permissions" JSONB,
    "queueAccess" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "QueueUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "userId" VARCHAR(255) NOT NULL,
    "action" VARCHAR(255) NOT NULL,
    "resourceType" VARCHAR(100) NOT NULL,
    "resourceId" VARCHAR(255),
    "queueName" VARCHAR(255),
    "details" JSONB,
    "ipAddress" INET,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AutomationPolicy" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "queueName" VARCHAR(255),
    "triggerCondition" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" VARCHAR(255) NOT NULL,
    "lastExecuted" TIMESTAMP(3),
    "executionCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AutomationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WebhookConfig" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "url" VARCHAR(1000) NOT NULL,
    "events" JSONB NOT NULL,
    "headers" JSONB,
    "secret" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "retryPolicy" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" VARCHAR(255) NOT NULL,

    CONSTRAINT "WebhookConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventType" "public"."WebhookEvent" NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "public"."Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "public"."Account"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "Lead_userId_accountId_email_phone_idx" ON "public"."Lead"("userId", "accountId", "email", "phone");

-- CreateIndex
CREATE INDEX "Lead_tags_idx" ON "public"."Lead"("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_source_sourceIdentifier_accountId_key" ON "public"."Lead"("source", "sourceIdentifier", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadInstagramProfile_leadId_key" ON "public"."LeadInstagramProfile"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadOabData_leadId_key" ON "public"."LeadOabData"("leadId");

-- CreateIndex
CREATE INDEX "LeadOabData_usuarioChatwitId_espelhoBibliotecaId_idx" ON "public"."LeadOabData"("usuarioChatwitId", "espelhoBibliotecaId");

-- CreateIndex
CREATE INDEX "ArquivoLeadOab_leadOabDataId_idx" ON "public"."ArquivoLeadOab"("leadOabDataId");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioChatwit_appUserId_key" ON "public"."UsuarioChatwit"("appUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioChatwit_chatwitAccessToken_key" ON "public"."UsuarioChatwit"("chatwitAccessToken");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppGlobalConfig_usuarioChatwitId_key" ON "public"."WhatsAppGlobalConfig"("usuarioChatwitId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatwitInbox_usuarioChatwitId_inboxId_key" ON "public"."ChatwitInbox"("usuarioChatwitId", "inboxId");

-- CreateIndex
CREATE INDEX "Template_createdById_inboxId_type_scope_status_isActive_idx" ON "public"."Template"("createdById", "inboxId", "type", "scope", "status", "isActive");

-- CreateIndex
CREATE INDEX "TemplateApprovalRequest_templateId_requestedById_status_idx" ON "public"."TemplateApprovalRequest"("templateId", "requestedById", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MapeamentoBotao_buttonId_key" ON "public"."MapeamentoBotao"("buttonId");

-- CreateIndex
CREATE INDEX "MapeamentoBotao_inboxId_idx" ON "public"."MapeamentoBotao"("inboxId");

-- CreateIndex
CREATE UNIQUE INDEX "InteractiveContent_templateId_key" ON "public"."InteractiveContent"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppOfficialInfo_templateId_key" ON "public"."WhatsAppOfficialInfo"("templateId");

-- CreateIndex
CREATE INDEX "WhatsAppOfficialInfo_metaTemplateId_status_idx" ON "public"."WhatsAppOfficialInfo"("metaTemplateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Header_interactiveContentId_key" ON "public"."Header"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "Footer_interactiveContentId_key" ON "public"."Footer"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionCtaUrl_interactiveContentId_key" ON "public"."ActionCtaUrl"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionReplyButton_interactiveContentId_key" ON "public"."ActionReplyButton"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionList_interactiveContentId_key" ON "public"."ActionList"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionFlow_interactiveContentId_key" ON "public"."ActionFlow"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionLocationRequest_interactiveContentId_key" ON "public"."ActionLocationRequest"("interactiveContentId");

-- CreateIndex
CREATE UNIQUE INDEX "MapeamentoIntencao_intentName_inboxId_key" ON "public"."MapeamentoIntencao"("intentName", "inboxId");

-- CreateIndex
CREATE UNIQUE INDEX "Automacao_buttonPayload_key" ON "public"."Automacao"("buttonPayload");

-- CreateIndex
CREATE INDEX "Automacao_userId_accountId_idx" ON "public"."Automacao"("userId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadAutomacao_leadId_automacaoId_key" ON "public"."LeadAutomacao"("leadId", "automacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "MtfDiamanteConfig_userId_key" ON "public"."MtfDiamanteConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MtfDiamanteVariavel_configId_chave_key" ON "public"."MtfDiamanteVariavel"("configId", "chave");

-- CreateIndex
CREATE INDEX "DisparoMtfDiamante_userId_status_leadId_idx" ON "public"."DisparoMtfDiamante"("userId", "status", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "public"."VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_email_token_key" ON "public"."VerificationToken"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorToken_token_key" ON "public"."TwoFactorToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorToken_email_token_key" ON "public"."TwoFactorToken"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "ResetPasswordToken_token_key" ON "public"."ResetPasswordToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ResetPasswordToken_email_token_key" ON "public"."ResetPasswordToken"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "public"."Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "public"."Notification"("userId");

-- CreateIndex
CREATE INDEX "Midia_agendamentoId_idx" ON "public"."Midia"("agendamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "Chat_leadId_accountId_key" ON "public"."Chat"("leadId", "accountId");

-- CreateIndex
CREATE INDEX "Message_chatId_idx" ON "public"."Message"("chatId");

-- CreateIndex
CREATE INDEX "ChatSession_userId_idx" ON "public"."ChatSession"("userId");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "public"."ChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX "ChatFile_sessionId_openaiFileId_idx" ON "public"."ChatFile"("sessionId", "openaiFileId");

-- CreateIndex
CREATE INDEX "GeneratedImage_userId_sessionId_idx" ON "public"."GeneratedImage"("userId", "sessionId");

-- CreateIndex
CREATE INDEX "EspelhoBiblioteca_criadoPorId_isAtivo_idx" ON "public"."EspelhoBiblioteca"("criadoPorId", "isAtivo");

-- CreateIndex
CREATE UNIQUE INDEX "EspelhoPadrao_especialidade_key" ON "public"."EspelhoPadrao"("especialidade");

-- CreateIndex
CREATE INDEX "EspelhoPadrao_isAtivo_idx" ON "public"."EspelhoPadrao"("isAtivo");

-- CreateIndex
CREATE INDEX "ModeloRecurso_isGlobal_idx" ON "public"."ModeloRecurso"("isGlobal");

-- CreateIndex
CREATE INDEX "WebhookMessage_whatsappMessageId_conversationId_contactPhon_idx" ON "public"."WebhookMessage"("whatsappMessageId", "conversationId", "contactPhone", "processed");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationThread_whatsappConversationId_key" ON "public"."ConversationThread"("whatsappConversationId");

-- CreateIndex
CREATE INDEX "ConversationThread_contactPhone_lastMessageAt_idx" ON "public"."ConversationThread"("contactPhone", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_name_key" ON "public"."FeatureFlag"("name");

-- CreateIndex
CREATE INDEX "UserFeedback_type_severity_status_idx" ON "public"."UserFeedback"("type", "severity", "status");

-- CreateIndex
CREATE INDEX "UserFeedback_createdAt_idx" ON "public"."UserFeedback"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QueueConfig_name_key" ON "public"."QueueConfig"("name");

-- CreateIndex
CREATE INDEX "QueueConfig_name_priority_idx" ON "public"."QueueConfig"("name", "priority");

-- CreateIndex
CREATE INDEX "QueueMetrics_queueName_timestamp_idx" ON "public"."QueueMetrics"("queueName", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "QueueMetrics_timestamp_idx" ON "public"."QueueMetrics"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "JobMetrics_queueName_status_idx" ON "public"."JobMetrics"("queueName", "status");

-- CreateIndex
CREATE INDEX "JobMetrics_correlationId_idx" ON "public"."JobMetrics"("correlationId");

-- CreateIndex
CREATE INDEX "JobMetrics_flowId_idx" ON "public"."JobMetrics"("flowId");

-- CreateIndex
CREATE INDEX "JobMetrics_createdAt_idx" ON "public"."JobMetrics"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AlertRule_queueName_enabled_idx" ON "public"."AlertRule"("queueName", "enabled");

-- CreateIndex
CREATE INDEX "Alert_ruleId_status_idx" ON "public"."Alert"("ruleId", "status");

-- CreateIndex
CREATE INDEX "Alert_severity_createdAt_idx" ON "public"."Alert"("severity", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "JobFlow_flowId_key" ON "public"."JobFlow"("flowId");

-- CreateIndex
CREATE INDEX "JobFlow_status_createdAt_idx" ON "public"."JobFlow"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "JobDependency_flowId_jobId_idx" ON "public"."JobDependency"("flowId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "public"."SystemConfig"("key");

-- CreateIndex
CREATE INDEX "SystemConfig_category_idx" ON "public"."SystemConfig"("category");

-- CreateIndex
CREATE UNIQUE INDEX "QueueUser_userId_key" ON "public"."QueueUser"("userId");

-- CreateIndex
CREATE INDEX "QueueUser_role_email_idx" ON "public"."QueueUser"("role", "email");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "public"."AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "public"."AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AutomationPolicy_enabled_priority_idx" ON "public"."AutomationPolicy"("enabled", "priority");

-- CreateIndex
CREATE INDEX "AutomationPolicy_queueName_idx" ON "public"."AutomationPolicy"("queueName");

-- CreateIndex
CREATE INDEX "WebhookConfig_enabled_idx" ON "public"."WebhookConfig"("enabled");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_eventType_idx" ON "public"."WebhookDelivery"("webhookId", "eventType");

-- CreateIndex
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "public"."WebhookDelivery"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadInstagramProfile" ADD CONSTRAINT "LeadInstagramProfile_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadOabData" ADD CONSTRAINT "LeadOabData_espelhoBibliotecaId_fkey" FOREIGN KEY ("espelhoBibliotecaId") REFERENCES "public"."EspelhoBiblioteca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadOabData" ADD CONSTRAINT "LeadOabData_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadOabData" ADD CONSTRAINT "LeadOabData_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "public"."UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArquivoLeadOab" ADD CONSTRAINT "ArquivoLeadOab_leadOabDataId_fkey" FOREIGN KEY ("leadOabDataId") REFERENCES "public"."LeadOabData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UsuarioChatwit" ADD CONSTRAINT "UsuarioChatwit_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WhatsAppGlobalConfig" ADD CONSTRAINT "WhatsAppGlobalConfig_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "public"."UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatwitInbox" ADD CONSTRAINT "ChatwitInbox_fallbackParaInboxId_fkey" FOREIGN KEY ("fallbackParaInboxId") REFERENCES "public"."ChatwitInbox"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."ChatwitInbox" ADD CONSTRAINT "ChatwitInbox_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "public"."UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Template" ADD CONSTRAINT "Template_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Template" ADD CONSTRAINT "Template_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "public"."ChatwitInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TemplateApprovalRequest" ADD CONSTRAINT "TemplateApprovalRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TemplateApprovalRequest" ADD CONSTRAINT "TemplateApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TemplateApprovalRequest" ADD CONSTRAINT "TemplateApprovalRequest_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MapeamentoBotao" ADD CONSTRAINT "MapeamentoBotao_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "public"."ChatwitInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InteractiveContent" ADD CONSTRAINT "InteractiveContent_bodyId_fkey" FOREIGN KEY ("bodyId") REFERENCES "public"."Body"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InteractiveContent" ADD CONSTRAINT "InteractiveContent_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WhatsAppOfficialInfo" ADD CONSTRAINT "WhatsAppOfficialInfo_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Header" ADD CONSTRAINT "Header_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "public"."InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Footer" ADD CONSTRAINT "Footer_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "public"."InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActionCtaUrl" ADD CONSTRAINT "ActionCtaUrl_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "public"."InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActionReplyButton" ADD CONSTRAINT "ActionReplyButton_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "public"."InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActionList" ADD CONSTRAINT "ActionList_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "public"."InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActionFlow" ADD CONSTRAINT "ActionFlow_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "public"."InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActionLocationRequest" ADD CONSTRAINT "ActionLocationRequest_interactiveContentId_fkey" FOREIGN KEY ("interactiveContentId") REFERENCES "public"."InteractiveContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgenteDialogflow" ADD CONSTRAINT "AgenteDialogflow_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "public"."ChatwitInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgenteDialogflow" ADD CONSTRAINT "AgenteDialogflow_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "public"."UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "public"."ChatwitInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Automacao" ADD CONSTRAINT "Automacao_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Automacao" ADD CONSTRAINT "Automacao_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "public"."Pasta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Automacao" ADD CONSTRAINT "Automacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadAutomacao" ADD CONSTRAINT "LeadAutomacao_automacaoId_fkey" FOREIGN KEY ("automacaoId") REFERENCES "public"."Automacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadAutomacao" ADD CONSTRAINT "LeadAutomacao_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MtfDiamanteConfig" ADD CONSTRAINT "MtfDiamanteConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MtfDiamanteVariavel" ADD CONSTRAINT "MtfDiamanteVariavel_configId_fkey" FOREIGN KEY ("configId") REFERENCES "public"."MtfDiamanteConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DisparoMtfDiamante" ADD CONSTRAINT "DisparoMtfDiamante_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DisparoMtfDiamante" ADD CONSTRAINT "DisparoMtfDiamante_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pasta" ADD CONSTRAINT "Pasta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Agendamento" ADD CONSTRAINT "Agendamento_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Agendamento" ADD CONSTRAINT "Agendamento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Midia" ADD CONSTRAINT "Midia_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "public"."Agendamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Chat" ADD CONSTRAINT "Chat_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Chat" ADD CONSTRAINT "Chat_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatFile" ADD CONSTRAINT "ChatFile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GeneratedImage" ADD CONSTRAINT "GeneratedImage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GeneratedImage" ADD CONSTRAINT "GeneratedImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EspelhoBiblioteca" ADD CONSTRAINT "EspelhoBiblioteca_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "public"."UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EspelhoPadrao" ADD CONSTRAINT "EspelhoPadrao_atualizadoPorId_fkey" FOREIGN KEY ("atualizadoPorId") REFERENCES "public"."UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Alert" ADD CONSTRAINT "Alert_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "public"."AlertRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JobDependency" ADD CONSTRAINT "JobDependency_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "public"."JobFlow"("flowId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "public"."WebhookConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
