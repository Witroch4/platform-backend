import { Prisma } from '@prisma/client'

export interface FeatureFlagState {
  enabled: boolean
  conditions: Prisma.JsonObject | null
}

export type ConditionContext = Record<string, any>

export function evaluateConditions(
  conditions: Prisma.JsonObject | undefined,
  context: ConditionContext
): boolean {
  if (!conditions || typeof conditions !== 'object') return true

  for (const [key, value] of Object.entries(conditions)) {
    const ctxValue = context[key]
    if (value && typeof value === 'object') {
      if ('equals' in (value as any) && ctxValue !== (value as any).equals) {
        return false
      }
      if ('not' in (value as any) && ctxValue === (value as any).not) {
        return false
      }
    } else if (ctxValue !== value) {
      return false
    }
  }

  return true
}
