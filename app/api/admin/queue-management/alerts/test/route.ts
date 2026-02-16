import { NextRequest, NextResponse } from "next/server";
import { broadcastAlert } from "@/lib/queue-management/websocket-manager";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { type = "test", queueName, severity = "warning" } = body;

		// Create a test alert
		const testAlert = {
			id: `test-alert-${Date.now()}`,
			ruleId: "test-rule",
			queueName: queueName || "test-queue",
			severity: severity as "info" | "warning" | "error" | "critical",
			title: `Test Alert - ${type}`,
			message: `This is a test alert generated at ${new Date().toLocaleString()}`,
			metrics: {
				testValue: Math.floor(Math.random() * 100),
				timestamp: Date.now(),
			},
			status: "active" as const,
			createdAt: new Date(),
		};

		// Broadcast the alert via WebSocket (if available)
		try {
			broadcastAlert(testAlert, "created");
		} catch (wsError) {
			console.warn("[Test Alert] WebSocket not available:", wsError);
		}

		return NextResponse.json({
			success: true,
			message: "Test alert created and broadcasted",
			alert: testAlert,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("[Test Alert] Error creating test alert:", error);

		return NextResponse.json(
			{
				success: false,
				error: "Failed to create test alert",
				message: error instanceof Error ? error.message : "Unknown error",
				timestamp: new Date().toISOString(),
			},
			{ status: 500 },
		);
	}
}
