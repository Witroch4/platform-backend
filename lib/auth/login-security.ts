/**
 * Login Security Service
 * Proteção contra brute force, rate limiting e lockout de conta
 */

import { getRedisInstance } from "@/lib/connections";

// Configurações de segurança
const CONFIG = {
	// Rate limiting por IP
	ipRateLimit: {
		maxAttempts: 10, // Máximo de tentativas por janela
		windowSeconds: 60, // Janela de 1 minuto
	},
	// Lockout de conta
	accountLockout: {
		maxFailedAttempts: 5, // Bloqueia após 5 tentativas falhas
		lockoutMinutes: 15, // Bloqueia por 15 minutos
		resetAfterMinutes: 30, // Reseta contador após 30 minutos sem tentativas
	},
	// Delay progressivo (em ms)
	progressiveDelay: {
		baseDelay: 0, // Sem delay inicial
		delayPerAttempt: 500, // 500ms adicional por tentativa falha
		maxDelay: 5000, // Máximo de 5 segundos
	},
};

// Prefixos de chaves Redis
const KEYS = {
	ipAttempts: (ip: string) => `login:ip:${ip}`,
	accountAttempts: (email: string) => `login:account:${email}:attempts`,
	accountLockout: (email: string) => `login:account:${email}:lockout`,
};

export interface LoginSecurityResult {
	allowed: boolean;
	reason?: "ip_rate_limited" | "account_locked" | "too_many_attempts";
	retryAfterSeconds?: number;
	failedAttempts?: number;
	message: string;
}

export interface LoginAttemptResult {
	shouldDelay: boolean;
	delayMs: number;
}

/**
 * Verifica se o login é permitido (rate limiting + lockout)
 */
export async function checkLoginAllowed(ip: string, email: string): Promise<LoginSecurityResult> {
	try {
		const redis = getRedisInstance();

		// 1. Verificar rate limit por IP
		const ipKey = KEYS.ipAttempts(ip);
		const ipAttempts = await redis.get(ipKey);
		const ipCount = ipAttempts ? parseInt(ipAttempts, 10) : 0;

		if (ipCount >= CONFIG.ipRateLimit.maxAttempts) {
			const ttl = await redis.ttl(ipKey);
			return {
				allowed: false,
				reason: "ip_rate_limited",
				retryAfterSeconds: ttl > 0 ? ttl : CONFIG.ipRateLimit.windowSeconds,
				message: `Muitas tentativas. Tente novamente em ${ttl > 0 ? ttl : CONFIG.ipRateLimit.windowSeconds} segundos.`,
			};
		}

		// 2. Verificar se conta está bloqueada
		const lockoutKey = KEYS.accountLockout(email.toLowerCase());
		const isLocked = await redis.get(lockoutKey);

		if (isLocked) {
			const ttl = await redis.ttl(lockoutKey);
			return {
				allowed: false,
				reason: "account_locked",
				retryAfterSeconds: ttl > 0 ? ttl : CONFIG.accountLockout.lockoutMinutes * 60,
				message: `Conta temporariamente bloqueada. Tente novamente em ${Math.ceil((ttl > 0 ? ttl : CONFIG.accountLockout.lockoutMinutes * 60) / 60)} minutos.`,
			};
		}

		// 3. Verificar tentativas falhas da conta (para informação)
		const attemptsKey = KEYS.accountAttempts(email.toLowerCase());
		const accountAttempts = await redis.get(attemptsKey);
		const failedCount = accountAttempts ? parseInt(accountAttempts, 10) : 0;

		return {
			allowed: true,
			failedAttempts: failedCount,
			message: "OK",
		};
	} catch (error) {
		// Fail open - se Redis falhar, permite o login
		console.error("[LoginSecurity] Erro ao verificar segurança:", error);
		return {
			allowed: true,
			message: "OK",
		};
	}
}

/**
 * Registra uma tentativa de login falha
 */
export async function recordFailedAttempt(ip: string, email: string): Promise<LoginAttemptResult> {
	try {
		const redis = getRedisInstance();
		const normalizedEmail = email.toLowerCase();

		// 1. Incrementar contador de IP
		const ipKey = KEYS.ipAttempts(ip);
		await redis.multi().incr(ipKey).expire(ipKey, CONFIG.ipRateLimit.windowSeconds).exec();

		// 2. Incrementar contador de tentativas da conta
		const attemptsKey = KEYS.accountAttempts(normalizedEmail);
		const newCount = await redis.incr(attemptsKey);
		await redis.expire(attemptsKey, CONFIG.accountLockout.resetAfterMinutes * 60);

		// 3. Verificar se deve bloquear a conta
		if (newCount >= CONFIG.accountLockout.maxFailedAttempts) {
			const lockoutKey = KEYS.accountLockout(normalizedEmail);
			await redis.setex(lockoutKey, CONFIG.accountLockout.lockoutMinutes * 60, "locked");
			// Resetar contador de tentativas
			await redis.del(attemptsKey);

			console.warn(`[LoginSecurity] Conta bloqueada por tentativas excessivas: ${normalizedEmail}`);
		}

		// 4. Calcular delay progressivo
		const delay = Math.min(
			CONFIG.progressiveDelay.baseDelay + newCount * CONFIG.progressiveDelay.delayPerAttempt,
			CONFIG.progressiveDelay.maxDelay,
		);

		return {
			shouldDelay: delay > 0,
			delayMs: delay,
		};
	} catch (error) {
		console.error("[LoginSecurity] Erro ao registrar tentativa falha:", error);
		return {
			shouldDelay: false,
			delayMs: 0,
		};
	}
}

/**
 * Registra um login bem-sucedido (limpa contadores)
 */
export async function recordSuccessfulLogin(ip: string, email: string): Promise<void> {
	try {
		const redis = getRedisInstance();
		const normalizedEmail = email.toLowerCase();

		// Limpar contadores de tentativas falhas
		await redis.del(KEYS.accountAttempts(normalizedEmail));

		// Não limpamos o contador de IP para evitar que um atacante
		// use um login válido para resetar o rate limit

		console.info(`[LoginSecurity] Login bem-sucedido: ${normalizedEmail}`);
	} catch (error) {
		console.error("[LoginSecurity] Erro ao registrar login bem-sucedido:", error);
	}
}

/**
 * Desbloqueia manualmente uma conta (para uso administrativo)
 */
export async function unlockAccount(email: string): Promise<boolean> {
	try {
		const redis = getRedisInstance();
		const normalizedEmail = email.toLowerCase();

		await redis.del(KEYS.accountLockout(normalizedEmail));
		await redis.del(KEYS.accountAttempts(normalizedEmail));

		console.info(`[LoginSecurity] Conta desbloqueada manualmente: ${normalizedEmail}`);
		return true;
	} catch (error) {
		console.error("[LoginSecurity] Erro ao desbloquear conta:", error);
		return false;
	}
}

/**
 * Obtém status de segurança de uma conta (para debug/admin)
 */
export async function getAccountSecurityStatus(email: string): Promise<{
	isLocked: boolean;
	failedAttempts: number;
	lockoutRemainingSeconds?: number;
}> {
	try {
		const redis = getRedisInstance();
		const normalizedEmail = email.toLowerCase();

		const [isLocked, lockoutTtl, attempts] = await Promise.all([
			redis.get(KEYS.accountLockout(normalizedEmail)),
			redis.ttl(KEYS.accountLockout(normalizedEmail)),
			redis.get(KEYS.accountAttempts(normalizedEmail)),
		]);

		return {
			isLocked: !!isLocked,
			failedAttempts: attempts ? parseInt(attempts, 10) : 0,
			lockoutRemainingSeconds: isLocked && lockoutTtl > 0 ? lockoutTtl : undefined,
		};
	} catch (error) {
		console.error("[LoginSecurity] Erro ao obter status:", error);
		return {
			isLocked: false,
			failedAttempts: 0,
		};
	}
}

/**
 * Aplica delay progressivo (para ser usado após tentativa falha)
 */
export function applyProgressiveDelay(delayMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}
