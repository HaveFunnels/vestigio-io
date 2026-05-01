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

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT DEFAULT 'USER',
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetTokenExp" TIMESTAMP(3),
    "role" TEXT DEFAULT 'USER',
    "adminRole" TEXT,
    "customer_id" TEXT,
    "subscription_id" TEXT,
    "price_id" TEXT,
    "current_period_end" TIMESTAMP(3),
    "locale" TEXT DEFAULT 'en',
    "phone" TEXT,
    "phoneVerified" TIMESTAMP(3),
    "billingEmail" TEXT,
    "activationToken" TEXT,
    "activationTokenExpiresAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "firstChatAt" TIMESTAMP(3),
    "firstActionAt" TIMESTAMP(3),
    "firstVerifyAt" TIMESTAMP(3),
    "firstWorkspaceDrillAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "alertOnPageDown" BOOLEAN NOT NULL DEFAULT true,
    "alertOnIncident" BOOLEAN NOT NULL DEFAULT true,
    "alertOnRegression" BOOLEAN NOT NULL DEFAULT true,
    "alertOnImprovement" BOOLEAN NOT NULL DEFAULT false,
    "newsletterSubscribed" BOOLEAN NOT NULL DEFAULT true,
    "productUpdates" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "channel" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'brevo',
    "providerId" TEXT,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMsgId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "userId" TEXT,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaMimeType" TEXT,
    "repliedToTag" TEXT,
    "ticketId" TEXT,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'vestigio',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "orgType" TEXT NOT NULL DEFAULT 'customer',
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "landingUrl" TEXT NOT NULL,
    "isProduction" BOOLEAN NOT NULL DEFAULT true,
    "activated" BOOLEAN NOT NULL DEFAULT false,
    "lastAccessedAt" TIMESTAMP(3),
    "continuousPaused" BOOLEAN NOT NULL DEFAULT false,
    "engagementScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessModel" TEXT NOT NULL DEFAULT 'ecommerce',
    "monthlyRevenue" DOUBLE PRECISION,
    "averageOrderValue" DOUBLE PRECISION,
    "monthlyTransactions" INTEGER,
    "conversionRate" DOUBLE PRECISION,
    "chargebackRate" DOUBLE PRECISION,
    "churnRate" DOUBLE PRECISION,
    "conversionModel" TEXT NOT NULL DEFAULT 'checkout',
    "icpDescription" TEXT,
    "targetIndustry" TEXT,
    "buyerSophistication" TEXT,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditCycle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "cycleType" TEXT NOT NULL DEFAULT 'full',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AuditCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleSnapshot" (
    "id" TEXT NOT NULL,
    "cycleRef" TEXT NOT NULL,
    "cycleId" TEXT,
    "workspaceRef" TEXT NOT NULL,
    "environmentRef" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "snapshot" TEXT NOT NULL,
    "decisionCount" INTEGER NOT NULL,
    "signalCount" INTEGER NOT NULL,
    "auditMode" TEXT NOT NULL DEFAULT 'full',
    "recomputeMs" INTEGER,
    "contentHash" TEXT,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "cycleRef" TEXT NOT NULL,
    "inferenceKey" TEXT NOT NULL,
    "pack" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "polarity" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "impactMin" DOUBLE PRECISION NOT NULL,
    "impactMax" DOUBLE PRECISION NOT NULL,
    "impactMidpoint" DOUBLE PRECISION NOT NULL,
    "surface" TEXT NOT NULL,
    "rootCause" TEXT,
    "changeClass" TEXT,
    "verificationMaturity" TEXT,
    "projection" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawBehavioralEvent" (
    "id" TEXT NOT NULL,
    "envId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" TEXT NOT NULL,
    "attribution" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "RawBehavioralEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomMap" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "creatorUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mapDefinition" TEXT NOT NULL,
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "edgeCount" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "usageType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "period" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaasAccessConfig" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "loginUrl" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "passwordEncrypted" TEXT,
    "authMethod" TEXT NOT NULL DEFAULT 'unknown',
    "mfaMode" TEXT NOT NULL DEFAULT 'unknown',
    "hasTrial" BOOLEAN,
    "requiresSeedData" BOOLEAN,
    "testAccountAvailable" BOOLEAN,
    "activationGoal" TEXT,
    "primaryUpgradePath" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastFailureReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unconfigured',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaasAccessConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "syncError" TEXT,
    "syncMetadata" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL,
    "configKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgCredits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchasedBalance" INTEGER NOT NULL DEFAULT 0,
    "planConsumedThisCycle" INTEGER NOT NULL DEFAULT 0,
    "cycleStartAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgCredits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "orgCreditsId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "packKey" TEXT,
    "paddleTransactionId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformError" (
    "id" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stackTrace" TEXT,
    "endpoint" TEXT,
    "method" TEXT,
    "statusCode" INTEGER,
    "userId" TEXT,
    "userEmail" TEXT,
    "organizationId" TEXT,
    "requestBody" TEXT,
    "correlationId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'error',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthEvent" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "correlationId" TEXT,
    "eventType" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "outcome" TEXT,
    "durationMs" INTEGER,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpPromptEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "rewriteOffered" BOOLEAN NOT NULL DEFAULT false,
    "rewriteAccepted" BOOLEAN,
    "inputLength" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpPromptEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpSession" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "queriesUsed" INTEGER NOT NULL DEFAULT 0,
    "playbookId" TEXT,
    "promptRewrites" INTEGER NOT NULL DEFAULT 0,
    "chainDepth" INTEGER NOT NULL DEFAULT 0,
    "plan" TEXT NOT NULL DEFAULT 'vestigio',

    CONSTRAINT "McpSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpSuggestionClick" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "suggestionType" TEXT NOT NULL,
    "suggestionText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpSuggestionClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "stepsCompleted" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',

    CONSTRAINT "PlaybookRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stagesCompleted" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionedSnapshot" (
    "id" TEXT NOT NULL,
    "cycleRef" TEXT NOT NULL,
    "workspaceRef" TEXT NOT NULL,
    "environmentRef" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "snapshot" TEXT NOT NULL,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "decisionCount" INTEGER NOT NULL DEFAULT 0,
    "signalCount" INTEGER NOT NULL DEFAULT 0,
    "auditMode" TEXT NOT NULL DEFAULT 'full',
    "recomputeMs" INTEGER,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersionedSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionRule" (
    "id" TEXT NOT NULL,
    "scopeRef" TEXT NOT NULL,
    "matchKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "reviewPolicy" TEXT NOT NULL DEFAULT 'manual',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuppressionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Website" (
    "id" TEXT NOT NULL,
    "environmentRef" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "rootUrl" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Website_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageInventoryItem" (
    "id" TEXT NOT NULL,
    "websiteRef" TEXT NOT NULL,
    "environmentRef" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "pathScope" TEXT,
    "pageType" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'secondary',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "criticality" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "statusCode" INTEGER,
    "freshnessState" TEXT NOT NULL DEFAULT 'unknown',
    "freshnessAge" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageInventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurfaceRelation" (
    "id" TEXT NOT NULL,
    "websiteRef" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "sourceHost" TEXT NOT NULL,
    "targetHost" TEXT NOT NULL,
    "isSameDomain" BOOLEAN NOT NULL DEFAULT true,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "cycleRef" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurfaceRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProfileVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "profile" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "changeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessProfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "environmentId" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "totalCostCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costCents" DOUBLE PRECISION,
    "toolCalls" TEXT,
    "purpose" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenCostLedger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationInputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadInputTokens" INTEGER NOT NULL DEFAULT 0,
    "costCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "isToolUse" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenCostLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatFeedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "rating" TEXT NOT NULL,
    "comment" TEXT,
    "messagePreview" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "evidenceKey" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "workspaceRef" TEXT NOT NULL,
    "environmentRef" TEXT NOT NULL,
    "pathScope" TEXT,
    "cycleRef" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "freshUntil" TIMESTAMP(3),
    "freshnessState" TEXT NOT NULL DEFAULT 'unknown',
    "stalenessReason" TEXT,
    "sourceKind" TEXT NOT NULL,
    "collectionMethod" TEXT NOT NULL,
    "qualityScore" INTEGER NOT NULL DEFAULT 50,
    "payload" TEXT NOT NULL,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "auditCycleId" TEXT,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Newsletter" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'all',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "recipientCount" INTEGER,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Newsletter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "ip" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "duration" INTEGER,
    "scrollDepth" DOUBLE PRECISION,
    "abVariant" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "target" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ABTest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "variants" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ABTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomepageVariant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "heroTitle" TEXT,
    "heroSubtitle" TEXT,
    "ctaText" TEXT,
    "ctaUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomepageVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingPixel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pixelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingPixel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetName" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metric" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "window" INTEGER NOT NULL DEFAULT 10,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggered" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "message" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UptimeCheck" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UptimeCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "category" TEXT NOT NULL DEFAULT 'general',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketReply" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "userName" TEXT,
    "type" TEXT NOT NULL DEFAULT 'general',
    "category" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "rating" INTEGER,
    "page" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonymousLead" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "domain" TEXT,
    "organizationName" TEXT,
    "businessModel" TEXT,
    "monthlyRevenue" DOUBLE PRECISION,
    "averageTicket" DOUBLE PRECISION,
    "conversionModel" TEXT,
    "phone" TEXT,
    "formData" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "miniAuditId" TEXT,
    "stripeSessionId" TEXT,
    "stripeCustomerId" TEXT,
    "promotedToUserId" TEXT,
    "promotedToOrgId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "formStartedAt" TIMESTAMP(3),
    "behavioralScore" INTEGER,
    "honeypotTripped" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnonymousLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectScan" (
    "id" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdByUserId" TEXT,
    "preview" TEXT,
    "visibleFindings" TEXT,
    "blurredFindings" TEXT,
    "pagesScanned" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProspectScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiniAuditResult" (
    "id" TEXT NOT NULL,
    "domainHash" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "visibleFindings" TEXT NOT NULL,
    "blurredFindings" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiniAuditResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "layout" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "remediationSteps" TEXT,
    "estimatedEffortHours" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedViaConversationId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "notes" TEXT,
    "baselineImpactMidpoint" DOUBLE PRECISION,
    "baselineImpactMin" DOUBLE PRECISION,
    "baselineImpactMax" DOUBLE PRECISION,
    "baselineCycleRef" TEXT,
    "verifiedResolvedAt" TIMESTAMP(3),
    "verificationCycleRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "environmentId" TEXT,
    "event" TEXT NOT NULL,
    "properties" JSONB,
    "pathname" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityTracking" (
    "id" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "OpportunityTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancelSurvey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "freeText" TEXT,
    "offeredSave" TEXT,
    "acceptedSave" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancelSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_name_key" ON "ApiKey"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_email_key" ON "Invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_customer_id_key" ON "User"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_subscription_id_key" ON "User"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_activationToken_key" ON "User"("activationToken");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_createdAt_idx" ON "NotificationLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_event_createdAt_idx" ON "NotificationLog"("event", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_providerId_idx" ON "NotificationLog"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_providerMsgId_key" ON "InboundMessage"("providerMsgId");

-- CreateIndex
CREATE INDEX "InboundMessage_fromAddress_createdAt_idx" ON "InboundMessage"("fromAddress", "createdAt");

-- CreateIndex
CREATE INDEX "InboundMessage_userId_createdAt_idx" ON "InboundMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InboundMessage_handled_createdAt_idx" ON "InboundMessage"("handled", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Organization_orgType_status_idx" ON "Organization"("orgType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvite_token_key" ON "OrgInvite"("token");

-- CreateIndex
CREATE INDEX "OrgInvite_token_idx" ON "OrgInvite"("token");

-- CreateIndex
CREATE INDEX "OrgInvite_organizationId_status_idx" ON "OrgInvite"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvite_organizationId_email_key" ON "OrgInvite"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Environment_activated_continuousPaused_idx" ON "Environment"("activated", "continuousPaused");

-- CreateIndex
CREATE INDEX "Environment_lastAccessedAt_idx" ON "Environment"("lastAccessedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_organizationId_key" ON "BusinessProfile"("organizationId");

-- CreateIndex
CREATE INDEX "CycleSnapshot_workspaceRef_environmentRef_createdAt_idx" ON "CycleSnapshot"("workspaceRef", "environmentRef", "createdAt");

-- CreateIndex
CREATE INDEX "CycleSnapshot_cycleId_idx" ON "CycleSnapshot"("cycleId");

-- CreateIndex
CREATE INDEX "CycleSnapshot_isBaseline_idx" ON "CycleSnapshot"("isBaseline");

-- CreateIndex
CREATE INDEX "Finding_environmentId_cycleId_idx" ON "Finding"("environmentId", "cycleId");

-- CreateIndex
CREATE INDEX "Finding_environmentId_surface_idx" ON "Finding"("environmentId", "surface");

-- CreateIndex
CREATE INDEX "Finding_environmentId_severity_idx" ON "Finding"("environmentId", "severity");

-- CreateIndex
CREATE INDEX "Finding_cycleRef_inferenceKey_idx" ON "Finding"("cycleRef", "inferenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_cycleId_inferenceKey_key" ON "Finding"("cycleId", "inferenceKey");

-- CreateIndex
CREATE INDEX "RawBehavioralEvent_envId_sessionId_processedAt_idx" ON "RawBehavioralEvent"("envId", "sessionId", "processedAt");

-- CreateIndex
CREATE INDEX "RawBehavioralEvent_envId_sessionId_occurredAt_idx" ON "RawBehavioralEvent"("envId", "sessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "RawBehavioralEvent_receivedAt_idx" ON "RawBehavioralEvent"("receivedAt");

-- CreateIndex
CREATE INDEX "RawBehavioralEvent_envId_receivedAt_idx" ON "RawBehavioralEvent"("envId", "receivedAt");

-- CreateIndex
CREATE INDEX "RawBehavioralEvent_envId_occurredAt_eventType_idx" ON "RawBehavioralEvent"("envId", "occurredAt", "eventType");

-- CreateIndex
CREATE INDEX "CustomMap_organizationId_createdAt_idx" ON "CustomMap"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomMap_creatorUserId_idx" ON "CustomMap"("creatorUserId");

-- CreateIndex
CREATE INDEX "Usage_organizationId_usageType_period_idx" ON "Usage"("organizationId", "usageType", "period");

-- CreateIndex
CREATE UNIQUE INDEX "SaasAccessConfig_environmentId_key" ON "SaasAccessConfig"("environmentId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_environmentId_idx" ON "IntegrationConnection"("environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_environmentId_provider_key" ON "IntegrationConnection"("environmentId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConfig_configKey_key" ON "PlatformConfig"("configKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrgCredits_organizationId_key" ON "OrgCredits"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_paddleTransactionId_key" ON "CreditTransaction"("paddleTransactionId");

-- CreateIndex
CREATE INDEX "CreditTransaction_orgCreditsId_createdAt_idx" ON "CreditTransaction"("orgCreditsId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformError_errorType_createdAt_idx" ON "PlatformError"("errorType", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformError_endpoint_createdAt_idx" ON "PlatformError"("endpoint", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformError_severity_resolved_createdAt_idx" ON "PlatformError"("severity", "resolved", "createdAt");

-- CreateIndex
CREATE INDEX "AuthEvent_environmentId_createdAt_idx" ON "AuthEvent"("environmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthEvent_correlationId_idx" ON "AuthEvent"("correlationId");

-- CreateIndex
CREATE INDEX "AuthEvent_eventType_createdAt_idx" ON "AuthEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "McpPromptEvent_orgId_createdAt_idx" ON "McpPromptEvent"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "McpPromptEvent_quality_createdAt_idx" ON "McpPromptEvent"("quality", "createdAt");

-- CreateIndex
CREATE INDEX "McpSession_orgId_startedAt_idx" ON "McpSession"("orgId", "startedAt");

-- CreateIndex
CREATE INDEX "McpSuggestionClick_orgId_createdAt_idx" ON "McpSuggestionClick"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "McpSuggestionClick_suggestionType_createdAt_idx" ON "McpSuggestionClick"("suggestionType", "createdAt");

-- CreateIndex
CREATE INDEX "PlaybookRun_orgId_startedAt_idx" ON "PlaybookRun"("orgId", "startedAt");

-- CreateIndex
CREATE INDEX "PlaybookRun_playbookId_status_idx" ON "PlaybookRun"("playbookId", "status");

-- CreateIndex
CREATE INDEX "AnalysisJob_environmentId_status_idx" ON "AnalysisJob"("environmentId", "status");

-- CreateIndex
CREATE INDEX "AnalysisJob_organizationId_createdAt_idx" ON "AnalysisJob"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "VersionedSnapshot_workspaceRef_environmentRef_createdAt_idx" ON "VersionedSnapshot"("workspaceRef", "environmentRef", "createdAt");

-- CreateIndex
CREATE INDEX "VersionedSnapshot_workspaceRef_environmentRef_isBaseline_idx" ON "VersionedSnapshot"("workspaceRef", "environmentRef", "isBaseline");

-- CreateIndex
CREATE INDEX "VersionedSnapshot_cycleRef_idx" ON "VersionedSnapshot"("cycleRef");

-- CreateIndex
CREATE INDEX "SuppressionRule_scopeRef_isActive_idx" ON "SuppressionRule"("scopeRef", "isActive");

-- CreateIndex
CREATE INDEX "SuppressionRule_matchKey_isActive_idx" ON "SuppressionRule"("matchKey", "isActive");

-- CreateIndex
CREATE INDEX "SuppressionRule_expiresAt_idx" ON "SuppressionRule"("expiresAt");

-- CreateIndex
CREATE INDEX "Website_environmentRef_idx" ON "Website"("environmentRef");

-- CreateIndex
CREATE UNIQUE INDEX "Website_environmentRef_domain_key" ON "Website"("environmentRef", "domain");

-- CreateIndex
CREATE INDEX "PageInventoryItem_websiteRef_idx" ON "PageInventoryItem"("websiteRef");

-- CreateIndex
CREATE INDEX "PageInventoryItem_environmentRef_pageType_idx" ON "PageInventoryItem"("environmentRef", "pageType");

-- CreateIndex
CREATE INDEX "PageInventoryItem_environmentRef_tier_idx" ON "PageInventoryItem"("environmentRef", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "PageInventoryItem_environmentRef_normalizedUrl_key" ON "PageInventoryItem"("environmentRef", "normalizedUrl");

-- CreateIndex
CREATE INDEX "SurfaceRelation_websiteRef_idx" ON "SurfaceRelation"("websiteRef");

-- CreateIndex
CREATE INDEX "SurfaceRelation_sourceUrl_idx" ON "SurfaceRelation"("sourceUrl");

-- CreateIndex
CREATE INDEX "SurfaceRelation_targetUrl_idx" ON "SurfaceRelation"("targetUrl");

-- CreateIndex
CREATE INDEX "SurfaceRelation_cycleRef_idx" ON "SurfaceRelation"("cycleRef");

-- CreateIndex
CREATE INDEX "BusinessProfileVersion_organizationId_createdAt_idx" ON "BusinessProfileVersion"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfileVersion_organizationId_version_key" ON "BusinessProfileVersion"("organizationId", "version");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_status_updatedAt_idx" ON "Conversation"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_userId_status_updatedAt_idx" ON "Conversation"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_createdAt_idx" ON "ConversationMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenCostLedger_organizationId_createdAt_idx" ON "TokenCostLedger"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenCostLedger_organizationId_model_createdAt_idx" ON "TokenCostLedger"("organizationId", "model", "createdAt");

-- CreateIndex
CREATE INDEX "TokenCostLedger_organizationId_purpose_createdAt_idx" ON "TokenCostLedger"("organizationId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "TokenCostLedger_conversationId_idx" ON "TokenCostLedger"("conversationId");

-- CreateIndex
CREATE INDEX "ChatFeedback_organizationId_createdAt_idx" ON "ChatFeedback"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatFeedback_rating_createdAt_idx" ON "ChatFeedback"("rating", "createdAt");

-- CreateIndex
CREATE INDEX "Evidence_workspaceRef_environmentRef_createdAt_idx" ON "Evidence"("workspaceRef", "environmentRef", "createdAt");

-- CreateIndex
CREATE INDEX "Evidence_evidenceType_createdAt_idx" ON "Evidence"("evidenceType", "createdAt");

-- CreateIndex
CREATE INDEX "Evidence_cycleRef_idx" ON "Evidence"("cycleRef");

-- CreateIndex
CREATE INDEX "Evidence_subjectRef_idx" ON "Evidence"("subjectRef");

-- CreateIndex
CREATE INDEX "Evidence_environmentRef_subjectRef_evidenceType_idx" ON "Evidence"("environmentRef", "subjectRef", "evidenceType");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_cycleRef_evidenceKey_key" ON "Evidence"("cycleRef", "evidenceKey");

-- CreateIndex
CREATE INDEX "PageView_path_createdAt_idx" ON "PageView"("path", "createdAt");

-- CreateIndex
CREATE INDEX "PageView_sessionId_idx" ON "PageView"("sessionId");

-- CreateIndex
CREATE INDEX "PageView_utmSource_createdAt_idx" ON "PageView"("utmSource", "createdAt");

-- CreateIndex
CREATE INDEX "PageView_abVariant_createdAt_idx" ON "PageView"("abVariant", "createdAt");

-- CreateIndex
CREATE INDEX "PageView_country_createdAt_idx" ON "PageView"("country", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingEvent_eventType_createdAt_idx" ON "MarketingEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingEvent_sessionId_idx" ON "MarketingEvent"("sessionId");

-- CreateIndex
CREATE INDEX "MarketingEvent_path_eventType_idx" ON "MarketingEvent"("path", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "HomepageVariant_slug_key" ON "HomepageVariant"("slug");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AlertEvent_ruleId_createdAt_idx" ON "AlertEvent"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "AlertEvent_acknowledged_createdAt_idx" ON "AlertEvent"("acknowledged", "createdAt");

-- CreateIndex
CREATE INDEX "UptimeCheck_service_createdAt_idx" ON "UptimeCheck"("service", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_createdAt_idx" ON "SupportTicket"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_email_idx" ON "SupportTicket"("email");

-- CreateIndex
CREATE INDEX "TicketReply_ticketId_createdAt_idx" ON "TicketReply"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_type_status_createdAt_idx" ON "Feedback"("type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

-- CreateIndex
CREATE INDEX "AnonymousLead_email_idx" ON "AnonymousLead"("email");

-- CreateIndex
CREATE INDEX "AnonymousLead_domain_idx" ON "AnonymousLead"("domain");

-- CreateIndex
CREATE INDEX "AnonymousLead_status_createdAt_idx" ON "AnonymousLead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AnonymousLead_expiresAt_idx" ON "AnonymousLead"("expiresAt");

-- CreateIndex
CREATE INDEX "AnonymousLead_ipAddress_createdAt_idx" ON "AnonymousLead"("ipAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectScan_shareToken_key" ON "ProspectScan"("shareToken");

-- CreateIndex
CREATE INDEX "ProspectScan_domain_idx" ON "ProspectScan"("domain");

-- CreateIndex
CREATE INDEX "ProspectScan_shareToken_idx" ON "ProspectScan"("shareToken");

-- CreateIndex
CREATE INDEX "ProspectScan_status_createdAt_idx" ON "ProspectScan"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProspectScan_createdByUserId_createdAt_idx" ON "ProspectScan"("createdByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MiniAuditResult_domainHash_key" ON "MiniAuditResult"("domainHash");

-- CreateIndex
CREATE INDEX "MiniAuditResult_domainHash_idx" ON "MiniAuditResult"("domainHash");

-- CreateIndex
CREATE INDEX "MiniAuditResult_expiresAt_idx" ON "MiniAuditResult"("expiresAt");

-- CreateIndex
CREATE INDEX "DashboardLayout_userId_idx" ON "DashboardLayout"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardLayout_userId_organizationId_key" ON "DashboardLayout"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "UserAction_organizationId_status_createdAt_idx" ON "UserAction"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "UserAction_environmentId_status_idx" ON "UserAction"("environmentId", "status");

-- CreateIndex
CREATE INDEX "UserAction_environmentId_status_verifiedResolvedAt_idx" ON "UserAction"("environmentId", "status", "verifiedResolvedAt");

-- CreateIndex
CREATE INDEX "UserAction_findingId_idx" ON "UserAction"("findingId");

-- CreateIndex
CREATE INDEX "UserAction_createdByUserId_idx" ON "UserAction"("createdByUserId");

-- CreateIndex
CREATE INDEX "ProductEvent_orgId_event_createdAt_idx" ON "ProductEvent"("orgId", "event", "createdAt");

-- CreateIndex
CREATE INDEX "ProductEvent_environmentId_createdAt_idx" ON "ProductEvent"("environmentId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductEvent_userId_event_idx" ON "ProductEvent"("userId", "event");

-- CreateIndex
CREATE INDEX "ProductEvent_createdAt_idx" ON "ProductEvent"("createdAt");

-- CreateIndex
CREATE INDEX "OpportunityTracking_environmentId_idx" ON "OpportunityTracking"("environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityTracking_actionKey_environmentId_key" ON "OpportunityTracking"("actionKey", "environmentId");

-- CreateIndex
CREATE INDEX "CancelSurvey_organizationId_idx" ON "CancelSurvey"("organizationId");

-- CreateIndex
CREATE INDEX "CancelSurvey_createdAt_idx" ON "CancelSurvey"("createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgInvite" ADD CONSTRAINT "OrgInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCycle" ADD CONSTRAINT "AuditCycle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCycle" ADD CONSTRAINT "AuditCycle_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleSnapshot" ADD CONSTRAINT "CycleSnapshot_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawBehavioralEvent" ADD CONSTRAINT "RawBehavioralEvent_envId_fkey" FOREIGN KEY ("envId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomMap" ADD CONSTRAINT "CustomMap_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomMap" ADD CONSTRAINT "CustomMap_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usage" ADD CONSTRAINT "Usage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaasAccessConfig" ADD CONSTRAINT "SaasAccessConfig_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgCredits" ADD CONSTRAINT "OrgCredits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_orgCreditsId_fkey" FOREIGN KEY ("orgCreditsId") REFERENCES "OrgCredits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageInventoryItem" ADD CONSTRAINT "PageInventoryItem_websiteRef_fkey" FOREIGN KEY ("websiteRef") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurfaceRelation" ADD CONSTRAINT "SurfaceRelation_websiteRef_fkey" FOREIGN KEY ("websiteRef") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProfileVersion" ADD CONSTRAINT "BusinessProfileVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenCostLedger" ADD CONSTRAINT "TokenCostLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenCostLedger" ADD CONSTRAINT "TokenCostLedger_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_auditCycleId_fkey" FOREIGN KEY ("auditCycleId") REFERENCES "AuditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReply" ADD CONSTRAINT "TicketReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReply" ADD CONSTRAINT "TicketReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnonymousLead" ADD CONSTRAINT "AnonymousLead_miniAuditId_fkey" FOREIGN KEY ("miniAuditId") REFERENCES "MiniAuditResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectScan" ADD CONSTRAINT "ProspectScan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAction" ADD CONSTRAINT "UserAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAction" ADD CONSTRAINT "UserAction_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAction" ADD CONSTRAINT "UserAction_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAction" ADD CONSTRAINT "UserAction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAction" ADD CONSTRAINT "UserAction_verifiedViaConversationId_fkey" FOREIGN KEY ("verifiedViaConversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityTracking" ADD CONSTRAINT "OpportunityTracking_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelSurvey" ADD CONSTRAINT "CancelSurvey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

