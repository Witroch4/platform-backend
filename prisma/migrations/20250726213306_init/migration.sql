-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DEFAULT', 'ADMIN', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED');

-- CreateEnum
CREATE TYPE "EspecialidadeJuridica" AS ENUM ('ADMINISTRATIVO', 'CIVIL', 'CONSTITUCIONAL', 'TRABALHO', 'EMPRESARIAL', 'PENAL', 'TRIBUTARIO');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('INSTAGRAM', 'CHATWIT_OAB', 'MANUAL');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('WHATSAPP_OFFICIAL', 'INTERACTIVE_MESSAGE', 'AUTOMATION_REPLY');

-- CreateEnum
CREATE TYPE "TemplateScope" AS ENUM ('GLOBAL', 'PRIVATE');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('SEND_TEMPLATE', 'ADD_TAG', 'START_FLOW', 'ASSIGN_TO_AGENT');

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
CREATE TABLE "Account" (
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
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "source" "LeadSource" NOT NULL,
    "sourceIdentifier" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "accountId" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadInstagramProfile" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "isFollower" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LeadInstagramProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadOabData" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
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
    "especialidade" "EspecialidadeJuridica",
    "usuarioChatwitId" TEXT NOT NULL,
    "espelhoBibliotecaId" TEXT,

    CONSTRAINT "LeadOabData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArquivoLeadOab" (
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
CREATE TABLE "WhatsAppGlobalConfig" (
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
CREATE TABLE "ChatwitInbox" (
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
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "TemplateType" NOT NULL,
    "scope" "TemplateScope" NOT NULL DEFAULT 'PRIVATE',
    "status" "TemplateStatus" NOT NULL DEFAULT 'APPROVED',
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
CREATE TABLE "TemplateApprovalRequest" (
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
CREATE TABLE "MapeamentoBotao" (
    "id" TEXT NOT NULL,
    "buttonId" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "actionPayload" JSONB NOT NULL,
    "description" TEXT,
    "inboxId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapeamentoBotao_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "WhatsAppOfficialInfo" (
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
CREATE TABLE "Header" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "interactiveContentId" TEXT NOT NULL,

    CONSTRAINT "Header_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Body" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "Body_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Footer" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "interactiveContentId" TEXT NOT NULL,

    CONSTRAINT "Footer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionCtaUrl" (
    "id" TEXT NOT NULL,
    "displayText" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "interactiveContentId" TEXT NOT NULL,

    CONSTRAINT "ActionCtaUrl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionReplyButton" (
    "id" TEXT NOT NULL,
    "buttons" JSONB NOT NULL,
    "interactiveContentId" TEXT NOT NULL,

    CONSTRAINT "ActionReplyButton_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionList" (
    "id" TEXT NOT NULL,
    "buttonText" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "interactiveContentId" TEXT NOT NULL,

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

    CONSTRAINT "ActionFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLocationRequest" (
    "id" TEXT NOT NULL,
    "requestText" TEXT NOT NULL,
    "interactiveContentId" TEXT NOT NULL,

    CONSTRAINT "ActionLocationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgenteDialogflow" (
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
CREATE TABLE "MapeamentoIntencao" (
    "id" TEXT NOT NULL,
    "intentName" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "MapeamentoIntencao_pkey" PRIMARY KEY ("id")
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
    "publicReply" TEXT,
    "buttonPayload" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadAutomacao" (
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
    "configId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MtfDiamanteVariavel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisparoMtfDiamante" (
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
CREATE TABLE "ChatSession" (
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
CREATE TABLE "ChatMessage" (
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
    "openaiFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedImage_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "ModeloRecurso" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModeloRecurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookMessage" (
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
CREATE TABLE "ConversationThread" (
    "id" TEXT NOT NULL,
    "whatsappConversationId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "Lead_userId_accountId_email_phone_idx" ON "Lead"("userId", "accountId", "email", "phone");

-- CreateIndex
CREATE INDEX "Lead_tags_idx" ON "Lead"("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_source_sourceIdentifier_accountId_key" ON "Lead"("source", "sourceIdentifier", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadInstagramProfile_leadId_key" ON "LeadInstagramProfile"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadOabData_leadId_key" ON "LeadOabData"("leadId");

-- CreateIndex
CREATE INDEX "LeadOabData_usuarioChatwitId_espelhoBibliotecaId_idx" ON "LeadOabData"("usuarioChatwitId", "espelhoBibliotecaId");

-- CreateIndex
CREATE INDEX "ArquivoLeadOab_leadOabDataId_idx" ON "ArquivoLeadOab"("leadOabDataId");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioChatwit_appUserId_key" ON "UsuarioChatwit"("appUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioChatwit_chatwitAccessToken_key" ON "UsuarioChatwit"("chatwitAccessToken");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppGlobalConfig_usuarioChatwitId_key" ON "WhatsAppGlobalConfig"("usuarioChatwitId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatwitInbox_usuarioChatwitId_inboxId_key" ON "ChatwitInbox"("usuarioChatwitId", "inboxId");

-- CreateIndex
CREATE INDEX "Template_createdById_inboxId_type_scope_status_isActive_idx" ON "Template"("createdById", "inboxId", "type", "scope", "status", "isActive");

-- CreateIndex
CREATE INDEX "TemplateApprovalRequest_templateId_requestedById_status_idx" ON "TemplateApprovalRequest"("templateId", "requestedById", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MapeamentoBotao_buttonId_key" ON "MapeamentoBotao"("buttonId");

-- CreateIndex
CREATE INDEX "MapeamentoBotao_inboxId_idx" ON "MapeamentoBotao"("inboxId");

-- CreateIndex
CREATE UNIQUE INDEX "InteractiveContent_templateId_key" ON "InteractiveContent"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppOfficialInfo_templateId_key" ON "WhatsAppOfficialInfo"("templateId");

-- CreateIndex
CREATE INDEX "WhatsAppOfficialInfo_metaTemplateId_status_idx" ON "WhatsAppOfficialInfo"("metaTemplateId", "status");

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
CREATE UNIQUE INDEX "AgenteDialogflow_inboxId_key" ON "AgenteDialogflow"("inboxId");

-- CreateIndex
CREATE UNIQUE INDEX "MapeamentoIntencao_intentName_inboxId_key" ON "MapeamentoIntencao"("intentName", "inboxId");

-- CreateIndex
CREATE UNIQUE INDEX "Automacao_buttonPayload_key" ON "Automacao"("buttonPayload");

-- CreateIndex
CREATE INDEX "Automacao_userId_accountId_idx" ON "Automacao"("userId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadAutomacao_leadId_automacaoId_key" ON "LeadAutomacao"("leadId", "automacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "MtfDiamanteConfig_userId_key" ON "MtfDiamanteConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MtfDiamanteVariavel_configId_chave_key" ON "MtfDiamanteVariavel"("configId", "chave");

-- CreateIndex
CREATE INDEX "DisparoMtfDiamante_userId_status_leadId_idx" ON "DisparoMtfDiamante"("userId", "status", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_email_token_key" ON "VerificationToken"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorToken_token_key" ON "TwoFactorToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorToken_email_token_key" ON "TwoFactorToken"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "ResetPasswordToken_token_key" ON "ResetPasswordToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ResetPasswordToken_email_token_key" ON "ResetPasswordToken"("email", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Midia_agendamentoId_idx" ON "Midia"("agendamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "Chat_leadId_accountId_key" ON "Chat"("leadId", "accountId");

-- CreateIndex
CREATE INDEX "Message_chatId_idx" ON "Message"("chatId");

-- CreateIndex
CREATE INDEX "ChatSession_userId_idx" ON "ChatSession"("userId");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX "ChatFile_sessionId_openaiFileId_idx" ON "ChatFile"("sessionId", "openaiFileId");

-- CreateIndex
CREATE INDEX "GeneratedImage_userId_sessionId_idx" ON "GeneratedImage"("userId", "sessionId");

-- CreateIndex
CREATE INDEX "EspelhoBiblioteca_criadoPorId_isAtivo_idx" ON "EspelhoBiblioteca"("criadoPorId", "isAtivo");

-- CreateIndex
CREATE UNIQUE INDEX "EspelhoPadrao_especialidade_key" ON "EspelhoPadrao"("especialidade");

-- CreateIndex
CREATE INDEX "EspelhoPadrao_isAtivo_idx" ON "EspelhoPadrao"("isAtivo");

-- CreateIndex
CREATE INDEX "ModeloRecurso_isGlobal_idx" ON "ModeloRecurso"("isGlobal");

-- CreateIndex
CREATE INDEX "WebhookMessage_whatsappMessageId_conversationId_contactPhon_idx" ON "WebhookMessage"("whatsappMessageId", "conversationId", "contactPhone", "processed");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationThread_whatsappConversationId_key" ON "ConversationThread"("whatsappConversationId");

-- CreateIndex
CREATE INDEX "ConversationThread_contactPhone_lastMessageAt_idx" ON "ConversationThread"("contactPhone", "lastMessageAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadInstagramProfile" ADD CONSTRAINT "LeadInstagramProfile_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOabData" ADD CONSTRAINT "LeadOabData_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOabData" ADD CONSTRAINT "LeadOabData_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOabData" ADD CONSTRAINT "LeadOabData_espelhoBibliotecaId_fkey" FOREIGN KEY ("espelhoBibliotecaId") REFERENCES "EspelhoBiblioteca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArquivoLeadOab" ADD CONSTRAINT "ArquivoLeadOab_leadOabDataId_fkey" FOREIGN KEY ("leadOabDataId") REFERENCES "LeadOabData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioChatwit" ADD CONSTRAINT "UsuarioChatwit_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppGlobalConfig" ADD CONSTRAINT "WhatsAppGlobalConfig_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatwitInbox" ADD CONSTRAINT "ChatwitInbox_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatwitInbox" ADD CONSTRAINT "ChatwitInbox_fallbackParaInboxId_fkey" FOREIGN KEY ("fallbackParaInboxId") REFERENCES "ChatwitInbox"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "ChatwitInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateApprovalRequest" ADD CONSTRAINT "TemplateApprovalRequest_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateApprovalRequest" ADD CONSTRAINT "TemplateApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateApprovalRequest" ADD CONSTRAINT "TemplateApprovalRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoBotao" ADD CONSTRAINT "MapeamentoBotao_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "ChatwitInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractiveContent" ADD CONSTRAINT "InteractiveContent_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractiveContent" ADD CONSTRAINT "InteractiveContent_bodyId_fkey" FOREIGN KEY ("bodyId") REFERENCES "Body"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppOfficialInfo" ADD CONSTRAINT "WhatsAppOfficialInfo_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "AgenteDialogflow" ADD CONSTRAINT "AgenteDialogflow_usuarioChatwitId_fkey" FOREIGN KEY ("usuarioChatwitId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgenteDialogflow" ADD CONSTRAINT "AgenteDialogflow_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "ChatwitInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "ChatwitInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoIntencao" ADD CONSTRAINT "MapeamentoIntencao_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automacao" ADD CONSTRAINT "Automacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automacao" ADD CONSTRAINT "Automacao_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Pasta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automacao" ADD CONSTRAINT "Automacao_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAutomacao" ADD CONSTRAINT "LeadAutomacao_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAutomacao" ADD CONSTRAINT "LeadAutomacao_automacaoId_fkey" FOREIGN KEY ("automacaoId") REFERENCES "Automacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MtfDiamanteConfig" ADD CONSTRAINT "MtfDiamanteConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MtfDiamanteVariavel" ADD CONSTRAINT "MtfDiamanteVariavel_configId_fkey" FOREIGN KEY ("configId") REFERENCES "MtfDiamanteConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisparoMtfDiamante" ADD CONSTRAINT "DisparoMtfDiamante_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisparoMtfDiamante" ADD CONSTRAINT "DisparoMtfDiamante_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pasta" ADD CONSTRAINT "Pasta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Midia" ADD CONSTRAINT "Midia_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "EspelhoBiblioteca" ADD CONSTRAINT "EspelhoBiblioteca_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspelhoPadrao" ADD CONSTRAINT "EspelhoPadrao_atualizadoPorId_fkey" FOREIGN KEY ("atualizadoPorId") REFERENCES "UsuarioChatwit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Garante que apenas um agente ativo possa existir por inbox.
CREATE UNIQUE INDEX "unique_active_agent_per_inbox" ON "AgenteDialogflow" ("inboxId") WHERE ativo = true;