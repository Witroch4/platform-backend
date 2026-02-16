// app/api/admin/mtf-diamante/api-keys/route.ts
// API endpoints for managing API keys in MTF Diamante system
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { z } from "zod";
import type { ApiResponse } from "@/app/admin/mtf-diamante/lib/types";

// Validation schemas
const createApiKeySchema = z.object({
	label: z.string().min(1, "Label é obrigatório").max(255, "Label muito longo").optional(),
	tokenHash: z.string().min(1, "Token hash é obrigatório"),
	tokenPrefix: z.string().max(16, "Prefixo muito longo"),
	tokenSuffix: z.string().max(16, "Sufixo muito longo"),
	active: z.boolean().optional().default(true),
});

const updateApiKeySchema = z.object({
	label: z.string().min(1, "Label é obrigatório").max(255, "Label muito longo").optional(),
	active: z.boolean().optional(),
});

// Helper function to transform database result to API format
function transformApiKeyToApiFormat(apiKey: any) {
	return {
		id: apiKey.id,
		name: apiKey.label || "API Key",
		key: `${apiKey.tokenPrefix}...${apiKey.tokenSuffix}`, // Masked token
		type: "other", // Default type since it's not stored in the model
		isActive: apiKey.active ?? true,
		createdAt: apiKey.createdAt.toISOString(),
		updatedAt: apiKey.createdAt.toISOString(), // No updatedAt in the model
	};
}

// GET /api/admin/mtf-diamante/api-keys
export async function GET(request: NextRequest) {
	try {
		// Check authentication
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Não autorizado" } as ApiResponse, { status: 401 });
		}

		const prisma = getPrismaInstance();

		// Get all API keys for the authenticated user
		const apiKeys = await prisma.apiKey.findMany({
			where: {
				ownerId: session.user.id,
			},
			orderBy: {
				createdAt: "desc",
			},
		});

		// Transform to API format
		const transformedApiKeys = apiKeys.map(transformApiKeyToApiFormat);

		return NextResponse.json({
			success: true,
			data: transformedApiKeys,
		} as ApiResponse);
	} catch (error) {
		console.error("Error fetching API keys:", error);
		return NextResponse.json({ success: false, error: "Erro interno do servidor" } as ApiResponse, { status: 500 });
	}
}

// POST /api/admin/mtf-diamante/api-keys
export async function POST(request: NextRequest) {
	try {
		// Check authentication
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Não autorizado" } as ApiResponse, { status: 401 });
		}

		// Parse and validate request body
		const body = await request.json();
		const validationResult = createApiKeySchema.safeParse(body);

		if (!validationResult.success) {
			return NextResponse.json(
				{
					success: false,
					error: "Dados inválidos",
					message: validationResult.error.errors.map((e) => e.message).join(", "),
				} as ApiResponse,
				{ status: 400 },
			);
		}

		const { label, tokenHash, tokenPrefix, tokenSuffix, active } = validationResult.data;
		const prisma = getPrismaInstance();

		// Create the API key
		const newApiKey = await prisma.apiKey.create({
			data: {
				label,
				tokenHash,
				tokenPrefix,
				tokenSuffix,
				active,
				ownerId: session.user.id,
			},
		});

		// Transform to API format
		const transformedApiKey = transformApiKeyToApiFormat(newApiKey);

		return NextResponse.json(
			{
				success: true,
				data: transformedApiKey,
				message: "API Key criada com sucesso",
			} as ApiResponse,
			{ status: 201 },
		);
	} catch (error) {
		console.error("Error creating API key:", error);
		return NextResponse.json({ success: false, error: "Erro interno do servidor" } as ApiResponse, { status: 500 });
	}
}
