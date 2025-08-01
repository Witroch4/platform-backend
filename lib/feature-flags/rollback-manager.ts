import type { Prisma } from '@prisma/client'

export interface RollbackFlagState {
  id: number
  previousState: {
    enabled: boolean
    conditions: Record<string, any> | undefined
  }
}

export interface RollbackPlan {
  flags: RollbackFlagState[]
}

export function createRollbackPlan(flags: { id: number; state: { enabled: boolean; conditions: Prisma.JsonObject | null } }[]): RollbackPlan {
  return {
    flags: flags.map((f) => ({
      id: f.id,
      previousState: {
        enabled: f.state.enabled,
        conditions: f.state.conditions ?? undefined
      }
    }))
  }
}
