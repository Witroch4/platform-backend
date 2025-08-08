
import { getPrismaInstance } from "../../lib/connections";
import { WhatsAppCredentials } from "../types/types";

// ============================================================================
// WHATSAPP API INTEGRATION WITH CREDENTIAL MANAGEMENT (Subtask 3.3)
// ============================================================================

export class WhatsAppApiManager {
  /**
   * Enhanced WhatsApp message sending with credential management
   * Requirements: 1.4, 2.4, 2.5
   */
  async sendMessage(
    contactPhone: string,
    messageContent: any,
    payloadCredentials: WhatsAppCredentials,
    inboxId: string,
    correlationId: string
  ): Promise<string> {
    try {
      console.log(`[WhatsApp API] Sending message`, {
        correlationId,
        contactPhone,
        messageType: messageContent.type,
        inboxId,
      });

      // 1. Use credentials from job payload as primary source
      let credentials = payloadCredentials;

      // 2. Implement credential fallback logic when payload credentials are missing
      if (!this.areCredentialsValid(credentials)) {
        console.log(
          `[WhatsApp API] Payload credentials invalid, using fallback`,
          {
            correlationId,
            inboxId,
          }
        );

        credentials = await this.getCredentialsWithFallback(inboxId);
      }

      // 3. Validate final credentials
      if (!this.areCredentialsValid(credentials)) {
        throw new Error("No valid WhatsApp credentials available");
      }

      // 4. Send message with comprehensive error handling and retry logic
      const messageId = await this.sendWithRetry(
        contactPhone,
        messageContent,
        credentials,
        correlationId
      );

      console.log(`[WhatsApp API] Message sent successfully`, {
        correlationId,
        messageId,
        credentialsSource: payloadCredentials.token ? "payload" : "fallback",
      });

      return messageId;
    } catch (error) {
      console.error(`[WhatsApp API] Failed to send message`, {
        correlationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Validate if credentials are complete and valid
   */
  private areCredentialsValid(credentials: WhatsAppCredentials): boolean {
    return !!(
      credentials &&
      credentials.token &&
      credentials.phoneNumberId &&
      credentials.businessId &&
      credentials.token.trim() !== "" &&
      credentials.phoneNumberId.trim() !== "" &&
      credentials.businessId.trim() !== ""
    );
  }

  /**
   * Get credentials with fallback logic when payload credentials are missing
   * Requirement: 2.4, 2.5
   */
  private async getCredentialsWithFallback(
    inboxId: string
  ): Promise<WhatsAppCredentials> {
    try {
      console.log(
        `[WhatsApp API] Getting credentials with fallback for inbox: ${inboxId}`
      );

      // Step 1: Try to get credentials from ChatwitInbox
      const inboxCredentials = await this.getInboxCredentials(inboxId);
      if (inboxCredentials && this.areCredentialsValid(inboxCredentials)) {
        console.log(`[WhatsApp API] Using inbox-specific credentials`);
        return inboxCredentials;
      }

      // Step 2: Try fallback chain (if configured)
      const fallbackCredentials = await this.getFallbackCredentials(inboxId);
      if (
        fallbackCredentials &&
        this.areCredentialsValid(fallbackCredentials)
      ) {
        console.log(`[WhatsApp API] Using fallback credentials`);
        return fallbackCredentials;
      }

      // Step 3: Use global configuration as last resort
      const globalCredentials = await this.getGlobalCredentials(inboxId);
      if (globalCredentials && this.areCredentialsValid(globalCredentials)) {
        console.log(`[WhatsApp API] Using global credentials`);
        return globalCredentials;
      }

      throw new Error("No valid credentials found in fallback chain");
    } catch (error) {
      console.error(`[WhatsApp API] Error in credential fallback:`, error);
      throw error;
    }
  }

  /**
   * Get credentials from ChatwitInbox
   */
  private async getInboxCredentials(
    inboxId: string
  ): Promise<WhatsAppCredentials | null> {
    try {
      const inbox = await getPrismaInstance().chatwitInbox.findFirst({
        where: {
          inboxId: inboxId,
        },
      });

      if (
        !inbox ||
        !inbox.whatsappApiKey ||
        !inbox.phoneNumberId ||
        !inbox.whatsappBusinessAccountId
      ) {
        return null;
      }

      return {
        token: inbox.whatsappApiKey,
        phoneNumberId: inbox.phoneNumberId,
        businessId: inbox.whatsappBusinessAccountId,
      };
    } catch (error) {
      console.error(`[WhatsApp API] Error getting inbox credentials:`, error);
      return null;
    }
  }

  /**
   * Get credentials from fallback chain with loop detection
   */
  private async getFallbackCredentials(
    inboxId: string,
    visited: Set<string> = new Set(),
    depth: number = 0
  ): Promise<WhatsAppCredentials | null> {
    const MAX_FALLBACK_DEPTH = 5;

    // Protect against infinite loops and excessive depth
    if (visited.has(inboxId) || depth >= MAX_FALLBACK_DEPTH) {
      console.warn(
        `[WhatsApp API] Fallback loop detected or max depth reached`,
        {
          inboxId,
          depth,
          visited: Array.from(visited),
        }
      );
      return null;
    }

    visited.add(inboxId);

    try {
      const inbox = await getPrismaInstance().chatwitInbox.findFirst({
        where: {
          inboxId: inboxId,
        },
        include: {
          fallbackParaInbox: true,
        },
      });

      if (!inbox || !inbox.fallbackParaInbox) {
        return null;
      }

      // Check if fallback inbox has valid credentials
      const fallbackInbox = inbox.fallbackParaInbox;
      if (
        fallbackInbox.whatsappApiKey &&
        fallbackInbox.phoneNumberId &&
        fallbackInbox.whatsappBusinessAccountId
      ) {
        return {
          token: fallbackInbox.whatsappApiKey,
          phoneNumberId: fallbackInbox.phoneNumberId,
          businessId: fallbackInbox.whatsappBusinessAccountId,
        };
      }

      // Recursively check the fallback chain
      return await this.getFallbackCredentials(
        fallbackInbox.inboxId,
        visited,
        depth + 1
      );
    } catch (error) {
      console.error(`[WhatsApp API] Error in fallback chain:`, error);
      return null;
    }
  }

  /**
   * Get global credentials as last resort
   */
  private async getGlobalCredentials(
    inboxId: string
  ): Promise<WhatsAppCredentials | null> {
    try {
      // Find the ChatwitInbox to get the user
      const inbox = await getPrismaInstance().chatwitInbox.findFirst({
        where: {
          inboxId: inboxId,
        },
        include: {
          usuarioChatwit: {
            include: {
              configuracaoGlobalWhatsApp: true,
            },
          },
        },
      });

      if (!inbox?.usuarioChatwit?.configuracaoGlobalWhatsApp) {
        return null;
      }

      const globalConfig = inbox.usuarioChatwit.configuracaoGlobalWhatsApp;

      return {
        token: globalConfig.whatsappApiKey,
        phoneNumberId: globalConfig.phoneNumberId,
        businessId: globalConfig.whatsappBusinessAccountId,
      };
    } catch (error) {
      console.error(`[WhatsApp API] Error getting global credentials:`, error);
      return null;
    }
  }

  /**
   * Send message with comprehensive API error handling and retry logic
   * Requirement: 1.4
   */
  private async sendWithRetry(
    contactPhone: string,
    messageContent: any,
    credentials: WhatsAppCredentials,
    correlationId: string,
    maxRetries: number = 3
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `[WhatsApp API] Sending message attempt ${attempt}/${maxRetries}`,
          {
            correlationId,
            contactPhone,
          }
        );

        const messageId = await this.sendMessageToApi(
          contactPhone,
          messageContent,
          credentials
        );

        if (attempt > 1) {
          console.log(
            `[WhatsApp API] Message sent successfully on retry attempt ${attempt}`,
            {
              correlationId,
              messageId,
            }
          );
        }

        return messageId;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");

        console.error(`[WhatsApp API] Attempt ${attempt} failed`, {
          correlationId,
          error: lastError.message,
          willRetry: attempt < maxRetries,
        });

        // Check if error is retryable
        if (!this.isRetryableError(lastError) || attempt === maxRetries) {
          break;
        }

        // Wait before retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error("All retry attempts failed");
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      "ECONNRESET",
      "ENOTFOUND",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "Rate limit",
      "Service unavailable",
      "Internal server error",
    ];

    const errorMessage = error.message.toLowerCase();
    return retryableErrors.some((retryableError) =>
      errorMessage.includes(retryableError.toLowerCase())
    );
  }

  /**
   * Send message to WhatsApp API
   */
  private async sendMessageToApi(
    contactPhone: string,
    messageContent: any,
    credentials: WhatsAppCredentials
  ): Promise<string> {
    try {
      const url = `https://graph.facebook.com/v22.0/${credentials.phoneNumberId}/messages`;

      const payload = {
        messaging_product: "whatsapp",
        to: contactPhone,
        ...messageContent,
      };

      // DEBUG: Log the exact payload being sent to WhatsApp API
      console.log(`[WhatsApp API] EXACT PAYLOAD BEING SENT:`, {
        url,
        payload: JSON.stringify(payload, null, 2),
        messageContentType: messageContent.type,
        hasInteractive: !!messageContent.interactive,
        interactiveKeys: messageContent.interactive ? Object.keys(messageContent.interactive) : [],
        interactiveStructure: messageContent.interactive,
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(30000), // 30 seconds timeout
      });

      if (!response.ok) {
        const errorData = await response.text();

        // Parse WhatsApp API error for better error handling
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(errorData);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
          }
        } catch {
          errorMessage = errorData || errorMessage;
        }

        throw new Error(`WhatsApp API error: ${errorMessage}`);
      }

      const result = await response.json();

      if (result.messages && result.messages[0]?.id) {
        return result.messages[0].id;
      }

      throw new Error("No message ID returned from WhatsApp API");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("WhatsApp API request timeout");
      }
      throw error;
    }
  }

  /**
   * Add phone number ID resolution from database when needed
   * Requirement: 2.5
   */
  async resolvePhoneNumberId(
    inboxId: string,
    fallbackPhoneNumberId?: string
  ): Promise<string | null> {
    try {
      console.log(
        `[WhatsApp API] Resolving phone number ID for inbox: ${inboxId}`
      );

      // Try to get from ChatwitInbox first
      const inbox = await getPrismaInstance().chatwitInbox.findFirst({
        where: {
          inboxId: inboxId,
        },
      });

      if (inbox?.phoneNumberId) {
        console.log(
          `[WhatsApp API] Found phone number ID in inbox: ${inbox.phoneNumberId}`
        );
        return inbox.phoneNumberId;
      }

      // Try fallback chain
      const fallbackCredentials = await this.getFallbackCredentials(inboxId);
      if (fallbackCredentials?.phoneNumberId) {
        console.log(
          `[WhatsApp API] Found phone number ID in fallback: ${fallbackCredentials.phoneNumberId}`
        );
        return fallbackCredentials.phoneNumberId;
      }

      // Try global config
      const globalCredentials = await this.getGlobalCredentials(inboxId);
      if (globalCredentials?.phoneNumberId) {
        console.log(
          `[WhatsApp API] Found phone number ID in global config: ${globalCredentials.phoneNumberId}`
        );
        return globalCredentials.phoneNumberId;
      }

      // Use provided fallback
      if (fallbackPhoneNumberId) {
        console.log(
          `[WhatsApp API] Using provided fallback phone number ID: ${fallbackPhoneNumberId}`
        );
        return fallbackPhoneNumberId;
      }

      console.log(
        `[WhatsApp API] No phone number ID found for inbox: ${inboxId}`
      );
      return null;
    } catch (error) {
      console.error(`[WhatsApp API] Error resolving phone number ID:`, error);
      return fallbackPhoneNumberId || null;
    }
  }
}
