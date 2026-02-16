/**
 * TURBO Mode Notification System
 * Provides user notifications for error states and fallbacks
 * Based on requirements 2.6, 4.4
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { AlertTriangle, Info, XCircle, CheckCircle, Zap, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { TurboModeError, ErrorHandlerMetrics } from "./TurboModeErrorHandler";

export interface NotificationState {
	type: "error" | "warning" | "info" | "success";
	title: string;
	message: string;
	timestamp: Date;
	persistent?: boolean;
	actionable?: boolean;
	onAction?: () => void;
	actionLabel?: string;
}

export interface TurboModeNotificationSystemProps {
	errors: TurboModeError[];
	metrics: ErrorHandlerMetrics;
	turboModeActive: boolean;
	fallbackActive: boolean;
	onRetry?: () => void;
	onCancel?: () => void;
	onViewDetails?: () => void;
	className?: string;
}

export function TurboModeNotificationSystem({
	errors,
	metrics,
	turboModeActive,
	fallbackActive,
	onRetry,
	onCancel,
	onViewDetails,
	className = "",
}: TurboModeNotificationSystemProps) {
	const [notifications, setNotifications] = useState<NotificationState[]>([]);
	const [showDetails, setShowDetails] = useState(false);

	/**
	 * Create notification from TURBO mode error
	 */
	const createNotificationFromError = useCallback(
		(error: TurboModeError): NotificationState => {
			const baseNotification = {
				timestamp: error.timestamp,
				persistent: !error.recoverable,
			};

			switch (error.type) {
				case "PARALLEL_PROCESSING":
					return {
						...baseNotification,
						type: "warning" as const,
						title: "Processamento Paralelo Interrompido",
						message: `TURBO mode encontrou um erro e mudou para processamento padrão. ${error.leadId ? `Lead: ${error.leadId}` : ""}`,
						actionable: true,
						onAction: onRetry,
						actionLabel: "Tentar Novamente",
					};

				case "RESOURCE_EXHAUSTION":
					return {
						...baseNotification,
						type: "info" as const,
						title: "Recursos do Sistema Ajustados",
						message:
							"O sistema detectou alta utilização de recursos e ajustou automaticamente a velocidade de processamento.",
						actionable: false,
					};

				case "NETWORK_ERROR":
					return {
						...baseNotification,
						type: "error" as const,
						title: "Erro de Conexão",
						message: `Problema de rede detectado${error.leadId ? ` para o lead ${error.leadId}` : ""}. ${error.retryCount ? `Tentativa ${error.retryCount}` : ""}`,
						actionable: error.recoverable,
						onAction: onRetry,
						actionLabel: "Tentar Novamente",
					};

				case "TIMEOUT":
					return {
						...baseNotification,
						type: "warning" as const,
						title: "Timeout de Processamento",
						message: `O processamento${error.leadId ? ` do lead ${error.leadId}` : ""} excedeu o tempo limite e foi cancelado.`,
						actionable: true,
						onAction: onRetry,
						actionLabel: "Tentar Novamente",
					};

				case "SYSTEM_ERROR":
					return {
						...baseNotification,
						type: "error" as const,
						title: "Erro do Sistema",
						message: "Um erro crítico do sistema foi detectado. O processamento foi interrompido.",
						actionable: true,
						onAction: onViewDetails,
						actionLabel: "Ver Detalhes",
					};

				default:
					return {
						...baseNotification,
						type: "error" as const,
						title: "Erro Desconhecido",
						message: error.message,
						actionable: false,
					};
			}
		},
		[onRetry, onViewDetails],
	);

	/**
	 * Add notification to the system
	 */
	const addNotification = useCallback((notification: NotificationState) => {
		setNotifications((prev) => {
			// Remove duplicate notifications
			const filtered = prev.filter((n) => n.title !== notification.title || n.message !== notification.message);

			// Add new notification
			const updated = [...filtered, notification];

			// Keep only last 5 notifications
			return updated.slice(-5);
		});

		// Show toast notification
		const toastOptions = {
			duration: notification.persistent ? Infinity : 5000,
			action: notification.actionable
				? {
						label: notification.actionLabel || "Ação",
						onClick: notification.onAction || (() => {}),
					}
				: undefined,
		};

		switch (notification.type) {
			case "error":
				toast.error(notification.title, {
					description: notification.message,
					...toastOptions,
				});
				break;
			case "warning":
				toast.warning(notification.title, {
					description: notification.message,
					...toastOptions,
				});
				break;
			case "info":
				toast.info(notification.title, {
					description: notification.message,
					...toastOptions,
				});
				break;
			case "success":
				toast.success(notification.title, {
					description: notification.message,
					...toastOptions,
				});
				break;
		}
	}, []);

	/**
	 * Process new errors and create notifications
	 */
	useEffect(() => {
		if (errors.length === 0) return;

		const latestError = errors[errors.length - 1];
		const notification = createNotificationFromError(latestError);
		addNotification(notification);
	}, [errors, createNotificationFromError, addNotification]);

	/**
	 * Handle TURBO mode status changes
	 */
	useEffect(() => {
		if (turboModeActive && !fallbackActive) {
			addNotification({
				type: "success",
				title: "🚀 TURBO Mode Ativo",
				message: "Processamento paralelo habilitado para máxima velocidade.",
				timestamp: new Date(),
				persistent: false,
			});
		}

		if (fallbackActive) {
			addNotification({
				type: "info",
				title: "Modo Padrão Ativo",
				message: "Processamento continuando em modo sequencial.",
				timestamp: new Date(),
				persistent: false,
			});
		}
	}, [turboModeActive, fallbackActive, addNotification]);

	/**
	 * Get icon for notification type
	 */
	const getNotificationIcon = (type: NotificationState["type"]) => {
		switch (type) {
			case "error":
				return <XCircle className="h-4 w-4" />;
			case "warning":
				return <AlertTriangle className="h-4 w-4" />;
			case "info":
				return <Info className="h-4 w-4" />;
			case "success":
				return <CheckCircle className="h-4 w-4" />;
		}
	};

	/**
	 * Get alert variant for notification type
	 */
	const getAlertVariant = (type: NotificationState["type"]) => {
		switch (type) {
			case "error":
				return "destructive";
			case "warning":
				return "default";
			case "info":
				return "default";
			case "success":
				return "default";
		}
	};

	/**
	 * Calculate error rate for display
	 */
	const errorRate = metrics.totalErrors > 0 ? Math.round((metrics.unrecoverableErrors / metrics.totalErrors) * 100) : 0;

	/**
	 * Calculate recovery rate for display
	 */
	const recoveryRate =
		metrics.totalErrors > 0 ? Math.round((metrics.successfulRecoveries / metrics.totalErrors) * 100) : 100;

	return (
		<div className={`space-y-4 ${className}`}>
			{/* Status Overview */}
			<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
				<div className="flex items-center space-x-4">
					{turboModeActive && !fallbackActive && (
						<Badge variant="default" className="bg-green-500">
							<Zap className="h-3 w-3 mr-1" />
							TURBO Ativo
						</Badge>
					)}

					{fallbackActive && (
						<Badge variant="secondary">
							<Clock className="h-3 w-3 mr-1" />
							Modo Padrão
						</Badge>
					)}

					{metrics.totalErrors > 0 && (
						<div className="text-sm text-muted-foreground">
							Erros: {metrics.totalErrors} | Recuperações: {metrics.successfulRecoveries}
						</div>
					)}
				</div>

				{onViewDetails && (
					<Button variant="outline" onClick={() => setShowDetails(!showDetails)}>
						{showDetails ? "Ocultar" : "Ver"} Detalhes
					</Button>
				)}
			</div>

			{/* Error Rate Indicators */}
			{showDetails && metrics.totalErrors > 0 && (
				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<div className="flex justify-between text-sm">
							<span>Taxa de Erro</span>
							<span className={errorRate > 20 ? "text-red-500" : "text-green-500"}>{errorRate}%</span>
						</div>
						<Progress value={errorRate} className="h-2" />
					</div>

					<div className="space-y-2">
						<div className="flex justify-between text-sm">
							<span>Taxa de Recuperação</span>
							<span className={recoveryRate < 70 ? "text-red-500" : "text-green-500"}>{recoveryRate}%</span>
						</div>
						<Progress value={recoveryRate} className="h-2" />
					</div>
				</div>
			)}

			{/* Recent Notifications */}
			{notifications.length > 0 && (
				<div className="space-y-2">
					{notifications.slice(-3).map((notification, index) => (
						<Alert
							key={`${notification.timestamp.getTime()}-${index}`}
							variant={getAlertVariant(notification.type)}
							className="relative"
						>
							{getNotificationIcon(notification.type)}
							<AlertTitle className="flex items-center justify-between">
								{notification.title}
								<span className="text-xs text-muted-foreground">{notification.timestamp.toLocaleTimeString()}</span>
							</AlertTitle>
							<AlertDescription className="mt-2">
								{notification.message}

								{notification.actionable && notification.onAction && (
									<div className="mt-3">
										<Button variant="outline" onClick={notification.onAction}>
											{notification.actionLabel || "Ação"}
										</Button>
									</div>
								)}
							</AlertDescription>
						</Alert>
					))}
				</div>
			)}

			{/* Error Details */}
			{showDetails && errors.length > 0 && (
				<div className="space-y-2">
					<h4 className="text-sm font-medium">Histórico de Erros Recentes</h4>
					<div className="max-h-40 overflow-y-auto space-y-1">
						{errors.slice(-5).map((error, index) => (
							<div
								key={`${error.timestamp.getTime()}-${index}`}
								className="text-xs p-2 bg-muted rounded border-l-2 border-l-red-500"
							>
								<div className="flex justify-between items-start">
									<span className="font-medium">{error.type}</span>
									<span className="text-muted-foreground">{error.timestamp.toLocaleTimeString()}</span>
								</div>
								<div className="mt-1">{error.message}</div>
								{error.leadId && <div className="mt-1 text-muted-foreground">Lead: {error.leadId}</div>}
							</div>
						))}
					</div>
				</div>
			)}

			{/* Action Buttons */}
			{(onRetry || onCancel) && (
				<div className="flex space-x-2 pt-2 border-t">
					{onRetry && (
						<Button variant="outline" onClick={onRetry}>
							Tentar Novamente
						</Button>
					)}
					{onCancel && (
						<Button variant="outline" onClick={onCancel}>
							Cancelar Processamento
						</Button>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * Hook for managing TURBO mode notifications
 */
export function useTurboModeNotifications() {
	const [errors, setErrors] = useState<TurboModeError[]>([]);
	const [metrics, setMetrics] = useState<ErrorHandlerMetrics>({
		totalErrors: 0,
		errorsByType: {},
		fallbacksTriggered: 0,
		successfulRecoveries: 0,
		unrecoverableErrors: 0,
		averageRecoveryTime: 0,
	});

	const addError = useCallback((error: TurboModeError) => {
		setErrors((prev) => [...prev, error]);

		setMetrics((prev) => ({
			...prev,
			totalErrors: prev.totalErrors + 1,
			errorsByType: {
				...prev.errorsByType,
				[error.type]: (prev.errorsByType[error.type] || 0) + 1,
			},
			unrecoverableErrors: prev.unrecoverableErrors + (error.recoverable ? 0 : 1),
		}));
	}, []);

	const recordRecovery = useCallback(() => {
		setMetrics((prev) => ({
			...prev,
			successfulRecoveries: prev.successfulRecoveries + 1,
		}));
	}, []);

	const recordFallback = useCallback(() => {
		setMetrics((prev) => ({
			...prev,
			fallbacksTriggered: prev.fallbacksTriggered + 1,
		}));
	}, []);

	const clearErrors = useCallback(() => {
		setErrors([]);
		setMetrics({
			totalErrors: 0,
			errorsByType: {},
			fallbacksTriggered: 0,
			successfulRecoveries: 0,
			unrecoverableErrors: 0,
			averageRecoveryTime: 0,
		});
	}, []);

	return {
		errors,
		metrics,
		addError,
		recordRecovery,
		recordFallback,
		clearErrors,
	};
}
