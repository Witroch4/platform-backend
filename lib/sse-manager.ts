import { getRedisInstance } from "@/lib/connections";
import { getPrismaInstance } from "@/lib/connections";
import { createLogger } from "@/lib/utils/logger";

const logManager = createLogger("SSE.Manager");
const logRedis = createLogger("SSE.Redis");

// --- Interface da Conexão ---
interface SseConnection {
	controller: ReadableStreamDefaultController<string>;
	connectionId: string;
	userId: string;
}

// --- Definição do Singleton no escopo global ---
const globalForSse = globalThis as unknown as {
	sseManager: SseManager | undefined;
};

// --- Classe SseManager ---
class SseManager {
	// Conexões por usuário: Map<userId, Map<connId, SseConnection>>
	private connectionsByUser: Map<string, Map<string, SseConnection>> = new Map();
	// Canais inscritos por usuário: Map<userId, Set<leadId>>
	private userLeadChannels: Map<string, Set<string>> = new Map();
	// Usuários SUPERADMIN conectados
	private superAdminUsers: Set<string> = new Set();
	// Se já fez PSUBSCRIBE sse:*
	private psubscribeActive = false;

	private publisher!: ReturnType<typeof getRedisInstance>;
	private subscriber!: ReturnType<typeof getRedisInstance>;
	private isInitialized = false;

	constructor() {
		logManager.info("Criando nova instancia (user-based)...");
	}

	private async initializeRedis() {
		if (this.isInitialized || this.publisher) {
			return;
		}

		try {
			const baseRedis = getRedisInstance();
			logRedis.info("Usando conexao singleton");

			this.publisher = baseRedis.duplicate();
			this.subscriber = baseRedis.duplicate();

			this.publisher.on("connect", () => {
				logRedis.info("Publisher conectado.");
				this.isInitialized = true;
			});

			this.subscriber.on("connect", () => logRedis.info("Subscriber conectado."));

			const handleError = (client: string) => (error: Error) => {
				console.error(`[SSE Redis] Erro no ${client}:`, error.message);
				if (client === "publisher") this.isInitialized = false;
			};

			this.publisher.on("error", handleError("Publisher"));
			this.subscriber.on("error", handleError("Subscriber"));

			// Handler para SUBSCRIBE (canais individuais sse:{leadId})
			this.subscriber.on("message", this.handleRedisMessage.bind(this));
			// Handler para PSUBSCRIBE (pattern sse:* para SUPERADMIN)
			this.subscriber.on("pmessage", this.handleRedisPatternMessage.bind(this));

			try {
				if (typeof (this.publisher as any).connect === "function") {
					console.log("[SSE Redis] Conectando Publisher...");
					await (this.publisher as any).connect();
				}
			} catch (err) {
				console.warn("[SSE Redis] Publisher connect não disponível ou já conectado", err);
			}

			try {
				if (typeof (this.subscriber as any).connect === "function") {
					console.log("[SSE Redis] Conectando Subscriber...");
					await (this.subscriber as any).connect();
				}
			} catch (err) {
				console.warn("[SSE Redis] Subscriber connect não disponível ou já conectado", err);
			}

			this.isInitialized = true;
			console.log("[SSE Redis] Inicialização concluída");
		} catch (error) {
			console.error("[SSE Redis] Erro ao inicializar Redis:", error);
		}
	}

	public async ensureRedisConnected(): Promise<boolean> {
		if (this.isInitialized && this.publisher) {
			return true;
		}

		console.log("[SSE Manager] Garantindo conexão Redis...");
		await this.initializeRedis();

		const startTime = Date.now();
		while (!this.isInitialized && Date.now() - startTime < 5000) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		if (!this.isInitialized) {
			console.error("[SSE Manager] Timeout aguardando conexão Redis");
			return false;
		}

		console.log("[SSE Manager] Redis conectado e pronto");
		return true;
	}

	/**
	 * Entrega mensagem de um canal sse:{leadId} para os usuários corretos.
	 * Chamado por SUBSCRIBE (leads individuais de ADMINs).
	 */
	private handleRedisMessage(channel: string, message: string) {
		const leadId = channel.replace("sse:", "");
		this.deliverToUsers(leadId, message);
	}

	/**
	 * Entrega mensagem de PSUBSCRIBE sse:* para SUPERADMINs.
	 * O ioredis chama pmessage(pattern, channel, message).
	 */
	private handleRedisPatternMessage(_pattern: string, channel: string, message: string) {
		const leadId = channel.replace("sse:", "");
		// Entregar apenas para SUPERADMINs (ADMINs recebem via handleRedisMessage)
		this.deliverToSuperAdmins(leadId, message);
	}

	/**
	 * Entrega mensagem para todos os ADMINs inscritos nesse leadId.
	 */
	private deliverToUsers(leadId: string, message: string) {
		let totalDelivered = 0;

		for (const [userId, leadChannels] of this.userLeadChannels) {
			// Pular SUPERADMINs — eles recebem via pmessage
			if (this.superAdminUsers.has(userId)) continue;

			if (leadChannels.has(leadId)) {
				totalDelivered += this.enqueueToUser(userId, message);
			}
		}

		if (totalDelivered === 0) {
			// Nenhum ADMIN inscrito — pode ser lead novo. Lazy lookup.
			this.handleUnknownLead(leadId, message);
		}
	}

	/**
	 * Entrega mensagem para todos os SUPERADMINs conectados.
	 */
	private deliverToSuperAdmins(leadId: string, message: string) {
		for (const userId of this.superAdminUsers) {
			this.enqueueToUser(userId, message);
		}
	}

	/**
	 * Enfileira mensagem para todas as conexões de um usuário.
	 */
	private enqueueToUser(userId: string, message: string): number {
		const userConns = this.connectionsByUser.get(userId);
		if (!userConns || userConns.size === 0) return 0;

		let successCount = 0;
		const toRemove: string[] = [];

		userConns.forEach((conn) => {
			try {
				conn.controller.enqueue(`data: ${message}\n\n`);
				successCount++;
			} catch {
				console.warn(`[SSE Manager] Conexão ${conn.connectionId} fechada, removendo.`);
				toRemove.push(conn.connectionId);
			}
		});

		for (const connId of toRemove) {
			this.removeUserConnection(userId, connId);
		}

		return successCount;
	}

	/**
	 * Lead não está no set de nenhum ADMIN conectado.
	 * Faz lazy lookup no DB para descobrir o dono e adicionar a subscription.
	 */
	private async handleUnknownLead(leadId: string, message: string) {
		try {
			const prisma = getPrismaInstance();
			const lead = await prisma.leadOabData.findFirst({
				where: { id: leadId },
				select: { usuarioChatwit: { select: { appUserId: true } } },
			});

			if (!lead?.usuarioChatwit?.appUserId) return;

			const userId = lead.usuarioChatwit.appUserId;
			const userChannels = this.userLeadChannels.get(userId);

			if (userChannels) {
				// Usuário conectado mas não tinha esse lead — adicionar
				userChannels.add(leadId);
				if (this.subscriber && !this.superAdminUsers.has(userId)) {
					this.subscriber.subscribe(`sse:${leadId}`);
				}
				// Entregar a mensagem agora
				this.enqueueToUser(userId, message);
				console.log(`[SSE Manager] Lead ${leadId} adicionado dinamicamente para user ${userId}`);
			}
		} catch (error) {
			// Silencioso — é um best-effort
			console.warn("[SSE Manager] Erro no lazy lookup de lead:", error);
		}
	}

	/**
	 * Adiciona conexão SSE para um usuário autenticado.
	 * SUPERADMIN: PSUBSCRIBE sse:* (recebe tudo)
	 * ADMIN: SUBSCRIBE sse:{leadId} para cada lead do usuário
	 */
	public async addUserConnection(
		userId: string,
		role: string,
		controller: ReadableStreamDefaultController<string>,
	): Promise<string> {
		await this.initializeRedis();

		const connectionId = `user-${userId}-${Date.now()}`;
		const isSuperAdmin = role === "SUPERADMIN";

		// Registrar conexão
		if (!this.connectionsByUser.has(userId)) {
			this.connectionsByUser.set(userId, new Map());
		}
		this.connectionsByUser.get(userId)!.set(connectionId, { controller, connectionId, userId });

		if (isSuperAdmin) {
			this.superAdminUsers.add(userId);

			// PSUBSCRIBE uma vez para todos os SUPERADMINs
			if (!this.psubscribeActive && this.subscriber) {
				this.subscriber.psubscribe("sse:*", (err: any, count: any) => {
					if (err) {
						console.error("[SSE Redis] Falha no PSUBSCRIBE sse:*", err);
						return;
					}
					this.psubscribeActive = true;
					console.log(`[SSE Redis] PSUBSCRIBE sse:* ativo (${count} patterns)`);
				});
			}

			console.log(`[SSE Manager] SUPERADMIN ${userId} conectado (${connectionId})`);
		} else {
			// ADMIN: buscar leads do usuário e inscrever em cada canal
			await this.subscribeUserLeads(userId);
			console.log(`[SSE Manager] ADMIN ${userId} conectado (${connectionId}, ${this.userLeadChannels.get(userId)?.size || 0} leads)`);
		}

		// Mensagem de boas-vindas
		try {
			controller.enqueue(
				`data: ${JSON.stringify({
					type: "connected",
					message: "Conexão SSE estabelecida",
					userId,
					connectionId,
					timestamp: new Date().toISOString(),
				})}\n\n`,
			);
		} catch (error) {
			console.error("[SSE Manager] Erro ao enviar boas-vindas:", error);
		}

		return connectionId;
	}

	/**
	 * Busca leads do usuário no DB e inscreve nos canais Redis.
	 */
	private async subscribeUserLeads(userId: string) {
		try {
			const prisma = getPrismaInstance();
			const leads = await prisma.leadOabData.findMany({
				where: { usuarioChatwit: { appUserId: userId } },
				select: { id: true },
			});

			const leadIds = new Set(leads.map((l: { id: string }) => l.id));
			const prevChannels = this.userLeadChannels.get(userId) || new Set<string>();

			// Novos canais para inscrever
			for (const leadId of leadIds) {
				if (!prevChannels.has(leadId) && this.subscriber) {
					this.subscriber.subscribe(`sse:${leadId}`);
				}
			}

			// Canais para desinscrever (lead removido do user)
			for (const leadId of prevChannels) {
				if (!leadIds.has(leadId)) {
					// Só desinscreve se nenhum outro user usa esse canal
					const otherUserUsesChannel = this.isChannelUsedByOtherUser(leadId, userId);
					if (!otherUserUsesChannel && this.subscriber) {
						this.subscriber.unsubscribe(`sse:${leadId}`);
					}
				}
			}

			this.userLeadChannels.set(userId, leadIds);
		} catch (error) {
			console.error(`[SSE Manager] Erro ao buscar leads do user ${userId}:`, error);
			// Garantir que o set existe mesmo com erro
			if (!this.userLeadChannels.has(userId)) {
				this.userLeadChannels.set(userId, new Set());
			}
		}
	}

	/**
	 * Verifica se algum outro ADMIN (não-SUPERADMIN) está inscrito nesse canal.
	 */
	private isChannelUsedByOtherUser(leadId: string, excludeUserId: string): boolean {
		for (const [uid, channels] of this.userLeadChannels) {
			if (uid !== excludeUserId && !this.superAdminUsers.has(uid) && channels.has(leadId)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Remove uma conexão de um usuário.
	 */
	public removeUserConnection(userId: string, connectionId: string): void {
		const userConns = this.connectionsByUser.get(userId);
		if (!userConns?.delete(connectionId)) return;

		console.log(`[SSE Manager] Conexão ${connectionId} removida.`);

		// Se era a última conexão do user, limpar subscriptions
		if (userConns.size === 0) {
			this.connectionsByUser.delete(userId);

			if (this.superAdminUsers.has(userId)) {
				this.superAdminUsers.delete(userId);
				// Se não há mais SUPERADMINs, cancelar PSUBSCRIBE
				if (this.superAdminUsers.size === 0 && this.psubscribeActive && this.subscriber) {
					this.subscriber.punsubscribe("sse:*");
					this.psubscribeActive = false;
					console.log("[SSE Redis] PSUBSCRIBE sse:* desativado (sem SUPERADMINs)");
				}
			} else {
				// ADMIN: desinscrever dos canais que só esse user usava
				const userChannels = this.userLeadChannels.get(userId);
				if (userChannels && this.subscriber) {
					for (const leadId of userChannels) {
						if (!this.isChannelUsedByOtherUser(leadId, userId)) {
							this.subscriber.unsubscribe(`sse:${leadId}`);
						}
					}
				}
				this.userLeadChannels.delete(userId);
			}

			console.log(`[SSE Manager] User ${userId} desconectado (última conexão).`);
		}
	}

	/**
	 * Atualiza as subscriptions de um usuário (chamado quando leads mudam).
	 */
	public async refreshUserLeads(userId: string): Promise<void> {
		if (!this.connectionsByUser.has(userId)) return;
		if (this.superAdminUsers.has(userId)) return; // SUPERADMIN já recebe tudo

		console.log(`[SSE Manager] Refresh subscriptions para user ${userId}`);
		await this.subscribeUserLeads(userId);
	}

	/**
	 * Publica notificação no canal sse:{leadId}.
	 * Workers e API routes usam esse método — INALTERADO.
	 */
	public async sendNotification(leadId: string, data: any): Promise<boolean> {
		await this.initializeRedis();

		if (!this.isInitialized || !this.publisher) {
			console.warn("[SSE Manager] Publisher não inicializado, tentando garantir conexão...");
			const connected = await this.ensureRedisConnected();
			if (!connected) {
				console.error("[SSE Manager] ERRO CRÍTICO: Não foi possível conectar ao Redis Publisher.");
				return false;
			}
		}

		try {
			const message = JSON.stringify({
				type: "notification",
				leadId,
				data,
				timestamp: new Date().toISOString(),
			});

			await this.publisher.publish(`sse:${leadId}`, message);
			console.log(`[SSE Redis] Notificação para ${leadId} publicada.`);
			return true;
		} catch (error) {
			console.error("[SSE Redis] Erro ao publicar notificação:", error);
			return false;
		}
	}

	// --- Métodos de status/debug ---

	public getConnectionsCount(): number {
		let total = 0;
		for (const conns of this.connectionsByUser.values()) {
			total += conns.size;
		}
		return total;
	}

	public getStatus() {
		const users = Array.from(this.connectionsByUser.keys());
		const userCounts = users.map((userId) => ({
			userId,
			connections: this.connectionsByUser.get(userId)!.size,
			isSuperAdmin: this.superAdminUsers.has(userId),
			leadChannels: this.userLeadChannels.get(userId)?.size || 0,
		}));

		return {
			isRedisInitialized: this.isInitialized,
			totalConnections: this.getConnectionsCount(),
			usersConnected: users.length,
			superAdminCount: this.superAdminUsers.size,
			psubscribeActive: this.psubscribeActive,
			connectionsPerUser: userCounts,
		};
	}

	public async cleanup(): Promise<void> {
		try {
			console.log("[SSE Manager] Iniciando limpeza...");

			this.connectionsByUser.clear();
			this.userLeadChannels.clear();
			this.superAdminUsers.clear();
			this.psubscribeActive = false;

			if (this.isInitialized) {
				await this.subscriber.disconnect();
				await this.publisher.disconnect();
				console.log("[SSE Redis] Clientes Redis desconectados");
				this.isInitialized = false;
			}

			console.log("[SSE Manager] Limpeza concluída");
		} catch (error) {
			console.error("[SSE Manager] Erro durante limpeza:", error);
		}
	}
}

// --- Singleton ---
export const sseManager = globalForSse.sseManager || new SseManager();

if (process.env.NODE_ENV !== "production") {
	globalForSse.sseManager = sseManager;
}
