/**
 * LGPD Data Subject Rights API
 *
 * Provides endpoints for data subjects to exercise their rights under LGPD:
 * - Right of access (Article 15)
 * - Right to rectification (Article 16)
 * - Right to erasure (Article 17)
 * - Right to data portability (Article 20)
 * - Right to restriction of processing (Article 18)
 */

import { NextRequest, NextResponse } from "next/server";
import { withAccessControl } from "@/lib/ai-integration/middleware/access-control";
import { AIPermission, AccessContext } from "@/lib/ai-integration/services/access-control";
import {
	processDataSubjectRequest,
	findDataBySubject,
	exportDataForSubject,
	deleteDataForSubject,
	logDataAccess,
} from "@/lib/ai-integration/services/lgpd-minimization";
import { z } from "zod";

/**
 * Validation schemas
 */
const DataSubjectRequestSchema = z.object({
	type: z.enum(["access", "rectification", "erasure", "portability", "restriction"]),
	subjectIdentifier: z.string().min(1, "Subject identifier is required"),
	subjectType: z.enum(["phone", "email", "contact_id"]),
	reason: z.string().optional(),
});

const DataSearchSchema = z.object({
	subjectIdentifier: z.string().min(1, "Subject identifier is required"),
	subjectType: z.enum(["phone", "email", "contact_id"]),
});

/**
 * POST /api/ai-integration/lgpd/data-subject
 *
 * Creates a new data subject rights request
 */
async function handlePost(req: NextRequest, context: AccessContext) {
	try {
		const body = await req.json();

		// Validate request data
		const validation = DataSubjectRequestSchema.safeParse(body);
		if (!validation.success) {
			return NextResponse.json(
				{
					error: "Invalid request data",
					details: validation.error.errors,
				},
				{ status: 400 },
			);
		}

		const { type, subjectIdentifier, subjectType, reason } = validation.data;

		// Create the data subject request
		const request = await processDataSubjectRequest({
			type,
			subjectIdentifier,
			subjectType,
			requestedBy: context.userId,
			status: "pending",
			reason,
		});

		// Log the request creation
		await logDataAccess({
			userId: context.userId,
			dataType: "lgpd_request",
			dataId: request.id,
			accessType: "write",
			purpose: `LGPD ${type} request creation`,
			ipAddress: context.ipAddress,
			userAgent: context.userAgent,
		});

		return NextResponse.json({
			success: true,
			request: {
				id: request.id,
				type: request.type,
				status: request.status,
				createdAt: request.createdAt,
				expiresAt: request.expiresAt,
			},
			message: `Data subject ${type} request created successfully`,
			nextSteps: getNextStepsForRequestType(type),
		});
	} catch (error) {
		return NextResponse.json(
			{
				error: "Failed to create data subject request",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

/**
 * GET /api/ai-integration/lgpd/data-subject/search
 *
 * Searches for data associated with a subject identifier
 */
async function handleGet(req: NextRequest, context: AccessContext) {
	try {
		const url = new URL(req.url);
		const subjectIdentifier = url.searchParams.get("subjectIdentifier");
		const subjectType = url.searchParams.get("subjectType") as "phone" | "email" | "contact_id";

		// Validate search parameters
		const validation = DataSearchSchema.safeParse({
			subjectIdentifier,
			subjectType,
		});

		if (!validation.success) {
			return NextResponse.json(
				{
					error: "Invalid search parameters",
					details: validation.error.errors,
				},
				{ status: 400 },
			);
		}

		const { subjectIdentifier: validatedIdentifier, subjectType: validatedType } = validation.data;

		// Find data for the subject
		const dataCount = await findDataBySubject(validatedIdentifier, validatedType);

		// Log the data access
		await logDataAccess({
			userId: context.userId,
			dataType: "lgpd_search",
			dataId: `${validatedType}:${validatedIdentifier}`,
			accessType: "read",
			purpose: "LGPD data subject search",
			ipAddress: context.ipAddress,
			userAgent: context.userAgent,
		});

		return NextResponse.json({
			success: true,
			subjectType: validatedType,
			dataFound: dataCount.totalRecords > 0,
			summary: {
				totalRecords: dataCount.totalRecords,
				llmAuditRecords: dataCount.llmAuditRecords,
				intentHitLogRecords: dataCount.intentHitLogRecords,
				auditLogRecords: dataCount.auditLogRecords,
			},
			availableActions: getAvailableActionsForData(dataCount.totalRecords),
			searchedAt: new Date().toISOString(),
		});
	} catch (error) {
		return NextResponse.json(
			{
				error: "Failed to search for subject data",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

/**
 * POST /api/ai-integration/lgpd/data-subject/export
 *
 * Exports data for a subject (data portability right)
 */
async function handleExport(req: NextRequest, context: AccessContext) {
	try {
		const body = await req.json();

		// Validate request data
		const validation = DataSearchSchema.safeParse(body);
		if (!validation.success) {
			return NextResponse.json(
				{
					error: "Invalid export request",
					details: validation.error.errors,
				},
				{ status: 400 },
			);
		}

		const { subjectIdentifier, subjectType } = validation.data;

		// Create data export
		const exportResult = await exportDataForSubject(subjectIdentifier, subjectType, context.userId);

		return NextResponse.json({
			success: true,
			export: {
				id: exportResult.exportId,
				recordCount: exportResult.recordCount,
				exportedAt: exportResult.exportedAt,
				expiresAt: exportResult.expiresAt,
			},
			message: "Data export created successfully",
			instructions: [
				"Your data export has been created and will be available for 7 days",
				"You will receive a notification when the export is ready for download",
				"The export contains all personal data we have processed about you",
			],
		});
	} catch (error) {
		return NextResponse.json(
			{
				error: "Failed to create data export",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

/**
 * DELETE /api/ai-integration/lgpd/data-subject
 *
 * Deletes data for a subject (right to erasure)
 */
async function handleDelete(req: NextRequest, context: AccessContext) {
	try {
		const body = await req.json();
		const { subjectIdentifier, subjectType, reason = "Data subject erasure request" } = body;

		// Validate request data
		const validation = DataSearchSchema.safeParse({
			subjectIdentifier,
			subjectType,
		});

		if (!validation.success) {
			return NextResponse.json(
				{
					error: "Invalid deletion request",
					details: validation.error.errors,
				},
				{ status: 400 },
			);
		}

		const { subjectIdentifier: validatedIdentifier, subjectType: validatedType } = validation.data;

		// Perform data deletion
		const deletionResult = await deleteDataForSubject(validatedIdentifier, validatedType, context.userId, reason);

		return NextResponse.json({
			success: true,
			deletion: {
				id: deletionResult.deletionId,
				recordsDeleted: deletionResult.recordsDeleted,
				deletedAt: deletionResult.deletedAt,
			},
			message: `Successfully deleted ${deletionResult.recordsDeleted} records`,
			notice: [
				"All personal data associated with the provided identifier has been permanently deleted",
				"This action cannot be undone",
				"Some anonymized data may be retained for legitimate business purposes as permitted by LGPD",
			],
		});
	} catch (error) {
		return NextResponse.json(
			{
				error: "Failed to delete subject data",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

/**
 * Gets next steps for different request types
 */
function getNextStepsForRequestType(type: string): string[] {
	switch (type) {
		case "access":
			return [
				"Your request will be processed within 15 days",
				"You will receive a summary of all personal data we process about you",
				"The response will include the purposes of processing and retention periods",
			];

		case "rectification":
			return [
				"Please provide the correct information you want us to update",
				"We will verify the accuracy of the new information",
				"Changes will be applied within 15 days of verification",
			];

		case "erasure":
			return [
				"We will evaluate if your request meets the legal requirements for erasure",
				"If approved, all your personal data will be permanently deleted",
				"Some anonymized data may be retained for legitimate purposes",
			];

		case "portability":
			return [
				"We will prepare a machine-readable export of your personal data",
				"The export will be available for download within 15 days",
				"You can use this data to transfer to another service provider",
			];

		case "restriction":
			return [
				"We will evaluate your request to restrict processing",
				"If approved, we will only store your data and not process it further",
				"You will be notified before any restriction is lifted",
			];

		default:
			return ["Your request will be processed according to LGPD requirements"];
	}
}

/**
 * Gets available actions based on data found
 */
function getAvailableActionsForData(recordCount: number): string[] {
	if (recordCount === 0) {
		return ["No personal data found for the provided identifier"];
	}

	return [
		"Request data export (portability)",
		"Request data deletion (erasure)",
		"Request processing restriction",
		"Request data rectification",
	];
}

// Apply access control middleware
export const POST = withAccessControl(handlePost, {
	requiredPermission: AIPermission.MANAGE_CONFIG, // Admin permission for LGPD requests
	resourceType: "AI_LGPD_REQUEST",
});

export const GET = withAccessControl(handleGet, {
	requiredPermission: AIPermission.VIEW_AUDIT_LOGS, // Admin permission to search data
	resourceType: "AI_LGPD_SEARCH",
});

// Export endpoint
export async function PUT(req: NextRequest) {
	const handler = withAccessControl(handleExport, {
		requiredPermission: AIPermission.EXPORT_DATA,
		resourceType: "AI_LGPD_EXPORT",
	});

	return handler(req);
}

export const DELETE = withAccessControl(handleDelete, {
	requiredPermission: AIPermission.DELETE_AUDIT_LOGS, // High-level permission for data deletion
	resourceType: "AI_LGPD_DELETION",
});
