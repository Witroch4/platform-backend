import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { AiAgentType, LinkedColumn, AiProvider } from "@prisma/client";
import {
	AgentBlueprintPayload,
	AgentToolConfig,
	OutputParserConfig,
	updateAgentBlueprint,
	deleteAgentBlueprint,
} from "@/lib/ai-agents/blueprints";

function unauthorized() {
	return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
}

function coerceAgentType(value: unknown): AiAgentType | undefined {
	if (typeof value !== "string") return undefined;
	const upper = value.toUpperCase() as keyof typeof AiAgentType;
	if (upper in AiAgentType) {
		return AiAgentType[upper];
	}
	return undefined;
}

function coerceLinkedColumn(value: unknown): LinkedColumn | null {
	if (value === null || value === undefined || value === "_none") return null;
	if (typeof value !== "string") return null;
	const upper = value.toUpperCase() as keyof typeof LinkedColumn;
	if (upper in LinkedColumn) {
		return LinkedColumn[upper];
	}
	return null;
}

function coerceAiProvider(value: unknown): AiProvider | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== "string") return null;
	const upper = value.toUpperCase() as keyof typeof AiProvider;
	if (upper in AiProvider) {
		return AiProvider[upper];
	}
	return null;
}

function parseMaybeJson<T>(value: unknown): T | undefined {
	if (value === null || value === undefined) return undefined;
	if (typeof value === "string") {
		try {
			return JSON.parse(value) as T;
		} catch {
			return undefined;
		}
	}
	return value as T;
}

function parseUpdatePayload(body: any): Partial<AgentBlueprintPayload> | null {
	if (!body || typeof body !== "object") return null;

	const payload: Partial<AgentBlueprintPayload> = {};

	if ("name" in body) {
		if (typeof body.name !== "string" || !body.name.trim()) return null;
		payload.name = body.name.trim();
	}

	if ("description" in body) {
		payload.description = typeof body.description === "string" ? body.description.trim() : undefined;
	}

	if ("agentType" in body) {
		const agentType = coerceAgentType(body.agentType);
		if (!agentType) return null;
		payload.agentType = agentType;
	}

	if ("icon" in body) {
		payload.icon = typeof body.icon === "string" ? body.icon : undefined;
	}

	if ("model" in body) {
		if (typeof body.model !== "string" || !body.model.trim()) return null;
		payload.model = body.model.trim();
	}

	if ("temperature" in body) {
		payload.temperature = typeof body.temperature === "number" ? body.temperature : null;
	}

	if ("topP" in body) {
		payload.topP = typeof body.topP === "number" ? body.topP : null;
	}

	if ("maxOutputTokens" in body) {
		payload.maxOutputTokens = typeof body.maxOutputTokens === "number" ? body.maxOutputTokens : null;
	}

	if ("systemPrompt" in body) {
		payload.systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt : null;
	}

	if ("instructions" in body) {
		payload.instructions = typeof body.instructions === "string" ? body.instructions : null;
	}

	if ("toolset" in body) {
		if (body.toolset === null) {
			payload.toolset = null;
		} else {
			const parsed = parseMaybeJson<AgentToolConfig[]>(body.toolset);
			if (parsed === undefined) return null;
			payload.toolset = parsed;
		}
	}

	if ("outputParser" in body) {
		if (body.outputParser === null) {
			payload.outputParser = null;
		} else {
			const parsed = parseMaybeJson<OutputParserConfig>(body.outputParser);
			if (parsed === undefined) return null;
			payload.outputParser = parsed;
		}
	}

	if ("memory" in body) {
		if (body.memory === null) {
			payload.memory = null;
		} else {
			const parsed = parseMaybeJson<Record<string, unknown>>(body.memory);
			if (parsed === undefined) return null;
			payload.memory = parsed;
		}
	}

	if ("canvasState" in body) {
		if (body.canvasState === null) {
			payload.canvasState = null;
		} else {
			const parsed = parseMaybeJson<any>(body.canvasState);
			if (parsed === undefined) return null;
			payload.canvasState = parsed;
		}
	}

	if ("metadata" in body) {
		if (body.metadata === null) {
			payload.metadata = null;
		} else {
			const parsed = parseMaybeJson<Record<string, unknown>>(body.metadata);
			if (parsed === undefined) return null;
			payload.metadata = parsed;
		}
	}

	// Engine Híbrida: linkedColumn e defaultProvider
	if ("linkedColumn" in body) {
		payload.linkedColumn = coerceLinkedColumn(body.linkedColumn);
	}

	if ("defaultProvider" in body) {
		payload.defaultProvider = coerceAiProvider(body.defaultProvider);
	}

	return Object.keys(payload).length > 0 ? payload : null;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return unauthorized();
	}

	const { id } = await context.params;
	if (!id) {
		return NextResponse.json({ error: "ID do agente é obrigatório" }, { status: 400 });
	}

	const body = await request.json().catch(() => null);
	const payload = parseUpdatePayload(body);
	if (!payload) {
		return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
	}

	try {
		const updated = await updateAgentBlueprint(session.user.id, id, payload);
		if (!updated) {
			return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
		}
		return NextResponse.json({ blueprint: updated });
	} catch (error: any) {
		console.error("Erro ao atualizar blueprint de agente", error);
		return NextResponse.json({ error: "Não foi possível atualizar o agente" }, { status: 500 });
	}
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return unauthorized();
	}

	const { id } = await context.params;
	if (!id) {
		return NextResponse.json({ error: "ID do agente é obrigatório" }, { status: 400 });
	}

	try {
		const removed = await deleteAgentBlueprint(session.user.id, id);
		if (!removed) {
			return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
		}
		return NextResponse.json({ ok: true });
	} catch (error: any) {
		console.error("Erro ao remover blueprint de agente", error);
		return NextResponse.json({ error: "Não foi possível remover o agente" }, { status: 500 });
	}
}
