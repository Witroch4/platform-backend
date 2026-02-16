import { Prisma } from "@prisma/client";

export function toJson(value: unknown): Prisma.JsonValue {
	if (value === undefined || value === null) {
		return null;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (Array.isArray(value)) {
		return value.map((v) => toJson(v)) as Prisma.JsonValue;
	}
	if (typeof value === "object") {
		const obj: Record<string, Prisma.JsonValue> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			obj[k] = toJson(v);
		}
		return obj;
	}
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value as Prisma.JsonValue;
	}
	return null;
}

export function toInputJson(value: unknown): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (value === null) {
		return Prisma.DbNull;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (Array.isArray(value)) {
		return value.map((v) => toInputJson(v)) as Prisma.InputJsonValue;
	}
	if (typeof value === "object") {
		const obj: Record<string, Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			const converted = toInputJson(v);
			if (converted !== undefined) {
				obj[k] = converted;
			}
		}
		return obj as any;
	}
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value as Prisma.InputJsonValue;
	}
	return Prisma.DbNull;
}
