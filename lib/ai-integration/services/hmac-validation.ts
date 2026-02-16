/**
 * HMAC Validation Service with Version Negotiation
 *
 * Provides secure webhook signature validation with versioned HMAC schemes
 * and proper header negotiation for Chatwit webhook integration.
 */

import crypto from "crypto";
import log from "@/lib/log";

/**
 * Supported HMAC signature versions
 */
export enum HMACVersion {
	V1 = "v1",
}

/**
 * HMAC validation configuration
 */
export interface HMACConfig {
	secret: string;
	timestampToleranceSeconds: number;
	supportedVersions: HMACVersion[];
	defaultVersion: HMACVersion;
}

/**
 * HMAC validation result
 */
export interface HMACValidationResult {
	isValid: boolean;
	version: HMACVersion | null;
	error?: string;
	timestamp?: number;
	computedSignature?: string;
	providedSignature?: string;
	timeDifference?: number;
}

/**
 * HMAC validation context
 */
export interface HMACValidationContext {
	rawBody: string | Buffer;
	signature: string;
	timestamp: string;
	version?: string;
	userAgent?: string;
	ipAddress?: string;
}

/**
 * Default HMAC configuration
 */
const DEFAULT_CONFIG: HMACConfig = {
	secret: process.env.CHATWIT_WEBHOOK_SECRET || "",
	timestampToleranceSeconds: 300, // 5 minutes
	supportedVersions: [HMACVersion.V1],
	defaultVersion: HMACVersion.V1,
};

/**
 * Validates HMAC signature with version negotiation
 */
export function validateHMACSignature(
	context: HMACValidationContext,
	config: Partial<HMACConfig> = {},
): HMACValidationResult {
	const finalConfig = { ...DEFAULT_CONFIG, ...config };

	try {
		// Parse and validate version
		const version = parseSignatureVersion(context.signature, context.version);

		if (!version) {
			return {
				isValid: false,
				version: null,
				error: "Invalid or missing signature version",
			};
		}

		if (!finalConfig.supportedVersions.includes(version)) {
			return {
				isValid: false,
				version,
				error: `Unsupported signature version: ${version}. Supported versions: ${finalConfig.supportedVersions.join(", ")}`,
			};
		}

		// Validate timestamp
		const timestampValidation = validateTimestamp(context.timestamp, finalConfig.timestampToleranceSeconds);

		if (!timestampValidation.isValid) {
			return {
				isValid: false,
				version,
				error: timestampValidation.error,
				timestamp: timestampValidation.timestamp,
				timeDifference: timestampValidation.timeDifference,
			};
		}

		// Compute expected signature based on version
		const computedSignature = computeSignature(context.rawBody, context.timestamp, finalConfig.secret, version);

		// Extract actual signature from header
		const providedSignature = extractSignatureFromHeader(context.signature, version);

		if (!providedSignature) {
			return {
				isValid: false,
				version,
				error: "Could not extract signature from header",
				computedSignature,
			};
		}

		// Perform timing-safe comparison
		const isValid = timingSafeEqual(computedSignature, providedSignature);

		const result: HMACValidationResult = {
			isValid,
			version,
			timestamp: timestampValidation.timestamp,
			computedSignature,
			providedSignature,
			timeDifference: timestampValidation.timeDifference,
		};

		if (!isValid) {
			result.error = "Signature mismatch";
		}

		// Log validation attempt (without sensitive data)
		log.info("HMAC validation completed", {
			isValid,
			version,
			timestamp: timestampValidation.timestamp,
			timeDifference: timestampValidation.timeDifference,
			userAgent: context.userAgent,
			ipAddress: context.ipAddress,
			bodyLength: typeof context.rawBody === "string" ? context.rawBody.length : context.rawBody.length,
		});

		return result;
	} catch (error) {
		log.error("HMAC validation error", { error, context: { ...context, rawBody: "[REDACTED]" } });

		return {
			isValid: false,
			version: null,
			error: `Validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Parses signature version from header or explicit version parameter
 */
function parseSignatureVersion(signature: string, explicitVersion?: string): HMACVersion | null {
	// Check explicit version header first
	if (explicitVersion) {
		const normalizedVersion = explicitVersion.toLowerCase();
		if (Object.values(HMACVersion).includes(normalizedVersion as HMACVersion)) {
			return normalizedVersion as HMACVersion;
		}
	}

	// Try to parse version from signature header
	// Format: "v1=<signature>" or just "<signature>" (defaults to v1)
	const versionMatch = signature.match(/^(v\d+)=/);

	if (versionMatch) {
		const version = versionMatch[1] as HMACVersion;
		if (Object.values(HMACVersion).includes(version)) {
			return version;
		}
	}

	// Default to v1 if no version specified and signature looks valid
	if (signature && !signature.includes("=")) {
		return HMACVersion.V1;
	}

	return null;
}

/**
 * Validates timestamp within tolerance window
 */
function validateTimestamp(
	timestampStr: string,
	toleranceSeconds: number,
): {
	isValid: boolean;
	timestamp?: number;
	timeDifference?: number;
	error?: string;
} {
	try {
		const timestamp = parseInt(timestampStr, 10);

		if (isNaN(timestamp)) {
			return {
				isValid: false,
				error: "Invalid timestamp format",
			};
		}

		const now = Math.floor(Date.now() / 1000);
		const timeDifference = Math.abs(now - timestamp);

		if (timeDifference > toleranceSeconds) {
			return {
				isValid: false,
				timestamp,
				timeDifference,
				error: `Timestamp outside tolerance window: ${timeDifference}s > ${toleranceSeconds}s`,
			};
		}

		return {
			isValid: true,
			timestamp,
			timeDifference,
		};
	} catch (error) {
		return {
			isValid: false,
			error: `Timestamp validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Computes HMAC signature based on version
 */
function computeSignature(body: string | Buffer, timestamp: string, secret: string, version: HMACVersion): string {
	const bodyStr = typeof body === "string" ? body : body.toString("utf8");

	switch (version) {
		case HMACVersion.V1:
			// v1 format: HMAC-SHA256(timestamp + '.' + body)
			const payload = `${timestamp}.${bodyStr}`;
			return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");

		default:
			throw new Error(`Unsupported HMAC version: ${version}`);
	}
}

/**
 * Extracts signature from header based on version
 */
function extractSignatureFromHeader(signatureHeader: string, version: HMACVersion): string | null {
	switch (version) {
		case HMACVersion.V1:
			// Handle both "v1=<signature>" and plain "<signature>" formats
			if (signatureHeader.startsWith("v1=")) {
				return signatureHeader.substring(3);
			} else if (!signatureHeader.includes("=")) {
				// Plain signature without version prefix
				return signatureHeader;
			}
			return null;

		default:
			return null;
	}
}

/**
 * Performs timing-safe string comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}

	const bufferA = Buffer.from(a, "hex");
	const bufferB = Buffer.from(b, "hex");

	if (bufferA.length !== bufferB.length) {
		return false;
	}

	return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Generates HMAC signature for outgoing webhooks
 */
export function generateHMACSignature(
	body: string | Buffer,
	timestamp: string,
	secret: string,
	version: HMACVersion = HMACVersion.V1,
): string {
	const signature = computeSignature(body, timestamp, secret, version);

	switch (version) {
		case HMACVersion.V1:
			return `v1=${signature}`;

		default:
			throw new Error(`Unsupported HMAC version: ${version}`);
	}
}

/**
 * Validates webhook headers and extracts HMAC context
 */
export function extractHMACContext(
	headers: Headers,
	rawBody: string | Buffer,
): {
	context: HMACValidationContext | null;
	error?: string;
} {
	try {
		// Extract required headers
		const signature = headers.get("x-chatwit-signature");
		const timestamp = headers.get("x-chatwit-timestamp");
		const version = headers.get("x-chatwit-signature-version");
		const userAgent = headers.get("user-agent");

		// Get client IP (check various headers)
		const forwardedFor = headers.get("x-forwarded-for");
		const realIP = headers.get("x-real-ip");
		const cfConnectingIP = headers.get("cf-connecting-ip");
		const ipAddress = forwardedFor?.split(",")[0].trim() || realIP || cfConnectingIP || "unknown";

		if (!signature) {
			return {
				context: null,
				error: "Missing X-Chatwit-Signature header",
			};
		}

		if (!timestamp) {
			return {
				context: null,
				error: "Missing X-Chatwit-Timestamp header",
			};
		}

		return {
			context: {
				rawBody,
				signature,
				timestamp,
				version: version || undefined,
				userAgent: userAgent || undefined,
				ipAddress,
			},
		};
	} catch (error) {
		return {
			context: null,
			error: `Failed to extract HMAC context: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Middleware-friendly HMAC validation function
 */
export function validateWebhookHMAC(
	headers: Headers,
	rawBody: string | Buffer,
	config: Partial<HMACConfig> = {},
): HMACValidationResult {
	const { context, error } = extractHMACContext(headers, rawBody);

	if (!context) {
		return {
			isValid: false,
			version: null,
			error: error || "Failed to extract HMAC context",
		};
	}

	return validateHMACSignature(context, config);
}

/**
 * Gets supported HMAC versions for API documentation
 */
export function getSupportedHMACVersions(): {
	versions: HMACVersion[];
	default: HMACVersion;
	headers: {
		signature: string;
		timestamp: string;
		version: string;
	};
} {
	return {
		versions: DEFAULT_CONFIG.supportedVersions,
		default: DEFAULT_CONFIG.defaultVersion,
		headers: {
			signature: "X-Chatwit-Signature",
			timestamp: "X-Chatwit-Timestamp",
			version: "X-Chatwit-Signature-Version",
		},
	};
}

/**
 * Validates HMAC configuration
 */
export function validateHMACConfig(config: Partial<HMACConfig> = {}): {
	isValid: boolean;
	errors: string[];
	warnings: string[];
} {
	const errors: string[] = [];
	const warnings: string[] = [];

	const finalConfig = { ...DEFAULT_CONFIG, ...config };

	// Check secret
	if (!finalConfig.secret) {
		errors.push("HMAC secret is required");
	} else if (finalConfig.secret.length < 16) {
		warnings.push("HMAC secret should be at least 16 characters long");
	} else if (finalConfig.secret === "default-secret-change-in-production") {
		errors.push("HMAC secret must be changed from default value");
	}

	// Check timestamp tolerance
	if (finalConfig.timestampToleranceSeconds < 60) {
		warnings.push("Timestamp tolerance less than 60 seconds may cause issues with clock skew");
	} else if (finalConfig.timestampToleranceSeconds > 600) {
		warnings.push("Timestamp tolerance greater than 10 minutes may be insecure");
	}

	// Check supported versions
	if (finalConfig.supportedVersions.length === 0) {
		errors.push("At least one HMAC version must be supported");
	}

	if (!finalConfig.supportedVersions.includes(finalConfig.defaultVersion)) {
		errors.push("Default HMAC version must be in supported versions list");
	}

	return {
		isValid: errors.length === 0,
		errors,
		warnings,
	};
}
