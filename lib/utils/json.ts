import { Prisma } from '@prisma/client'

export function toJson(value: unknown): Prisma.JsonValue {
  if (value === undefined || value === null) {
    return null
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (Array.isArray(value)) {
    return value.map((v) => toJson(v)) as Prisma.JsonValue
  }
  if (typeof value === 'object') {
    const obj: Record<string, Prisma.JsonValue> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      obj[k] = toJson(v)
    }
    return obj
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value as Prisma.JsonValue
  }
  return null
}
