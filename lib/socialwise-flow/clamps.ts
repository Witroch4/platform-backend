/**
 * Centralized clamps and validation utilities for SocialWise Flow
 * Ensures consistent text formatting across all channels and prevents provider retries
 */

/**
 * Clamps title text to maximum word count and character limit
 * @param s Input string to clamp
 * @param maxWords Maximum number of words (default: 4)
 * @param maxChars Maximum number of characters (default: 20)
 * @returns Clamped title string
 */
export function clampTitle(s: string, maxWords = 4, maxChars = 20): string {
  const clean = String(s || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return clean;

  // First clamp by character count at word boundaries
  if (clean.length <= maxChars) {
    // If it fits in character limit, then clamp by word count
    const words = clean.split(" ");
    return words.slice(0, maxWords).join(" ");
  }

  // Find the last space before the character limit
  const cut = clean.slice(0, maxChars + 1);
  const lastSpace = cut.lastIndexOf(" ");

  let result =
    lastSpace > 0 ? cut.slice(0, lastSpace) : clean.slice(0, maxChars);
  result = result.trim();

  // Then ensure word count limit
  const words = result.split(" ");
  if (words.length > maxWords) {
    result = words.slice(0, maxWords).join(" ");
  }

  return result;
}

/**
 * Clamps body text to channel-specific limits
 * @param s Input string to clamp
 * @param channel Channel type ('whatsapp' | 'instagram' | 'facebook')
 * @returns Clamped body text
 */
export function clampBody(
  s: string,
  channel: "whatsapp" | "instagram" | "facebook" = "whatsapp"
): string {
  const clean = String(s || "").trim();

  const limits = {
    whatsapp: 1024,
    instagram: 640,
    facebook: 1024,
  };

  const maxChars = limits[channel];

  if (clean.length <= maxChars) {
    return clean;
  }

  // Clamp at word boundary when possible
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");

  return (lastSpace > maxChars - 50 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/**
 * Validates payload format for interactive messages
 * @param payload Payload string to validate
 * @returns True if payload matches required format
 */
export function validatePayload(payload: string): boolean {
  return /^@[a-z0-9_]+$/.test(payload);
}

/**
 * Sanitizes payload to ensure it matches the required format
 * @param payload Input payload string
 * @returns Sanitized payload in correct format
 */
export function sanitizePayload(payload: string): string {
  let clean = String(payload || "").toLowerCase();

  // Remove @ from the beginning if present, we'll add it back
  if (clean.startsWith("@")) {
    clean = clean.slice(1);
  }

  // Replace invalid characters with underscore
  clean = clean.replace(/[^a-z0-9_]/g, "_");

  // Remove leading/trailing underscores and multiple consecutive underscores
  clean = clean.replace(/^_+|_+$/g, "").replace(/_+/g, "_");

  return `@${clean}`;
}

/**
 * Validates that an intent exists in the catalog
 * @param intentSlug Intent slug to validate
 * @param intentCatalog Array of available intent slugs
 * @returns True if intent exists in catalog
 */
export function validateIntentExists(
  intentSlug: string,
  intentCatalog: string[]
): boolean {
  const cleanSlug = intentSlug.replace(/^@/, "");
  return intentCatalog.includes(cleanSlug);
}

/**
 * Channel-specific limits configuration
 */
export const CHANNEL_LIMITS = {
  whatsapp: {
    buttonTitle: 20,
    buttonId: 256,
    bodyText: 1024,
    maxButtons: 3,
  },
  instagram: {
    buttonTitle: 20,
    payload: 1000,
    bodyText: 640,
    maxButtons: 3,
  },
  facebook: {
    buttonTitle: 20,
    payload: 1000,
    bodyText: 1024,
    maxButtons: 3,
  },
} as const;

/**
 * Validates button configuration for specific channel
 * @param button Button object with title and payload
 * @param channel Target channel
 * @returns Validation result with errors if any
 */
export function validateButton(
  button: { title: string; payload: string },
  channel: keyof typeof CHANNEL_LIMITS
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const limits = CHANNEL_LIMITS[channel];

  if (!button.title || button.title.length === 0) {
    errors.push("Button title cannot be empty");
  } else if (button.title.length > limits.buttonTitle) {
    errors.push(`Button title exceeds ${limits.buttonTitle} characters`);
  }

  if (!button.payload || button.payload.length === 0) {
    errors.push("Button payload cannot be empty");
  } else if (!validatePayload(button.payload)) {
    errors.push("Button payload must match format ^@[a-z0-9_]+$");
  }

  if (
    channel === "whatsapp" &&
    button.payload.length > CHANNEL_LIMITS.whatsapp.buttonId
  ) {
    errors.push(
      `WhatsApp button ID exceeds ${CHANNEL_LIMITS.whatsapp.buttonId} characters`
    );
  }

  if (
    channel === "instagram" &&
    button.payload.length > CHANNEL_LIMITS.instagram.payload
  ) {
    errors.push(
      `Instagram button payload exceeds ${CHANNEL_LIMITS.instagram.payload} characters`
    );
  }

  if (
    channel === "facebook" &&
    button.payload.length > CHANNEL_LIMITS.facebook.payload
  ) {
    errors.push(
      `Facebook button payload exceeds ${CHANNEL_LIMITS.facebook.payload} characters`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Clamps and validates a button for a specific channel
 * @param button Input button object
 * @param channel Target channel
 * @returns Clamped and validated button
 */
export function clampButton(
  button: { title: string; payload: string },
  channel: keyof typeof CHANNEL_LIMITS
): { title: string; payload: string } {
  const limits = CHANNEL_LIMITS[channel];

  return {
    title: clampTitle(button.title, 4, limits.buttonTitle),
    payload: validatePayload(button.payload)
      ? button.payload
      : sanitizePayload(button.payload),
  };
}
