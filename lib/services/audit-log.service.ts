import { getPrismaInstance } from "@/lib/connections";
import { Prisma } from "@prisma/client";

export interface AuditLogEntry {
	userId: string | null;
	action: string;
	resource: string;
	resourceId?: string;
	details?: Record<string, any>;
	ipAddress?: string;
	userAgent?: string;
}

export interface AuditLogFilter {
	userId?: string;
	action?: string;
	resource?: string;
	resourceId?: string;
	startDate?: Date;
	endDate?: Date;
	page?: number;
	limit?: number;
}

export class AuditLogService {
	private static instance: AuditLogService;

	private constructor() {}

	public static getInstance(): AuditLogService {
		if (!AuditLogService.instance) {
			AuditLogService.instance = new AuditLogService();
		}
		return AuditLogService.instance;
	}

	/**
	 * Registra uma entrada no log de auditoria
	 */
	async log(entry: AuditLogEntry): Promise<void> {
		try {
			const prisma = getPrismaInstance();
			await prisma.auditLog.create({
				data: {
					userId: entry.userId,
					action: entry.action,
					resourceType: entry.resource, // Usando resourceType do modelo existente
					resourceId: entry.resourceId,
					queueName: entry.resource === "queue" ? entry.resourceId : undefined,
					details: entry.details ? JSON.parse(JSON.stringify(entry.details)) : null,
					ipAddress: entry.ipAddress,
					userAgent: entry.userAgent,
				},
			});
		} catch (error) {
			console.error("Erro ao registrar log de auditoria:", error);
			// Não propagar o erro para não afetar a operação principal
		}
	}

	/**
	 * Busca logs de auditoria com filtros
	 */
	async getLogs(filter: AuditLogFilter = {}) {
		const { userId, action, resource, resourceId, startDate, endDate, page = 1, limit = 50 } = filter;

		const where: Prisma.AuditLogWhereInput = {};

		if (userId) where.userId = userId;
		if (action) where.action = action;
		if (resource) where.resourceType = resource; // Usando resourceType
		if (resourceId) where.resourceId = resourceId;

		if (startDate || endDate) {
			where.createdAt = {};
			if (startDate) where.createdAt.gte = startDate;
			if (endDate) where.createdAt.lte = endDate;
		}

		const skip = (page - 1) * limit;

		const prisma = getPrismaInstance();

		const [logs, total] = await Promise.all([
			prisma.auditLog.findMany({
				where,
				orderBy: {
					createdAt: "desc",
				},
				skip,
				take: limit,
			}),
			prisma.auditLog.count({ where }),
		]);

		// Buscar dados dos usuários separadamente
		const userIds = [...new Set(logs.map((log) => log.userId).filter((id): id is string => id !== null))];
		const users = await prisma.user.findMany({
			where: { id: { in: userIds } },
			select: { id: true, name: true, email: true },
		});

		const userMap = new Map(users.map((user) => [user.id, user]));

		const logsWithUsers = logs.map((log) => ({
			...log,
			user: userMap.get(log.userId ?? "") || { id: log.userId, name: null, email: "Sistema" },
		}));

		return {
			logs: logsWithUsers,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Busca estatísticas de auditoria
	 */
	async getStats(startDate?: Date, endDate?: Date) {
		const prisma = getPrismaInstance();
		const where: Prisma.AuditLogWhereInput = {};

		if (startDate || endDate) {
			where.createdAt = {};
			if (startDate) where.createdAt.gte = startDate;
			if (endDate) where.createdAt.lte = endDate;
		}

		const [totalLogs, actionStats, resourceStats, userStats] = await Promise.all([
			prisma.auditLog.count({ where }),

			prisma.auditLog.groupBy({
				by: ["action"],
				where,
				_count: {
					action: true,
				},
				orderBy: {
					_count: {
						action: "desc",
					},
				},
			}),

			prisma.auditLog.groupBy({
				by: ["resourceType"],
				where,
				_count: {
					resourceType: true,
				},
				orderBy: {
					_count: {
						resourceType: "desc",
					},
				},
			}),

			prisma.auditLog.groupBy({
				by: ["userId"],
				where,
				_count: {
					userId: true,
				},
				orderBy: {
					_count: {
						userId: "desc",
					},
				},
				take: 10,
			}),
		]);

		return {
			totalLogs,
			actionStats: actionStats.map((stat) => ({
				action: stat.action,
				count: stat._count.action,
			})),
			resourceStats: resourceStats.map((stat) => ({
				resource: stat.resourceType,
				count: stat._count.resourceType,
			})),
			userStats: userStats.map((stat) => ({
				userId: stat.userId,
				count: stat._count.userId,
			})),
		};
	}

	/**
	 * Remove logs antigos (para manutenção)
	 */
	async cleanOldLogs(daysToKeep: number = 90): Promise<number> {
		const prisma = getPrismaInstance();
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

		const result = await prisma.auditLog.deleteMany({
			where: {
				createdAt: {
					lt: cutoffDate,
				},
			},
		});

		return result.count;
	}
}
