// app/api/admin/mtf-diamante/api-keys/[id]/route.ts
// API endpoints for individual API key operations
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
import { z } from "zod";
import type { ApiResponse } from "@/app/mtf-diamante/lib/types";

// Validation schema for updates
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

// GET /api/admin/mtf-diamante/api-keys/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		// Check authentication
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Não autorizado" } as ApiResponse, { status: 401 });
		}

		const { id } = await params;
		const prisma = getPrismaInstance();

		// Find the API key and verify user access
		const apiKey = await prisma.apiKey.findFirst({
			where: {
				id,
				ownerId: session.user.id,
			},
		});

		if (!apiKey) {
			return NextResponse.json(
				{ success: false, error: "API Key não encontrada ou sem permissão de acesso" } as ApiResponse,
				{ status: 404 },
			);
		}

		// Transform to API format
		const transformedApiKey = transformApiKeyToApiFormat(apiKey);

		return NextResponse.json({
			success: true,
			data: transformedApiKey,
		} as ApiResponse);
	} catch (error) {
		console.error("Error fetching API key:", error);
		return NextResponse.json({ success: false, error: "Erro interno do servidor" } as ApiResponse, { status: 500 });
	}
}

// PUT /api/admin/mtf-diamante/api-keys/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		// Check authentication
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Não autorizado" } as ApiResponse, { status: 401 });
		}

		const { id } = await params;

		// Parse and validate request body
		const body = await request.json();
		const validationResult = updateApiKeySchema.safeParse(body);

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

		const updateData = validationResult.data;
		const prisma = getPrismaInstance();

		// Verify the API key exists and user has access
		const existingApiKey = await prisma.apiKey.findFirst({
			where: {
				id,
				ownerId: session.user.id,
			},
		});

		if (!existingApiKey) {
			return NextResponse.json(
				{ success: false, error: "API Key não encontrada ou sem permissão de acesso" } as ApiResponse,
				{ status: 404 },
			);
		}

		// Update the API key
		const updatedApiKey = await prisma.apiKey.update({
			where: { id },
			data: updateData,
		});

		// Transform to API format
		const transformedApiKey = transformApiKeyToApiFormat(updatedApiKey);

		return NextResponse.json({
			success: true,
			data: transformedApiKey,
			message: "API Key atualizada com sucesso",
		} as ApiResponse);
	} catch (error) {
		console.error("Error updating API key:", error);
		return NextResponse.json({ success: false, error: "Erro interno do servidor" } as ApiResponse, { status: 500 });
	}
}

// DELETE /api/admin/mtf-diamante/api-keys/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		// Check authentication
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ success: false, error: "Não autorizado" } as ApiResponse, { status: 401 });
		}

		const { id } = await params;
		const prisma = getPrismaInstance();

		// Verify the API key exists and user has access
		const existingApiKey = await prisma.apiKey.findFirst({
			where: {
				id,
				ownerId: session.user.id,
			},
		});

		if (!existingApiKey) {
			return NextResponse.json(
				{ success: false, error: "API Key não encontrada ou sem permissão de acesso" } as ApiResponse,
				{ status: 404 },
			);
		}

		// Delete the API key
		await prisma.apiKey.delete({
			where: { id },
		});

		return NextResponse.json({
			success: true,
			message: "API Key deletada com sucesso",
		} as ApiResponse);
	} catch (error) {
		console.error("Error deleting API key:", error);
		return NextResponse.json({ success: false, error: "Erro interno do servidor" } as ApiResponse, { status: 500 });
	}
}
