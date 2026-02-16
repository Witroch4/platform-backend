/**
 * Unit Tests for KPI Calculation Service
 *
 * Tests the calculateExecutiveKPIs function with various scenarios including
 * edge cases like empty datasets and division by zero.
 */

import { calculateExecutiveKPIs, buildWhereClause, type DashboardFilters } from "@/lib/flow-analytics/kpi-service";
import { getPrismaInstance } from "@/lib/connections";

// Mock Prisma
jest.mock("@/lib/connections", () => ({
	getPrismaInstance: jest.fn(),
}));

describe("KPI Calculations - Edge Cases", () => {
	let mockPrisma: any;

	beforeEach(() => {
		mockPrisma = {
			flowSession: {
				count: jest.fn(),
				findMany: jest.fn(),
			},
		};
		(getPrismaInstance as jest.Mock).mockReturnValue(mockPrisma);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it("should handle empty session array", async () => {
		// Mock empty dataset
		mockPrisma.flowSession.count.mockResolvedValue(0);
		mockPrisma.flowSession.findMany.mockResolvedValue([]);

		const filters: DashboardFilters = {};
		const kpis = await calculateExecutiveKPIs(filters);

		expect(kpis.totalExecutions).toBe(0);
		expect(kpis.completionRate).toBe(0);
		expect(kpis.abandonmentRate).toBe(0);
		expect(kpis.errorRate).toBe(0);
		expect(kpis.avgTimeToCompletion).toBe(0);
		expect(kpis.avgTimeToAbandonment).toBe(0);
		expect(kpis.startToEndRate).toBe(0);
		expect(kpis.startToFirstInteractionRate).toBe(0);
		expect(kpis.avgClickThroughRate).toBe(0);
		expect(kpis.avgResponseRateAfterDelay).toBe(0);
	});

	it("should handle all sessions completed", async () => {
		const now = new Date();
		const oneHourAgo = new Date(now.getTime() - 3600000);

		mockPrisma.flowSession.count
			.mockResolvedValueOnce(3) // total
			.mockResolvedValueOnce(3) // completed
			.mockResolvedValueOnce(0) // error
			.mockResolvedValueOnce(0) // active
			.mockResolvedValueOnce(0); // waiting

		mockPrisma.flowSession.findMany.mockResolvedValue([
			{
				id: "1",
				status: "COMPLETED",
				createdAt: oneHourAgo,
				completedAt: now,
				executionLog: [
					{ nodeId: "start", nodeType: "START", timestamp: oneHourAgo.getTime() },
					{ nodeId: "end", nodeType: "END", timestamp: now.getTime() },
				],
			},
			{
				id: "2",
				status: "COMPLETED",
				createdAt: oneHourAgo,
				completedAt: now,
				executionLog: [
					{ nodeId: "start", nodeType: "START", timestamp: oneHourAgo.getTime() },
					{ nodeId: "end", nodeType: "END", timestamp: now.getTime() },
				],
			},
			{
				id: "3",
				status: "COMPLETED",
				createdAt: oneHourAgo,
				completedAt: now,
				executionLog: [
					{ nodeId: "start", nodeType: "START", timestamp: oneHourAgo.getTime() },
					{ nodeId: "end", nodeType: "END", timestamp: now.getTime() },
				],
			},
		]);

		const filters: DashboardFilters = {};
		const kpis = await calculateExecutiveKPIs(filters);

		expect(kpis.totalExecutions).toBe(3);
		expect(kpis.completionRate).toBe(100);
		expect(kpis.abandonmentRate).toBe(0);
		expect(kpis.errorRate).toBe(0);
		expect(kpis.startToEndRate).toBe(100);
	});

	it("should handle division by zero in drop-off rate calculations", async () => {
		mockPrisma.flowSession.count
			.mockResolvedValueOnce(1) // total
			.mockResolvedValueOnce(0) // completed
			.mockResolvedValueOnce(0) // error
			.mockResolvedValueOnce(1) // active
			.mockResolvedValueOnce(0); // waiting

		mockPrisma.flowSession.findMany.mockResolvedValue([
			{
				id: "1",
				status: "ACTIVE",
				createdAt: new Date(),
				completedAt: null,
				executionLog: [],
			},
		]);

		const filters: DashboardFilters = {};
		const kpis = await calculateExecutiveKPIs(filters);

		// Should not throw error and should return valid numbers
		expect(kpis.totalExecutions).toBe(1);
		expect(kpis.completionRate).toBe(0);
		expect(kpis.abandonmentRate).toBe(100);
		expect(kpis.avgTimeToCompletion).toBe(0); // No completed sessions
		expect(kpis.avgClickThroughRate).toBe(0); // No interactive messages
	});

	it("should calculate completion rate correctly", async () => {
		mockPrisma.flowSession.count
			.mockResolvedValueOnce(10) // total
			.mockResolvedValueOnce(7) // completed
			.mockResolvedValueOnce(1) // error
			.mockResolvedValueOnce(1) // active
			.mockResolvedValueOnce(1); // waiting

		mockPrisma.flowSession.findMany.mockResolvedValue([]);

		const filters: DashboardFilters = {};
		const kpis = await calculateExecutiveKPIs(filters);

		expect(kpis.totalExecutions).toBe(10);
		expect(kpis.completionRate).toBe(70); // 7/10 * 100
		expect(kpis.errorRate).toBe(10); // 1/10 * 100
		expect(kpis.abandonmentRate).toBe(20); // 100 - 70 - 10
	});

	it("should calculate interactive message metrics correctly", async () => {
		const now = new Date();

		mockPrisma.flowSession.count
			.mockResolvedValueOnce(2) // total
			.mockResolvedValueOnce(2) // completed
			.mockResolvedValueOnce(0) // error
			.mockResolvedValueOnce(0) // active
			.mockResolvedValueOnce(0); // waiting

		mockPrisma.flowSession.findMany.mockResolvedValue([
			{
				id: "1",
				status: "COMPLETED",
				createdAt: now,
				completedAt: now,
				executionLog: [
					{ nodeId: "msg1", nodeType: "INTERACTIVE_MESSAGE", timestamp: now.getTime(), buttonClicked: "btn1" },
					{ nodeId: "msg2", nodeType: "INTERACTIVE_MESSAGE", timestamp: now.getTime() }, // No click
				],
			},
			{
				id: "2",
				status: "COMPLETED",
				createdAt: now,
				completedAt: now,
				executionLog: [
					{ nodeId: "msg3", nodeType: "INTERACTIVE_MESSAGE", timestamp: now.getTime(), action: "button_click" },
				],
			},
		]);

		const filters: DashboardFilters = {};
		const kpis = await calculateExecutiveKPIs(filters);

		// 2 clicks out of 3 interactive messages = 66.67%
		expect(kpis.avgClickThroughRate).toBeCloseTo(66.67, 1);
	});

	it("should calculate delay node response rate correctly", async () => {
		const now = new Date();

		mockPrisma.flowSession.count
			.mockResolvedValueOnce(1) // total
			.mockResolvedValueOnce(1) // completed
			.mockResolvedValueOnce(0) // error
			.mockResolvedValueOnce(0) // active
			.mockResolvedValueOnce(0); // waiting

		mockPrisma.flowSession.findMany.mockResolvedValue([
			{
				id: "1",
				status: "COMPLETED",
				createdAt: now,
				completedAt: now,
				executionLog: [
					{ nodeId: "delay1", nodeType: "DELAY", timestamp: now.getTime() },
					{ nodeId: "next1", nodeType: "TEXT_MESSAGE", timestamp: now.getTime() + 1000 },
					{ nodeId: "delay2", nodeType: "DELAY", timestamp: now.getTime() + 2000 },
					// No node after delay2
				],
			},
		]);

		const filters: DashboardFilters = {};
		const kpis = await calculateExecutiveKPIs(filters);

		// 1 response after delay out of 2 delays = 50%
		expect(kpis.avgResponseRateAfterDelay).toBe(50);
	});
});

describe("buildWhereClause", () => {
	it("should build empty where clause for no filters", () => {
		const filters: DashboardFilters = {};
		const where = buildWhereClause(filters);

		expect(where).toEqual({});
	});

	it("should build where clause with inboxId filter", () => {
		const filters: DashboardFilters = {
			inboxId: "inbox-123",
		};
		const where = buildWhereClause(filters);

		expect(where).toEqual({
			inboxId: "inbox-123",
		});
	});

	it("should build where clause with flowId filter", () => {
		const filters: DashboardFilters = {
			flowId: "flow-456",
		};
		const where = buildWhereClause(filters);

		expect(where).toEqual({
			flowId: "flow-456",
		});
	});

	it("should build where clause with date range filter", () => {
		const start = new Date("2024-01-01");
		const end = new Date("2024-01-31");
		const filters: DashboardFilters = {
			dateRange: { start, end },
		};
		const where = buildWhereClause(filters);

		expect(where).toEqual({
			createdAt: {
				gte: start,
				lte: end,
			},
		});
	});

	it("should build where clause with status filter", () => {
		const filters: DashboardFilters = {
			status: ["COMPLETED", "ERROR"],
		};
		const where = buildWhereClause(filters);

		expect(where).toEqual({
			status: {
				in: ["COMPLETED", "ERROR"],
			},
		});
	});

	it("should build where clause with multiple filters", () => {
		const start = new Date("2024-01-01");
		const end = new Date("2024-01-31");
		const filters: DashboardFilters = {
			inboxId: "inbox-123",
			flowId: "flow-456",
			dateRange: { start, end },
			status: ["COMPLETED"],
		};
		const where = buildWhereClause(filters);

		expect(where).toEqual({
			inboxId: "inbox-123",
			flowId: "flow-456",
			createdAt: {
				gte: start,
				lte: end,
			},
			status: {
				in: ["COMPLETED"],
			},
		});
	});
});
