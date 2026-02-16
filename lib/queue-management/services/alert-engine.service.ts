/**
 * Alert Engine Service
 *
 * Core service for managing alert rules, evaluating conditions, and processing alerts
 */

import { getPrismaInstance } from "@/lib/connections";
import { getRedisInstance } from "../../connections";
import logger from "../../log";
import {
	AlertRule,
	AlertRuleCreateInput,
	AlertRuleUpdateInput,
	Alert,
	AlertEvaluation,
	AlertCondition,
	AlertAcknowledgeInput,
	AlertResolveInput,
	AlertQueryFilters,
	AlertRuleQueryFilters,
	AlertEngineConfig,
	NotificationChannel,
	AlertSeverity,
	AlertStatus,
} from "../types/alert.types";
import {
	AlertRuleNotFoundError,
	AlertNotFoundError,
	AlertAlreadyAcknowledgedError,
	ValidationError,
	QueueManagementError,
} from "../errors";
import { CACHE_KEYS, DEFAULTS, ERROR_CODES } from "../constants";
import { MetricsCollectorService } from "./metrics-collector.service";
import { NotificationService } from "./notification.service";
import { AnomalyDetectorService } from "./anomaly-detector.service";

export class AlertEngineService {
	private metricsCollector: MetricsCollectorService;
	private notificationService: NotificationService;
	private anomalyDetector: AnomalyDetectorService;
	private config: AlertEngineConfig;
	private evaluationTimer?: NodeJS.Timeout;
	private cooldownCache = new Map<string, Date>();

	constructor(
		metricsCollector: MetricsCollectorService,
		notificationService: NotificationService,
		anomalyDetector: AnomalyDetectorService,
		config: Partial<AlertEngineConfig> = {},
	) {
		this.metricsCollector = metricsCollector;
		this.notificationService = notificationService;
		this.anomalyDetector = anomalyDetector;
		this.config = {
			evaluationInterval: config.evaluationInterval || 30, // 30 seconds
			maxConcurrentEvaluations: config.maxConcurrentEvaluations || 10,
			defaultCooldown: config.defaultCooldown || 5, // 5 minutes
			escalationEnabled: config.escalationEnabled ?? true,
			anomalyDetectionEnabled: config.anomalyDetectionEnabled ?? true,
		};
	}

	/**
	 * Start the alert engine
	 */
	async start(): Promise<void> {
		logger.info("Starting Alert Engine Service");

		// Start periodic rule evaluation
		this.evaluationTimer = setInterval(() => this.evaluateAllRules(), this.config.evaluationInterval * 1000);

		// Set up anomaly detection event listeners
		if (this.config.anomalyDetectionEnabled) {
			this.anomalyDetector.on("anomalies_detected", async (anomalies) => {
				logger.info("Anomalies detected by ML system", { count: anomalies.length });
				await this.createPredictiveAlerts(anomalies);
			});

			// Train anomaly detection models on startup
			this.trainAnomalyDetection().catch((error) => {
				logger.warn("Failed to train anomaly detection on startup", { error });
			});
		}

		logger.info(`Alert engine started with ${this.config.evaluationInterval}s evaluation interval`);
	}

	/**
	 * Stop the alert engine
	 */
	async stop(): Promise<void> {
		logger.info("Stopping Alert Engine Service");

		if (this.evaluationTimer) {
			clearInterval(this.evaluationTimer);
			this.evaluationTimer = undefined;
		}

		logger.info("Alert engine stopped");
	}

	/**
	 * Create a new alert rule
	 */
	async createAlertRule(input: AlertRuleCreateInput, createdBy: string): Promise<AlertRule> {
		try {
			// Validate input
			this.validateAlertRuleInput(input);

			const rule = await getPrismaInstance().alertRule.create({
				data: {
					name: input.name,
					description: input.description,
					queueName: input.queueName,
					condition: input.condition as any,
					severity: input.severity,
					channels: input.channels as any,
					cooldown: input.cooldown || this.config.defaultCooldown,
					enabled: input.enabled ?? true,
					createdBy,
				},
			});

			// Clear cache
			await this.clearRulesCache();

			logger.info(`Alert rule created: ${rule.id} (${rule.name})`, {
				ruleId: rule.id,
				queueName: rule.queueName,
				severity: rule.severity,
				createdBy,
			});

			return this.mapAlertRuleFromDb(rule);
		} catch (error) {
			logger.error("Failed to create alert rule", { error, input, createdBy });
			throw error instanceof QueueManagementError
				? error
				: new QueueManagementError("Failed to create alert rule", ERROR_CODES.INTERNAL_ERROR, 500, {
						originalError: error,
					});
		}
	}

	/**
	 * Update an existing alert rule
	 */
	async updateAlertRule(ruleId: string, input: AlertRuleUpdateInput): Promise<AlertRule> {
		try {
			// Check if rule exists
			const existingRule = await getPrismaInstance().alertRule.findUnique({
				where: { id: ruleId },
			});

			if (!existingRule) {
				throw new AlertRuleNotFoundError(ruleId);
			}

			// Validate input
			if (input.condition) {
				this.validateAlertCondition(input.condition);
			}

			const rule = await getPrismaInstance().alertRule.update({
				where: { id: ruleId },
				data: {
					...(input.name && { name: input.name }),
					...(input.description !== undefined && { description: input.description }),
					...(input.condition && { condition: input.condition as any }),
					...(input.severity && { severity: input.severity }),
					...(input.channels && { channels: input.channels as any }),
					...(input.cooldown !== undefined && { cooldown: input.cooldown }),
					...(input.enabled !== undefined && { enabled: input.enabled }),
					updatedAt: new Date(),
				},
			});

			// Clear cache
			await this.clearRulesCache();

			logger.info(`Alert rule updated: ${rule.id} (${rule.name})`, {
				ruleId: rule.id,
				changes: input,
			});

			return this.mapAlertRuleFromDb(rule);
		} catch (error) {
			logger.error("Failed to update alert rule", { error, ruleId, input });
			throw error instanceof QueueManagementError
				? error
				: new QueueManagementError("Failed to update alert rule", ERROR_CODES.INTERNAL_ERROR, 500, {
						originalError: error,
					});
		}
	}

	/**
	 * Delete an alert rule
	 */
	async deleteAlertRule(ruleId: string): Promise<boolean> {
		try {
			const rule = await getPrismaInstance().alertRule.findUnique({
				where: { id: ruleId },
			});

			if (!rule) {
				throw new AlertRuleNotFoundError(ruleId);
			}

			// Delete the rule (alerts will be cascade deleted if configured)
			await getPrismaInstance().alertRule.delete({
				where: { id: ruleId },
			});

			// Clear cache
			await this.clearRulesCache();
			await this.clearCooldown(ruleId);

			logger.info(`Alert rule deleted: ${ruleId} (${rule.name})`, {
				ruleId,
				ruleName: rule.name,
			});

			return true;
		} catch (error) {
			logger.error("Failed to delete alert rule", { error, ruleId });
			throw error instanceof QueueManagementError
				? error
				: new QueueManagementError("Failed to delete alert rule", ERROR_CODES.INTERNAL_ERROR, 500, {
						originalError: error,
					});
		}
	}

	/**
	 * Get alert rule by ID
	 */
	async getAlertRule(ruleId: string): Promise<AlertRule | null> {
		try {
			const rule = await getPrismaInstance().alertRule.findUnique({
				where: { id: ruleId },
			});

			return rule ? this.mapAlertRuleFromDb(rule) : null;
		} catch (error) {
			logger.error("Failed to get alert rule", { error, ruleId });
			throw new QueueManagementError("Failed to get alert rule", ERROR_CODES.INTERNAL_ERROR, 500, {
				originalError: error,
			});
		}
	}

	/**
	 * List alert rules with filters
	 */
	async listAlertRules(filters: AlertRuleQueryFilters = {}): Promise<AlertRule[]> {
		try {
			const rules = await getPrismaInstance().alertRule.findMany({
				where: {
					...(filters.queueName && { queueName: filters.queueName }),
					...(filters.severity && { severity: { in: filters.severity } }),
					...(filters.enabled !== undefined && { enabled: filters.enabled }),
					...(filters.createdBy && { createdBy: filters.createdBy }),
				},
				orderBy: [{ enabled: "desc" }, { severity: "desc" }, { createdAt: "desc" }],
			});

			return rules.map((rule: any) => this.mapAlertRuleFromDb(rule));
		} catch (error) {
			logger.error("Failed to list alert rules", { error, filters });
			throw new QueueManagementError("Failed to list alert rules", ERROR_CODES.INTERNAL_ERROR, 500, {
				originalError: error,
			});
		}
	}

	/**
	 * Evaluate all active alert rules
	 */
	async evaluateAllRules(): Promise<AlertEvaluation[]> {
		try {
			const rules = await this.getActiveRules();
			const evaluations: AlertEvaluation[] = [];

			// Process rules in batches to avoid overwhelming the system
			const batchSize = this.config.maxConcurrentEvaluations;
			for (let i = 0; i < rules.length; i += batchSize) {
				const batch = rules.slice(i, i + batchSize);
				const batchEvaluations = await Promise.all(batch.map((rule) => this.evaluateRule(rule)));
				evaluations.push(...batchEvaluations);
			}

			// Process triggered alerts
			const triggeredEvaluations = evaluations.filter((evaluation) => evaluation.triggered);
			for (const evaluation of triggeredEvaluations) {
				await this.processTriggeredAlert(evaluation);
			}

			return evaluations;
		} catch (error) {
			logger.error("Failed to evaluate alert rules", { error });
			return [];
		}
	}

	/**
	 * Evaluate a single alert rule
	 */
	async evaluateRule(rule: AlertRule): Promise<AlertEvaluation> {
		try {
			// Check cooldown
			if (this.isInCooldown(rule.id!)) {
				return {
					ruleId: rule.id!,
					triggered: false,
					currentValue: 0,
					threshold: rule.condition.threshold,
					metrics: {},
					timestamp: new Date(),
				};
			}

			// Get current metrics
			const metrics = await this.getMetricsForRule(rule);
			const currentValue = this.extractMetricValue(metrics, rule.condition.metric);

			// Evaluate condition
			const triggered = this.evaluateCondition(rule.condition, currentValue, metrics);

			return {
				ruleId: rule.id!,
				triggered,
				currentValue,
				threshold: rule.condition.threshold,
				metrics,
				timestamp: new Date(),
			};
		} catch (error) {
			logger.error("Failed to evaluate rule", { error, ruleId: rule.id });
			return {
				ruleId: rule.id!,
				triggered: false,
				currentValue: 0,
				threshold: rule.condition.threshold,
				metrics: {},
				timestamp: new Date(),
			};
		}
	}

	/**
	 * Process a triggered alert
	 */
	async processTriggeredAlert(evaluation: AlertEvaluation): Promise<Alert> {
		try {
			const rule = await this.getAlertRule(evaluation.ruleId);
			if (!rule) {
				throw new AlertRuleNotFoundError(evaluation.ruleId);
			}

			// Create alert
			const alert = await this.createAlert(rule, evaluation);

			// Set cooldown
			this.setCooldown(rule.id!, rule.cooldown);

			// Send notifications (async, don't wait)
			this.sendNotifications(alert, rule.channels).catch((error) => {
				logger.error("Failed to send alert notifications", { error, alertId: alert.id });
			});

			logger.info(`Alert triggered: ${alert.id} (${alert.title})`, {
				alertId: alert.id,
				ruleId: rule.id,
				severity: alert.severity,
				queueName: alert.queueName,
			});

			return alert;
		} catch (error) {
			logger.error("Failed to process triggered alert", { error, evaluation });
			throw error;
		}
	}

	/**
	 * Acknowledge an alert
	 */
	async acknowledgeAlert(alertId: string, input: AlertAcknowledgeInput): Promise<Alert> {
		try {
			const existingAlert = await getPrismaInstance().alert.findUnique({
				where: { id: alertId },
			});

			if (!existingAlert) {
				throw new AlertNotFoundError(alertId);
			}

			if (existingAlert.status === "acknowledged") {
				throw new AlertAlreadyAcknowledgedError(alertId, existingAlert.acknowledgedBy || "unknown");
			}

			const alert = await getPrismaInstance().alert.update({
				where: { id: alertId },
				data: {
					status: "acknowledged",
					acknowledgedAt: new Date(),
					acknowledgedBy: input.acknowledgedBy,
					...(input.note && { resolutionNote: input.note }),
				},
			});

			// Cancel escalation when alert is acknowledged
			this.notificationService.cancelEscalation(alertId);

			logger.info(`Alert acknowledged: ${alertId}`, {
				alertId,
				acknowledgedBy: input.acknowledgedBy,
			});

			return this.mapAlertFromDb(alert);
		} catch (error) {
			logger.error("Failed to acknowledge alert", { error, alertId, input });
			throw error instanceof QueueManagementError
				? error
				: new QueueManagementError("Failed to acknowledge alert", ERROR_CODES.INTERNAL_ERROR, 500, {
						originalError: error,
					});
		}
	}

	/**
	 * Resolve an alert
	 */
	async resolveAlert(alertId: string, input: AlertResolveInput): Promise<Alert> {
		try {
			const existingAlert = await getPrismaInstance().alert.findUnique({
				where: { id: alertId },
			});

			if (!existingAlert) {
				throw new AlertNotFoundError(alertId);
			}

			const alert = await getPrismaInstance().alert.update({
				where: { id: alertId },
				data: {
					status: "resolved",
					resolvedAt: new Date(),
					resolutionNote: input.resolutionNote,
					...(existingAlert.status === "active" && {
						acknowledgedAt: new Date(),
						acknowledgedBy: input.resolvedBy,
					}),
				},
			});

			// Cancel escalation when alert is resolved
			this.notificationService.cancelEscalation(alertId);

			logger.info(`Alert resolved: ${alertId}`, {
				alertId,
				resolvedBy: input.resolvedBy,
			});

			return this.mapAlertFromDb(alert);
		} catch (error) {
			logger.error("Failed to resolve alert", { error, alertId, input });
			throw error instanceof QueueManagementError
				? error
				: new QueueManagementError("Failed to resolve alert", ERROR_CODES.INTERNAL_ERROR, 500, {
						originalError: error,
					});
		}
	}

	/**
	 * Escalate an alert to higher priority channels
	 */
	async escalateAlert(alertId: string): Promise<void> {
		try {
			const alert = await getPrismaInstance().alert.findUnique({
				where: { id: alertId },
			});

			if (!alert) {
				throw new AlertNotFoundError(alertId);
			}

			// Only escalate active alerts
			if (alert.status !== "active") {
				logger.warn("Cannot escalate non-active alert", { alertId, status: alert.status });
				return;
			}

			await this.notificationService.escalateAlert(this.mapAlertFromDb(alert));

			logger.info(`Alert escalated: ${alertId}`, { alertId });
		} catch (error) {
			logger.error("Failed to escalate alert", { error, alertId });
			throw error instanceof QueueManagementError
				? error
				: new QueueManagementError("Failed to escalate alert", ERROR_CODES.INTERNAL_ERROR, 500, {
						originalError: error,
					});
		}
	}

	/**
	 * Train anomaly detection models with historical data
	 */
	async trainAnomalyDetection(queueName?: string): Promise<void> {
		try {
			logger.info("Training anomaly detection models", { queueName });

			// Get historical metrics for training
			const endTime = new Date();
			const startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days

			let metrics;
			if (queueName) {
				metrics = await this.metricsCollector.collectQueueMetrics(queueName);
			} else {
				metrics = await this.metricsCollector.collectSystemMetrics();
			}

			// Convert metrics to the format expected by anomaly detector
			const trainingData = this.convertMetricsForAnomalyDetection(metrics, queueName);

			// Train the anomaly detection model
			await this.anomalyDetector.train(trainingData);

			logger.info("Anomaly detection training completed", {
				queueName,
				dataPoints: trainingData.length,
			});
		} catch (error) {
			logger.error("Failed to train anomaly detection", { error, queueName });
			throw error instanceof QueueManagementError
				? error
				: new QueueManagementError("Failed to train anomaly detection", ERROR_CODES.INTERNAL_ERROR, 500, {
						originalError: error,
					});
		}
	}

	/**
	 * Detect anomalies in current metrics
	 */
	async detectAnomalies(queueName?: string): Promise<any[]> {
		try {
			logger.info("Detecting anomalies", { queueName });

			// Get recent metrics
			let metrics;
			if (queueName) {
				metrics = await this.metricsCollector.collectQueueMetrics(queueName);
			} else {
				metrics = await this.metricsCollector.collectSystemMetrics();
			}

			// Convert metrics for anomaly detection
			const detectionData = this.convertMetricsForAnomalyDetection(metrics, queueName);

			// Detect anomalies
			const anomalies = await this.anomalyDetector.detect(detectionData);

			// Create predictive alerts for detected anomalies
			await this.createPredictiveAlertsFromAnomalies(anomalies);

			logger.info("Anomaly detection completed", {
				queueName,
				anomaliesFound: anomalies.length,
			});

			return anomalies;
		} catch (error) {
			logger.error("Failed to detect anomalies", { error, queueName });
			throw error instanceof QueueManagementError
				? error
				: new QueueManagementError("Failed to detect anomalies", ERROR_CODES.INTERNAL_ERROR, 500, {
						originalError: error,
					});
		}
	}

	/**
	 * Create predictive alerts based on trend analysis
	 */
	async createPredictiveAlerts(queueName: string, horizon: number = 24): Promise<Alert[]> {
		try {
			logger.info("Creating predictive alerts", { queueName, horizon });

			// Get historical metrics for trend analysis
			const metrics = await this.metricsCollector.collectQueueMetrics(queueName);
			const detectionData = this.convertMetricsForAnomalyDetection(metrics, queueName);

			// Analyze trends and forecast
			const trendPrediction = await this.anomalyDetector.forecast(detectionData, horizon);

			const predictiveAlerts: Alert[] = [];

			// Check if predicted values exceed thresholds
			for (const prediction of trendPrediction.predictions) {
				if (prediction.confidence > 0.7) {
					// Only create alerts for high-confidence predictions
					const severity = this.determinePredictiveSeverity(prediction.predictedValue, queueName);

					if (severity !== "info") {
						const alert = await this.createPredictiveAlert(queueName, trendPrediction.metric, prediction, severity);
						predictiveAlerts.push(alert);
					}
				}
			}

			logger.info("Predictive alerts created", {
				queueName,
				alertsCreated: predictiveAlerts.length,
			});

			return predictiveAlerts;
		} catch (error) {
			logger.error("Failed to create predictive alerts", { error, queueName });
			throw error instanceof QueueManagementError
				? error
				: new QueueManagementError("Failed to create predictive alerts", ERROR_CODES.INTERNAL_ERROR, 500, {
						originalError: error,
					});
		}
	}

	/**
	 * List alerts with filters
	 */
	async listAlerts(filters: AlertQueryFilters = {}): Promise<Alert[]> {
		try {
			const alerts = await getPrismaInstance().alert.findMany({
				where: {
					...(filters.ruleId && { ruleId: filters.ruleId }),
					...(filters.queueName && { queueName: filters.queueName }),
					...(filters.severity && { severity: { in: filters.severity } }),
					...(filters.status && { status: { in: filters.status } }),
					...(filters.createdAfter && { createdAt: { gte: filters.createdAfter } }),
					...(filters.createdBefore && { createdAt: { lte: filters.createdBefore } }),
					...(filters.acknowledgedBy && { acknowledgedBy: filters.acknowledgedBy }),
				},
				orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
			});

			return alerts.map((alert: any) => this.mapAlertFromDb(alert));
		} catch (error) {
			logger.error("Failed to list alerts", { error, filters });
			throw new QueueManagementError("Failed to list alerts", ERROR_CODES.INTERNAL_ERROR, 500, {
				originalError: error,
			});
		}
	}

	// Private helper methods

	private convertMetricsForAnomalyDetection(metrics: any, queueName?: string): any[] {
		// Convert metrics to the format expected by the anomaly detector
		const converted: any[] = [];

		if (Array.isArray(metrics)) {
			// If metrics is already an array, use it directly
			return metrics;
		}

		// Convert object metrics to array format
		const timestamp = new Date();

		if (metrics.throughput) {
			converted.push({
				name: "throughput",
				type: "gauge",
				value: metrics.throughput.jobsPerMinute || 0,
				timestamp,
				labels: { queueName: queueName || "system", type: "queue" },
			});
		}

		if (metrics.latency) {
			converted.push({
				name: "processing_time",
				type: "gauge",
				value: metrics.latency.p95 || 0,
				timestamp,
				labels: { queueName: queueName || "system", type: "queue" },
			});
		}

		if (metrics.reliability) {
			converted.push({
				name: "error_rate",
				type: "gauge",
				value: metrics.reliability.errorRate || 0,
				timestamp,
				labels: { queueName: queueName || "system", type: "queue" },
			});
		}

		return converted;
	}

	private async createPredictiveAlertsFromAnomalies(anomalies: any[]): Promise<void> {
		for (const anomaly of anomalies) {
			try {
				// Create a predictive alert rule if one doesn't exist
				const ruleName = `Predictive Alert: ${anomaly.queueName} ${anomaly.metric}`;

				// Check if a similar rule already exists
				const existingRules = await this.listAlertRules({
					queueName: anomaly.queueName,
				});

				const existingRule = existingRules.find(
					(rule) => rule.name.includes("Predictive") && rule.name.includes(anomaly.metric),
				);

				if (!existingRule) {
					// Create a new predictive alert rule
					const rule = await this.createAlertRule(
						{
							name: ruleName,
							description: `Automatically generated predictive alert for ${anomaly.metric} anomalies`,
							queueName: anomaly.queueName,
							condition: {
								metric: anomaly.metric,
								operator: ">",
								threshold: anomaly.expectedValue * 1.2, // 20% above expected
								timeWindow: 5,
							},
							severity: anomaly.severity as AlertSeverity,
							channels: this.getDefaultNotificationChannels(),
							cooldown: 15, // 15 minutes cooldown for predictive alerts
						},
						"system",
					);

					logger.info("Created predictive alert rule", {
						ruleId: rule.id,
						anomalyId: anomaly.id,
					});
				}

				// Create an immediate alert for the detected anomaly
				const alert = await getPrismaInstance().alert.create({
					data: {
						ruleId: existingRule?.id || "predictive",
						queueName: anomaly.queueName,
						severity: anomaly.severity as AlertSeverity,
						title: `Anomaly Detected: ${anomaly.queueName} ${anomaly.metric}`,
						message: anomaly.description,
						metrics: {
							anomalyId: anomaly.id,
							value: anomaly.value,
							expectedValue: anomaly.expectedValue,
							deviation: anomaly.deviation,
						} as any,
						status: "active",
					},
				});

				// Send notifications
				if (existingRule) {
					await this.sendNotifications(this.mapAlertFromDb(alert), existingRule.channels);
				}
			} catch (error) {
				logger.error("Failed to create predictive alert", { error, anomaly });
			}
		}
	}

	private async createPredictiveAlert(
		queueName: string,
		metric: string,
		prediction: any,
		severity: AlertSeverity,
	): Promise<Alert> {
		const alert = await getPrismaInstance().alert.create({
			data: {
				ruleId: "predictive",
				queueName,
				severity,
				title: `Predictive Alert: ${queueName} ${metric}`,
				message: `Predicted value ${prediction.predictedValue.toFixed(2)} at ${prediction.timestamp.toISOString()} (confidence: ${(prediction.confidence * 100).toFixed(1)}%)`,
				metrics: {
					predictedValue: prediction.predictedValue,
					confidence: prediction.confidence,
					timestamp: prediction.timestamp,
					metric,
				} as any,
				status: "active",
			},
		});

		return this.mapAlertFromDb(alert);
	}

	private determinePredictiveSeverity(predictedValue: number, queueName: string): AlertSeverity {
		// Simple threshold-based severity determination
		// In a real implementation, this would use learned baselines

		if (predictedValue > 1000) return "critical";
		if (predictedValue > 500) return "error";
		if (predictedValue > 100) return "warning";
		return "info";
	}

	private getDefaultNotificationChannels(): NotificationChannel[] {
		return [
			{
				type: "slack",
				config: {
					webhookUrl: process.env.SLACK_WEBHOOK_URL || "",
					channel: "#alerts",
				},
				enabled: !!process.env.SLACK_WEBHOOK_URL,
			},
		];
	}

	private async getActiveRules(): Promise<AlertRule[]> {
		const cacheKey = CACHE_KEYS.ACTIVE_ALERTS();

		try {
			const cached = await getRedisInstance().get(cacheKey);
			if (cached) {
				return JSON.parse(cached);
			}
		} catch (error) {
			logger.warn("Failed to get rules from cache", { error });
		}

		const rules = await this.listAlertRules({ enabled: true });

		try {
			await getRedisInstance().setex(cacheKey, DEFAULTS.CACHE_TTL.ALERTS, JSON.stringify(rules));
		} catch (error) {
			logger.warn("Failed to cache rules", { error });
		}

		return rules;
	}

	private async getMetricsForRule(rule: AlertRule): Promise<Record<string, any>> {
		try {
			if (rule.queueName) {
				// Queue-specific metrics
				return await this.metricsCollector.collectQueueMetrics(rule.queueName);
			} else {
				// System-wide metrics
				return await this.metricsCollector.collectSystemMetrics();
			}
		} catch (error) {
			logger.error("Failed to get metrics for rule", { error, ruleId: rule.id });
			return {};
		}
	}

	private extractMetricValue(metrics: Record<string, any>, metricPath: string): number | string {
		const keys = metricPath.split(".");
		let value: any = metrics;

		for (const key of keys) {
			if (value && typeof value === "object" && key in value) {
				value = value[key];
			} else {
				return 0;
			}
		}

		return typeof value === "number" || typeof value === "string" ? value : 0;
	}

	private evaluateCondition(
		condition: AlertCondition,
		currentValue: number | string,
		metrics: Record<string, any>,
	): boolean {
		const { operator, threshold } = condition;

		// Handle numeric comparisons
		if (typeof currentValue === "number" && typeof threshold === "number") {
			switch (operator) {
				case ">":
					return currentValue > threshold;
				case ">=":
					return currentValue >= threshold;
				case "<":
					return currentValue < threshold;
				case "<=":
					return currentValue <= threshold;
				case "==":
					return currentValue === threshold;
				case "!=":
					return currentValue !== threshold;
				default:
					return false;
			}
		}

		// Handle string comparisons
		if (typeof currentValue === "string" && typeof threshold === "string") {
			switch (operator) {
				case "==":
					return currentValue === threshold;
				case "!=":
					return currentValue !== threshold;
				case "contains":
					return currentValue.includes(threshold);
				default:
					return false;
			}
		}

		return false;
	}

	private async createAlert(rule: AlertRule, evaluation: AlertEvaluation): Promise<Alert> {
		const alert = await getPrismaInstance().alert.create({
			data: {
				ruleId: rule.id!,
				queueName: rule.queueName,
				severity: rule.severity,
				title: this.generateAlertTitle(rule, evaluation),
				message: this.generateAlertMessage(rule, evaluation),
				metrics: evaluation.metrics as any,
				status: "active",
			},
		});

		return this.mapAlertFromDb(alert);
	}

	private generateAlertTitle(rule: AlertRule, evaluation: AlertEvaluation): string {
		const queuePart = rule.queueName ? ` [${rule.queueName}]` : "";
		return `${rule.name}${queuePart}: ${rule.condition.metric} ${rule.condition.operator} ${rule.condition.threshold}`;
	}

	private generateAlertMessage(rule: AlertRule, evaluation: AlertEvaluation): string {
		const queuePart = rule.queueName ? ` in queue "${rule.queueName}"` : "";
		return `Alert "${rule.name}" triggered${queuePart}. Current value: ${evaluation.currentValue}, Threshold: ${evaluation.threshold}`;
	}

	private async sendNotifications(alert: Alert, channels: NotificationChannel[]): Promise<void> {
		try {
			const deliveries = await this.notificationService.sendNotifications(alert, channels);

			logger.info("Alert notifications sent", {
				alertId: alert.id,
				channels: channels.map((c) => c.type),
				deliveries: deliveries.map((d) => ({ channel: d.channel.type, status: d.status })),
			});
		} catch (error) {
			logger.error("Failed to send alert notifications", {
				error,
				alertId: alert.id,
				channels: channels.map((c) => c.type),
			});
		}
	}

	private isInCooldown(ruleId: string): boolean {
		const cooldownEnd = this.cooldownCache.get(ruleId);
		if (!cooldownEnd) return false;

		return new Date() < cooldownEnd;
	}

	private setCooldown(ruleId: string, cooldownMinutes: number): void {
		const cooldownEnd = new Date();
		cooldownEnd.setMinutes(cooldownEnd.getMinutes() + cooldownMinutes);
		this.cooldownCache.set(ruleId, cooldownEnd);

		// Also set in Redis for persistence across restarts
		const cacheKey = CACHE_KEYS.ALERT_COOLDOWN(ruleId);
		getRedisInstance()
			.setex(cacheKey, cooldownMinutes * 60, cooldownEnd.toISOString())
			.catch((error: Error) => {
				logger.warn("Failed to set cooldown in Redis", { error, ruleId });
			});
	}

	private async clearCooldown(ruleId: string): Promise<void> {
		this.cooldownCache.delete(ruleId);

		const cacheKey = CACHE_KEYS.ALERT_COOLDOWN(ruleId);
		try {
			await getRedisInstance().del(cacheKey);
		} catch (error) {
			logger.warn("Failed to clear cooldown from Redis", { error, ruleId });
		}
	}

	private async clearRulesCache(): Promise<void> {
		const cacheKey = CACHE_KEYS.ACTIVE_ALERTS();
		try {
			await getRedisInstance().del(cacheKey);
		} catch (error) {
			logger.warn("Failed to clear rules cache", { error });
		}
	}

	private validateAlertRuleInput(input: AlertRuleCreateInput): void {
		if (!input.name || input.name.trim().length === 0) {
			throw new ValidationError("Alert rule name is required");
		}

		if (input.name.length > 255) {
			throw new ValidationError("Alert rule name must be less than 255 characters");
		}

		this.validateAlertCondition(input.condition);

		if (!input.channels || input.channels.length === 0) {
			throw new ValidationError("At least one notification channel is required");
		}

		if (input.cooldown !== undefined && (input.cooldown < 0 || input.cooldown > 1440)) {
			throw new ValidationError("Cooldown must be between 0 and 1440 minutes (24 hours)");
		}
	}

	private validateAlertCondition(condition: AlertCondition): void {
		if (!condition.metric || condition.metric.trim().length === 0) {
			throw new ValidationError("Alert condition metric is required");
		}

		const validOperators = [">", "<", "==", "!=", "contains", ">=", "<="];
		if (!validOperators.includes(condition.operator)) {
			throw new ValidationError(`Invalid operator: ${condition.operator}`);
		}

		if (condition.threshold === undefined || condition.threshold === null) {
			throw new ValidationError("Alert condition threshold is required");
		}

		if (condition.timeWindow !== undefined && (condition.timeWindow < 1 || condition.timeWindow > 1440)) {
			throw new ValidationError("Time window must be between 1 and 1440 minutes");
		}
	}

	private mapAlertRuleFromDb(dbRule: any): AlertRule {
		return {
			id: dbRule.id,
			name: dbRule.name,
			description: dbRule.description,
			queueName: dbRule.queueName,
			condition: dbRule.condition as AlertCondition,
			severity: dbRule.severity as AlertSeverity,
			channels: dbRule.channels as NotificationChannel[],
			cooldown: dbRule.cooldown,
			enabled: dbRule.enabled,
			createdBy: dbRule.createdBy,
			createdAt: dbRule.createdAt,
			updatedAt: dbRule.updatedAt,
		};
	}

	private mapAlertFromDb(dbAlert: any): Alert {
		return {
			id: dbAlert.id,
			ruleId: dbAlert.ruleId,
			queueName: dbAlert.queueName,
			severity: dbAlert.severity as AlertSeverity,
			title: dbAlert.title,
			message: dbAlert.message,
			metrics: dbAlert.metrics,
			status: dbAlert.status as AlertStatus,
			createdAt: dbAlert.createdAt,
			acknowledgedAt: dbAlert.acknowledgedAt,
			acknowledgedBy: dbAlert.acknowledgedBy,
			resolvedAt: dbAlert.resolvedAt,
			resolutionNote: dbAlert.resolutionNote,
		};
	}
}
