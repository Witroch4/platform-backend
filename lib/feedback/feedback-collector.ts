import { Prisma } from '@prisma/client'

export interface UserFeedback {
  id: string
  message: string
  userEmail: string | null
  metadata: Prisma.JsonValue | null
  featureFlagContext: Prisma.JsonValue | null
  createdAt: Date
}

export interface SaveFeedbackParams {
  message: string
  userEmail?: string | null
  metadata?: unknown
  featureFlagContext?: unknown
}

export class FeedbackCollector {
  private feedbacks: UserFeedback[] = []

  async saveFeedback(params: SaveFeedbackParams): Promise<UserFeedback> {
    const {
      message,
      userEmail = null,
      metadata,
      featureFlagContext,
    } = params

    const safeMeta =
      typeof metadata === 'undefined'
        ? null
        : (JSON.parse(JSON.stringify(metadata)) as Prisma.JsonValue)

    const safeFeature =
      typeof featureFlagContext === 'undefined'
        ? null
        : (JSON.parse(JSON.stringify(featureFlagContext)) as Prisma.JsonValue)

    const feedback: UserFeedback = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      message,
      userEmail,
      metadata: safeMeta,
      featureFlagContext: safeFeature,
      createdAt: new Date(),
    }

    this.feedbacks.push(feedback)
    return feedback
  }

  getAllFeedback(): UserFeedback[] {
    return [...this.feedbacks]
  }

  getFeatureFlagName(feedback: UserFeedback): string | undefined {
    const ctx = feedback.featureFlagContext
    if (ctx && typeof ctx === 'object' && 'flagName' in ctx) {
      const value = (ctx as any).flagName
      return typeof value === 'string' ? value : undefined
    }
    return undefined
  }
}
