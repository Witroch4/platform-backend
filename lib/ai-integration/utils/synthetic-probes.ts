/**
 * Synthetic Probes for End-to-End Testing
 * Based on requirements 11.2
 */

import { aiLogger } from "./logger";
import { aiMetrics } from "./metrics";

export interface SyntheticProbeConfig {
	enabled: boolean;
	intervalMinutes: number;
	businessHoursOnly: boolean;
	businessHours: {
		start: number; // Hour in 24h format (e.g., 9 for 9 AM)
		end: number; // Hour in 24h format (e.g., 18 for 6 PM)
		timezone: string; // e.g., 'America/Sao_Paulo'
	};
	probes: {
		webhook: boolean;
		endToEnd: boolean;
		chatwit: boolean;
	};
	timeout: number; // Timeout in milliseconds
	alertThreshold: number; // Latency threshold for alerts (ms)
}

export interface ProbeResult {
	name: string;
	success: boolean;
	latency: number;
	timestamp: number;
	error?: string;
	details?: Record<string, any>;
}

export interface SyntheticProbeReport {
	timestamp: number;
	results: ProbeResult[];
	overallSuccess: boolean;
	averageLatency: number;
	failedProbes: string[];
}

export class SyntheticProbeService {
	private config: SyntheticProbeConfig;
	private intervalId: NodeJS.Timeout | null = null;
	private running = false;

	constructor(config: Partial<SyntheticProbeConfig> = {}) {
		this.config = {
			enabled: config.enabled ?? process.env.SYNTHETIC_PROBES_ENABLED === "true",
			intervalMinutes: config.intervalMinutes ?? parseInt(process.env.SYNTHETIC_PROBE_INTERVAL || "5"),
			businessHoursOnly: config.businessHoursOnly ?? process.env.SYNTHETIC_BUSINESS_HOURS_ONLY === "true",
			businessHours: config.businessHours ?? {
				start: parseInt(process.env.SYNTHETIC_BUSINESS_START || "9"),
				end: parseInt(process.env.SYNTHETIC_BUSINESS_END || "18"),
				timezone: process.env.SYNTHETIC_BUSINESS_TIMEZONE || "America/Sao_Paulo",
			},
			probes: config.probes ?? {
				webhook: true,
				endToEnd: true,
				chatwit: true,
			},
			timeout: config.timeout ?? parseInt(process.env.SYNTHETIC_PROBE_TIMEOUT || "30000"),
			alertThreshold: config.alertThreshold ?? parseInt(process.env.SYNTHETIC_ALERT_THRESHOLD || "5000"),
		};
	}

	// Check if current time is within business hours
	private isBusinessHours(): boolean {
		if (!this.config.businessHoursOnly) return true;

		const now = new Date();
		const hour = now.getHours(); // This uses local time, ideally should use timezone

		return hour >= this.config.businessHours.start && hour < this.config.businessHours.end;
	}

	// Probe webhook endpoint health
	private async probeWebhook(): Promise<ProbeResult> {
		const startTime = Date.now();
		const probeName = "webhook_health";

		try {
			const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/health`;

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

			const response = await fetch(webhookUrl, {
				method: "GET",
				headers: {
					"User-Agent": "SyntheticProbe/1.0",
				},
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			const latency = Date.now() - startTime;
			const success = response.ok;

			let details: Record<string, any> = {
				status: response.status,
				statusText: response.statusText,
			};

			if (success) {
				try {
					const healthData = await response.json();
					details.healthData = healthData;
				} catch {
					// Ignore JSON parsing errors for health check
				}
			}

			return {
				name: probeName,
				success,
				latency,
				timestamp: Date.now(),
				details,
				error: success ? undefined : `HTTP ${response.status}: ${response.statusText}`,
			};
		} catch (error) {
			const latency = Date.now() - startTime;

			return {
				name: probeName,
				success: false,
				latency,
				timestamp: Date.now(),
				error: error instanceof Error ? error.message : "Unknown error",
				details: {
					errorType: error instanceof Error ? error.constructor.name : "Unknown",
				},
			};
		}
	}

	// Probe Chatwit API connectivity
	private async probeChatwit(): Promise<ProbeResult> {
		const startTime = Date.now();
		const probeName = "chatwit_api";

		try {
			const chatwitUrl = process.env.CHATWIT_BASE_URL;
			const chatwitToken = process.env.CHATWIT_ACCESS_TOKEN;

			if (!chatwitUrl || !chatwitToken) {
				return {
					name: probeName,
					success: false,
					latency: Date.now() - startTime,
					timestamp: Date.now(),
					error: "Chatwit configuration missing",
					details: {
						hasUrl: !!chatwitUrl,
						hasToken: !!chatwitToken,
					},
				};
			}

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

			// Simple API call to check connectivity (e.g., get account info)
			const response = await fetch(`${chatwitUrl}/api/v1/accounts`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${chatwitToken}`,
					"Content-Type": "application/json",
					"User-Agent": "SyntheticProbe/1.0",
				},
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			const latency = Date.now() - startTime;
			const success = response.ok;

			return {
				name: probeName,
				success,
				latency,
				timestamp: Date.now(),
				details: {
					status: response.status,
					statusText: response.statusText,
				},
				error: success ? undefined : `HTTP ${response.status}: ${response.statusText}`,
			};
		} catch (error) {
			const latency = Date.now() - startTime;

			return {
				name: probeName,
				success: false,
				latency,
				timestamp: Date.now(),
				error: error instanceof Error ? error.message : "Unknown error",
				details: {
					errorType: error instanceof Error ? error.constructor.name : "Unknown",
				},
			};
		}
	}

	// End-to-end probe simulating a complete flow
	private async probeEndToEnd(): Promise<ProbeResult> {
		const startTime = Date.now();
		const probeName = "end_to_end";

		try {
			// This would simulate a complete webhook -> AI processing -> Chatwit response flow
			// For now, we'll do a simplified version that tests the webhook endpoint with a synthetic payload

			const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/chatwit/webhook`;
			const webhookSecret = process.env.CHATWIT_WEBHOOK_SECRET;

			if (!webhookSecret) {
				return {
					name: probeName,
					success: false,
					latency: Date.now() - startTime,
					timestamp: Date.now(),
					error: "Webhook secret not configured",
				};
			}

			// Create synthetic webhook payload
			const syntheticPayload = {
				account_id: 999999, // Use a special account ID for synthetic tests
				channel: "whatsapp",
				conversation: {
					id: 999999,
					inbox_id: 999999,
					status: "open",
				},
				message: {
					id: Date.now(),
					message_type: "incoming",
					content_type: "text",
					content: "Synthetic probe test message",
					created_at: Math.floor(Date.now() / 1000),
					source_id: `synthetic_${Date.now()}`,
					sender: {
						type: "contact",
						id: 999999,
						name: "Synthetic Probe",
					},
				},
			};

			// Generate HMAC signature
			const crypto = require("crypto");
			const timestamp = Math.floor(Date.now() / 1000);
			const rawBody = JSON.stringify(syntheticPayload);
			const base = `${timestamp}.${rawBody}`;
			const signature = crypto.createHmac("sha256", webhookSecret).update(base).digest("hex");

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Chatwit-Signature": signature,
					"X-Chatwit-Timestamp": timestamp.toString(),
					"User-Agent": "SyntheticProbe/1.0",
				},
				body: rawBody,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			const latency = Date.now() - startTime;
			const success = response.ok;

			let responseData: any;
			try {
				responseData = await response.json();
			} catch {
				responseData = null;
			}

			return {
				name: probeName,
				success,
				latency,
				timestamp: Date.now(),
				details: {
					status: response.status,
					statusText: response.statusText,
					responseData,
					payloadSize: rawBody.length,
				},
				error: success ? undefined : `HTTP ${response.status}: ${response.statusText}`,
			};
		} catch (error) {
			const latency = Date.now() - startTime;

			return {
				name: probeName,
				success: false,
				latency,
				timestamp: Date.now(),
				error: error instanceof Error ? error.message : "Unknown error",
				details: {
					errorType: error instanceof Error ? error.constructor.name : "Unknown",
				},
			};
		}
	}

	// Run all enabled probes
	private async runProbes(): Promise<SyntheticProbeReport> {
		const startTime = Date.now();

		try {
			aiLogger.info("Starting synthetic probe cycle", {
				stage: "admin",
				metadata: {
					businessHours: this.isBusinessHours(),
					enabledProbes: Object.entries(this.config.probes)
						.filter(([, enabled]) => enabled)
						.map(([name]) => name),
				},
			});

			const probePromises: Promise<ProbeResult>[] = [];

			if (this.config.probes.webhook) {
				probePromises.push(this.probeWebhook());
			}

			if (this.config.probes.chatwit) {
				probePromises.push(this.probeChatwit());
			}

			if (this.config.probes.endToEnd) {
				probePromises.push(this.probeEndToEnd());
			}

			const results = await Promise.all(probePromises);

			const overallSuccess = results.every((result) => result.success);
			const averageLatency = results.reduce((sum, result) => sum + result.latency, 0) / results.length;
			const failedProbes = results.filter((result) => !result.success).map((result) => result.name);

			// Record metrics
			results.forEach((result) => {
				aiMetrics.incrementJobsTotal("synthetic_probe", result.success ? "success" : "error", {
					probe: result.name,
				});
				aiMetrics.recordJobLatency("synthetic_probe", result.latency, {
					probe: result.name,
				});

				// Alert on high latency
				if (result.success && result.latency > this.config.alertThreshold) {
					aiLogger.warn("Synthetic probe high latency", {
						stage: "admin",
						metadata: {
							probe: result.name,
							latency: result.latency,
							threshold: this.config.alertThreshold,
						},
					});
				}

				// Alert on failures
				if (!result.success) {
					aiLogger.error("Synthetic probe failed", {
						stage: "admin",
						error: result.error,
						metadata: {
							probe: result.name,
							latency: result.latency,
							details: result.details,
						},
					});
				}
			});

			const report: SyntheticProbeReport = {
				timestamp: Date.now(),
				results,
				overallSuccess,
				averageLatency,
				failedProbes,
			};

			const duration = Date.now() - startTime;

			aiLogger.info("Synthetic probe cycle completed", {
				stage: "admin",
				duration,
				metadata: {
					overallSuccess,
					averageLatency,
					failedProbesCount: failedProbes.length,
					probesRun: results.length,
				},
			});

			return report;
		} catch (error) {
			const duration = Date.now() - startTime;

			aiLogger.errorWithStack("Synthetic probe cycle failed", error as Error, {
				stage: "admin",
				duration,
			});

			throw error;
		}
	}

	// Start periodic synthetic probes
	start(): void {
		if (!this.config.enabled) {
			aiLogger.info("Synthetic probes are disabled", {
				stage: "admin",
				metadata: { enabled: this.config.enabled },
			});
			return;
		}

		if (this.running) {
			aiLogger.warn("Synthetic probes are already running", {
				stage: "admin",
			});
			return;
		}

		this.running = true;

		aiLogger.info("Starting synthetic probes", {
			stage: "admin",
			metadata: {
				intervalMinutes: this.config.intervalMinutes,
				businessHoursOnly: this.config.businessHoursOnly,
				enabledProbes: this.config.probes,
			},
		});

		// Run immediately if in business hours
		if (this.isBusinessHours()) {
			this.runProbes().catch((error) => {
				aiLogger.errorWithStack("Initial synthetic probe run failed", error, {
					stage: "admin",
				});
			});
		}

		// Schedule periodic runs
		this.intervalId = setInterval(
			async () => {
				if (this.isBusinessHours()) {
					try {
						await this.runProbes();
					} catch (error) {
						aiLogger.errorWithStack("Scheduled synthetic probe run failed", error as Error, {
							stage: "admin",
						});
					}
				} else {
					aiLogger.debug("Skipping synthetic probes outside business hours", {
						stage: "admin",
					});
				}
			},
			this.config.intervalMinutes * 60 * 1000,
		);
	}

	// Stop periodic probes
	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}

		this.running = false;

		aiLogger.info("Synthetic probes stopped", {
			stage: "admin",
		});
	}

	// Force run probes immediately
	async forceRun(): Promise<SyntheticProbeReport> {
		aiLogger.info("Force running synthetic probes", {
			stage: "admin",
		});

		return await this.runProbes();
	}

	// Get current status
	getStatus(): {
		running: boolean;
		config: SyntheticProbeConfig;
		nextRun?: Date;
		businessHours: boolean;
	} {
		return {
			running: this.running,
			config: this.config,
			nextRun: this.intervalId ? new Date(Date.now() + this.config.intervalMinutes * 60 * 1000) : undefined,
			businessHours: this.isBusinessHours(),
		};
	}

	// Update configuration
	updateConfig(newConfig: Partial<SyntheticProbeConfig>): void {
		const wasRunning = this.running;

		if (wasRunning) {
			this.stop();
		}

		this.config = { ...this.config, ...newConfig };

		if (wasRunning && this.config.enabled) {
			this.start();
		}

		aiLogger.info("Synthetic probe configuration updated", {
			stage: "admin",
			metadata: {
				newConfig,
				restarted: wasRunning && this.config.enabled,
			},
		});
	}
}

// Global synthetic probe service
export const syntheticProbeService = new SyntheticProbeService();

// Auto-start if enabled
if (process.env.NODE_ENV !== "test") {
	syntheticProbeService.start();
}

export default SyntheticProbeService;
