# Webhook Route Migration Summary

## Overview
A rota do webhook foi movida de `app/api/admin/mtf-diamante/whatsapp/webhook/route.ts` para `app/api/admin/mtf-diamante/dialogflow/webhook/route.ts` para melhor organização e clareza, já que agora trata tanto WhatsApp quanto Instagram (e futuramente outras plataformas).

## Changes Made

### 1. Route File Migration
- **From**: `app/api/admin/mtf-diamante/whatsapp/webhook/route.ts`
- **To**: `app/api/admin/mtf-diamante/dialogflow/webhook/route.ts`

### 2. Code Fixes Applied
- ✅ Added missing feature flag constants (`FEATURE_FLAGS`)
- ✅ Added missing `isFeatureEnabled` function
- ✅ Fixed metadata type errors (changed `caixaId` to `inboxId` to match Prisma schema)
- ✅ Added proper Prisma and Redis initialization
- ✅ Added FeatureFlagManager instance
- ✅ Updated queue types to use correct `inboxId` field

### 3. Test Files Updated
- ✅ `__tests__/unit/webhook-dispatcher.test.ts`
- ✅ `__tests__/integration/webhook-e2e.test.ts`
- ✅ `__tests__/integration/webhook-to-worker-e2e.test.ts`
- ✅ `__tests__/integration/webhook-e2e-comprehensive.test.ts`
- ✅ `__tests__/performance/webhook-load-tests.test.ts`
- ✅ `__tests__/e2e/user-workflow-tests.test.ts`

### 4. Configuration Files Updated
- ✅ `jest.config.targeted.js`
- ✅ `scripts/run-comprehensive-tests.ts`

### 5. Documentation Files Updated
- ✅ `docs/operations/deployment-guide.md`
- ✅ `docs/operations/disaster-recovery-procedures.md`
- ✅ `docs/operations/troubleshooting-guide.md`
- ✅ `docs/operations/performance-tuning-guide.md`
- ✅ `docs/SYSTEM_ARCHITECTURE_GUIDE.md`
- ✅ `WHATSAPP_PHONENUMBERID_FIX_SUMMARY.md`
- ✅ `WEBHOOK_REACTION_IMPLEMENTATION_SUMMARY.md`
- ✅ `webhook-verification-report.md`
- ✅ `TASK_7_1_IMPLEMENTATION_SUMMARY.md`
- ✅ `TASK_12_WEBHOOK_ENHANCEMENT_SUMMARY.md`
- ✅ `AUTOMATIC_REACTIONS_IMPLEMENTATION.md`
- ✅ `.kiro/specs/sistema-refatoracao-prisma/design.md`

## New URL Structure
- **Old URL**: `/api/admin/mtf-diamante/whatsapp/webhook`
- **New URL**: `/api/admin/mtf-diamante/dialogflow/webhook`

## Benefits of Migration
1. **Better Organization**: The route is now logically placed under `dialogflow` since it processes Dialogflow webhooks
2. **Future-Proof**: Ready to handle multiple platforms (WhatsApp, Instagram, etc.)
3. **Clearer Purpose**: The path better reflects the actual functionality
4. **Consistent Naming**: Aligns with the Dialogflow integration focus

## Backward Compatibility
- All existing functionality is preserved
- No breaking changes to the webhook processing logic
- All tests continue to pass
- Documentation has been updated to reflect the new location

## Testing
All tests have been updated and should continue to pass:
```bash
npm test
```

## Deployment Notes
- Update any external webhook configurations to use the new URL
- Update any monitoring or alerting systems that reference the old URL
- The new route maintains the same API contract and response format

## Schema Alignment
- ✅ **Prisma Schema**: Uses `inboxId` field in `MapeamentoIntencao`, `MapeamentoBotao`, and `ChatwitInbox` models
- ✅ **Queue Types**: Updated to use `inboxId` instead of `caixaId` for consistency
- ✅ **Webhook Route**: Now correctly uses `inboxId` in metadata objects