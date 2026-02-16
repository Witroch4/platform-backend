/**
 * PII Redaction Utilities
 * Based on requirements 12.2, 6.3
 */

export interface RedactionConfig {
	enabled: boolean;
	preserveLength: boolean;
	redactionChar: string;
	patterns: {
		phone: boolean;
		email: boolean;
		cpf: boolean;
		cnpj: boolean;
		creditCard: boolean;
		custom: RegExp[];
	};
}

export class PIIRedactor {
	private config: RedactionConfig;

	// Common PII patterns for Brazilian context
	private readonly patterns = {
		phone: /(\+?55\s?)?(\(?[1-9]{2}\)?\s?)?([9]?\d{4}[-\s]?\d{4})/g,
		email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
		cpf: /\d{3}\.?\d{3}\.?\d{3}[-\.]?\d{2}/g,
		cnpj: /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[-\.]?\d{2}/g,
		creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
	};

	constructor(config: Partial<RedactionConfig> = {}) {
		this.config = {
			enabled: config.enabled ?? true,
			preserveLength: config.preserveLength ?? true,
			redactionChar: config.redactionChar ?? "*",
			patterns: {
				phone: config.patterns?.phone ?? true,
				email: config.patterns?.email ?? true,
				cpf: config.patterns?.cpf ?? true,
				cnpj: config.patterns?.cnpj ?? true,
				creditCard: config.patterns?.creditCard ?? true,
				custom: config.patterns?.custom ?? [],
			},
		};
	}

	// Redact a single string
	redactString(text: string): string {
		if (!this.config.enabled || !text) return text;

		let redacted = text;

		// Apply built-in patterns
		Object.entries(this.patterns).forEach(([key, pattern]) => {
			if (this.config.patterns[key as keyof typeof this.config.patterns]) {
				redacted = redacted.replace(pattern, (match) => {
					if (this.config.preserveLength) {
						return this.config.redactionChar.repeat(match.length);
					}
					return `[REDACTED_${key.toUpperCase()}]`;
				});
			}
		});

		// Apply custom patterns
		this.config.patterns.custom.forEach((pattern) => {
			redacted = redacted.replace(pattern, (match) => {
				if (this.config.preserveLength) {
					return this.config.redactionChar.repeat(match.length);
				}
				return "[REDACTED_CUSTOM]";
			});
		});

		return redacted;
	}

	// Redact an object recursively
	redactObject(obj: any): any {
		if (!this.config.enabled) return obj;

		if (typeof obj === "string") {
			return this.redactString(obj);
		}

		if (Array.isArray(obj)) {
			return obj.map((item) => this.redactObject(item));
		}

		if (obj && typeof obj === "object") {
			const redacted: any = {};

			Object.keys(obj).forEach((key) => {
				// Special handling for sensitive field names
				if (this.isSensitiveField(key)) {
					redacted[key] = this.redactSensitiveField(obj[key]);
				} else {
					redacted[key] = this.redactObject(obj[key]);
				}
			});

			return redacted;
		}

		return obj;
	}

	// Check if field name indicates sensitive data
	private isSensitiveField(fieldName: string): boolean {
		const sensitiveFields = [
			"phone",
			"telefone",
			"celular",
			"email",
			"e-mail",
			"cpf",
			"cnpj",
			"password",
			"senha",
			"token",
			"key",
			"secret",
			"credit_card",
			"cartao",
			"document",
			"documento",
		];

		const lowerField = fieldName.toLowerCase();
		return sensitiveFields.some((sensitive) => lowerField.includes(sensitive));
	}

	// Redact sensitive field with partial preservation
	private redactSensitiveField(value: any): any {
		if (typeof value !== "string") return value;

		// For phone numbers, show only last 4 digits
		if (this.patterns.phone.test(value)) {
			const digits = value.replace(/\D/g, "");
			if (digits.length >= 4) {
				return `***-***-${digits.slice(-4)}`;
			}
		}

		// For emails, show domain but hide user
		if (this.patterns.email.test(value)) {
			const [, domain] = value.split("@");
			return `***@${domain}`;
		}

		// For CPF, show only last 2 digits
		if (this.patterns.cpf.test(value)) {
			const digits = value.replace(/\D/g, "");
			if (digits.length === 11) {
				return `***.***.**${digits.slice(-2)}`;
			}
		}

		// Default redaction
		return this.redactString(value);
	}

	// Hash sensitive identifiers with salt
	hashIdentifier(value: string, salt?: string): string {
		if (!this.config.enabled) return value;

		const crypto = require("crypto");
		const actualSalt = salt || process.env.PII_HASH_SALT || "default-salt";

		return crypto
			.createHash("sha256")
			.update(value + actualSalt)
			.digest("hex")
			.substring(0, 8); // Use first 8 chars for brevity
	}

	// Create a redacted version for logging
	createLogSafeVersion(data: any): any {
		return this.redactObject(data);
	}

	// Validate if text contains PII
	containsPII(text: string): boolean {
		if (!text) return false;

		return (
			Object.entries(this.patterns).some(([key, pattern]) => {
				if (this.config.patterns[key as keyof typeof this.config.patterns]) {
					return pattern.test(text);
				}
				return false;
			}) || this.config.patterns.custom.some((pattern) => pattern.test(text))
		);
	}

	// Get PII detection report
	detectPII(text: string): { type: string; matches: string[] }[] {
		if (!text) return [];

		const detections: { type: string; matches: string[] }[] = [];

		Object.entries(this.patterns).forEach(([key, pattern]) => {
			if (this.config.patterns[key as keyof typeof this.config.patterns]) {
				const matches = text.match(pattern);
				if (matches && matches.length > 0) {
					detections.push({
						type: key,
						matches: matches.map((match) => this.redactString(match)),
					});
				}
			}
		});

		this.config.patterns.custom.forEach((pattern, index) => {
			const matches = text.match(pattern);
			if (matches && matches.length > 0) {
				detections.push({
					type: `custom_${index}`,
					matches: matches.map((match) => this.redactString(match)),
				});
			}
		});

		return detections;
	}
}

// Default redactor instance
export const defaultRedactor = new PIIRedactor({
	enabled: process.env.PII_REDACTION_ENABLED !== "false",
	preserveLength: process.env.PII_PRESERVE_LENGTH !== "false",
	redactionChar: process.env.PII_REDACTION_CHAR || "*",
});

// Convenience functions
export function redactPII(data: any): any {
	return defaultRedactor.redactObject(data);
}

export function redactString(text: string): string {
	return defaultRedactor.redactString(text);
}

export function containsPII(text: string): boolean {
	return defaultRedactor.containsPII(text);
}

export function hashIdentifier(value: string, salt?: string): string {
	return defaultRedactor.hashIdentifier(value, salt);
}

export default PIIRedactor;
