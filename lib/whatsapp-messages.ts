/**
 * WhatsApp Messages Service
 * Abstracts all WhatsApp API calls for sending messages
 * Used by the async worker system for reliable message delivery
 */

import axios from "axios";

// ============================================================================
// INTERFACES
// ============================================================================

export interface TemplateMessageData {
  recipientPhone: string;
  templateId: string;
  templateName: string;
  language?: string;
  whatsappApiKey: string;
  phoneNumberId?: string; // Add phoneNumberId to template data

  // Template variables
  variables?: Record<string, any>;
  headerVar?: string;
  headerMedia?: string;
  bodyVars?: (string | number)[];
  buttonOverrides?: Record<number, any>;
  couponCode?: string;
}

export interface InteractiveMessageData {
  recipientPhone: string;
  whatsappApiKey: string;
  phoneNumberId?: string; // Add phoneNumberId to interactive data

  // Message structure
  header?: {
    type: "text" | "image" | "video" | "document";
    content: string; // Text content or media URL/ID
  };
  body: string;
  footer?: string;

  // Action type and data
  action: {
    type: "buttons" | "list" | "cta_url" | "flow" | "location_request";
    data: any; // Specific action data based on type
  };
}

export interface TextMessageData {
  recipientPhone: string;
  whatsappApiKey: string;
  phoneNumberId?: string; // Add phoneNumberId to text data
  text: string;
  replyToMessageId?: string; // For replying to specific messages
}

export interface MessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format phone number to E.164 format
 */
export function formatPhoneNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

/**
 * Sanitize coupon code for WhatsApp templates
 */
export function sanitizeCouponCode(raw?: string): string {
  const sanitized = (raw || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
  if (!sanitized)
    throw new Error(
      "Invalid coupon code - use 1-32 letters/numbers without spaces"
    );
  return sanitized;
}

/**
 * Get WhatsApp API URL for messages
 */
function getMessagesApiUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;
}

// ============================================================================
// TEMPLATE MESSAGE FUNCTIONS
// ============================================================================

/**
 * Build template message components from template data and variables
 */
function buildTemplateComponents(
  templateComponents: any[],
  data: TemplateMessageData
): any[] {
  const components: any[] = [];

  for (const component of templateComponents) {
    switch (component.type) {
      case "HEADER":
        if (["IMAGE", "VIDEO", "DOCUMENT"].includes(component.format)) {
          if (data.headerMedia) {
            const mediaType = component.format.toLowerCase();
            components.push({
              type: "header",
              parameters: [
                {
                  type: mediaType,
                  [mediaType]: { link: data.headerMedia },
                },
              ],
            });
          }
        } else if (component.format === "TEXT") {
          if (data.headerVar) {
            components.push({
              type: "header",
              parameters: [{ type: "text", text: data.headerVar }],
            });
          }
        }
        break;

      case "BODY":
        const placeholders = (component.text?.match(/\{\{(\d+)\}\}/g) || [])
          .length;
        if (
          placeholders &&
          data.bodyVars &&
          data.bodyVars.length >= placeholders
        ) {
          const parameters = data.bodyVars
            .slice(0, placeholders)
            .map((v) => ({ type: "text", text: String(v) }));
          components.push({ type: "body", parameters });
        }
        break;

      case "FOOTER":
        components.push({ type: "footer" });
        break;

      case "BUTTONS":
        component.buttons?.forEach((button: any, index: number) => {
          let buttonComponent: any;

          switch (button.type) {
            case "COPY_CODE":
              buttonComponent = {
                type: "button",
                sub_type: "copy_code",
                index: String(index),
                parameters: [
                  {
                    type: "coupon_code",
                    coupon_code: sanitizeCouponCode(
                      data.couponCode || button.example?.[0] || "CODE123"
                    ),
                  },
                ],
              };
              break;

            case "PHONE_NUMBER":
              buttonComponent = {
                type: "button",
                sub_type: "voice_call",
                index: String(index),
                parameters: [{ type: "payload", payload: button.phone_number }],
              };
              break;

            case "URL":
              buttonComponent = {
                type: "button",
                sub_type: "url",
                index: String(index),
                parameters: [
                  {
                    type: "text",
                    text: data.buttonOverrides?.[index] || button.example || "",
                  },
                ],
              };
              break;

            case "QUICK_REPLY":
              buttonComponent = {
                type: "button",
                sub_type: "quick_reply",
                index: String(index),
                parameters: [
                  {
                    type: "payload",
                    payload: data.buttonOverrides?.[index] || "OK",
                  },
                ],
              };
              break;

            case "FLOW":
              buttonComponent = {
                type: "button",
                sub_type: "flow",
                index: String(index),
                parameters: [
                  {
                    type: "flow",
                    flow: {
                      flow_id: button.flow_id,
                      flow_action: button.flow_action,
                      navigate_screen: button.navigate_screen,
                    },
                  },
                ],
              };
              break;
          }

          if (buttonComponent) {
            components.push(buttonComponent);
          }
        });
        break;
    }
  }

  return components;
}

/**
 * Send WhatsApp template message
 */
export async function sendTemplateMessage(
  data: TemplateMessageData,
  templateComponents: any[]
): Promise<MessageResult> {
  try {
    console.log(
      `[WhatsApp Messages] Sending template message: ${data.templateName} to ${data.recipientPhone}`
    );

    const recipientPhone = formatPhoneNumber(data.recipientPhone);
    if (!recipientPhone) {
      throw new Error("Invalid phone number format");
    }

    // Build template components
    const components = buildTemplateComponents(templateComponents, data);

    // Build the payload
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "template",
      template: {
        name: data.templateName,
        language: { code: data.language || "pt_BR" },
        components,
      },
    };

    console.log(
      "[WhatsApp Messages] Template payload:",
      JSON.stringify(payload, null, 2)
    );

    // Use phoneNumberId from data or fallback to environment variable
    const phoneNumberId = data.phoneNumberId || process.env.FROM_PHONE_NUMBER_ID || "";
    if (!phoneNumberId) {
      throw new Error("Phone Number ID is required but not provided");
    }
    const apiUrl = getMessagesApiUrl(phoneNumberId);

    // Send the message
    const response = await axios.post(apiUrl, payload, {
      headers: {
        Authorization: `Bearer ${data.whatsappApiKey}`,
        "Content-Type": "application/json",
      },
    });

    console.log(
      `[WhatsApp Messages] Template message sent successfully: ${response.data.messages?.[0]?.id}`
    );

    return {
      success: true,
      messageId: response.data.messages?.[0]?.id,
      details: response.data,
    };
  } catch (error: any) {
    console.error(
      "[WhatsApp Messages] Template message failed:",
      error.response?.data || error.message
    );

    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
      details: error.response?.data,
    };
  }
}

// ============================================================================
// INTERACTIVE MESSAGE FUNCTIONS
// ============================================================================

/**
 * Build interactive message payload based on action type
 */
function buildInteractivePayload(data: InteractiveMessageData): any {
  // Map internal action types to WhatsApp API types
  const whatsappTypeMap: Record<string, string> = {
    buttons: "BUTTON",
    list: "LIST",
    cta_url: "CTA_URL",
    flow: "FLOW",
    location_request: "LOCATION_REQUEST_MESSAGE",
  };

  const whatsappType =
    whatsappTypeMap[data.action.type] || data.action.type.toUpperCase();

  const basePayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: formatPhoneNumber(data.recipientPhone),
    type: "interactive",
    interactive: {
      type: whatsappType,
      body: { text: data.body },
    } as any,
  };

  // Add header if provided
  if (data.header) {
    basePayload.interactive.header = {
      type: data.header.type,
      [data.header.type]:
        data.header.type === "text"
          ? data.header.content
          : { link: data.header.content },
    };
  }

  // Add footer if provided
  if (data.footer) {
    basePayload.interactive.footer = { text: data.footer };
  }

  // Add action-specific data
  switch (data.action.type) {
    case "buttons":
      basePayload.interactive.action = {
        buttons: data.action.data.buttons.map((button: any, index: number) => ({
          type: "reply",
          reply: {
            id: button.id || `button_${index}`,
            title: button.title,
          },
        })),
      };
      break;

    case "list":
      basePayload.interactive.action = {
        button: data.action.data.buttonText || "Select",
        sections: data.action.data.sections,
      };
      break;

    case "cta_url":
      basePayload.interactive.action = {
        name: "cta_url",
        parameters: {
          display_text: data.action.data.displayText,
          url: data.action.data.url,
        },
      };
      break;

    case "flow":
      basePayload.interactive.action = {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: data.action.data.flowId,
          flow_cta: data.action.data.flowCta,
          flow_action: data.action.data.flowAction || "navigate",
          flow_action_payload: data.action.data.flowActionPayload || {},
        },
      };
      break;

    case "location_request":
      basePayload.interactive.action = {
        name: "send_location",
      };
      break;
  }

  return basePayload;
}

/**
 * Send WhatsApp interactive message
 */
export async function sendInteractiveMessage(
  data: InteractiveMessageData
): Promise<MessageResult> {
  try {
    console.log(
      `[WhatsApp Messages] Sending interactive message (${data.action.type}) to ${data.recipientPhone}`
    );

    const recipientPhone = formatPhoneNumber(data.recipientPhone);
    if (!recipientPhone) {
      throw new Error("Invalid phone number format");
    }

    // Build the payload
    const payload = buildInteractivePayload(data);

    console.log(
      "[WhatsApp Messages] Interactive payload:",
      JSON.stringify(payload, null, 2)
    );

    // Use phoneNumberId from data or fallback to environment variable
    const phoneNumberId = data.phoneNumberId || process.env.FROM_PHONE_NUMBER_ID || "";
    if (!phoneNumberId) {
      throw new Error("Phone Number ID is required but not provided");
    }
    const apiUrl = getMessagesApiUrl(phoneNumberId);

    // Send the message
    const response = await axios.post(apiUrl, payload, {
      headers: {
        Authorization: `Bearer ${data.whatsappApiKey}`,
        "Content-Type": "application/json",
      },
    });

    console.log(
      `[WhatsApp Messages] Interactive message sent successfully: ${response.data.messages?.[0]?.id}`
    );

    return {
      success: true,
      messageId: response.data.messages?.[0]?.id,
      details: response.data,
    };
  } catch (error: any) {
    console.error(
      "[WhatsApp Messages] Interactive message failed:",
      error.response?.data || error.message
    );

    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
      details: error.response?.data,
    };
  }
}

// ============================================================================
// TEXT MESSAGE FUNCTIONS
// ============================================================================

/**
 * Send WhatsApp text message (can be a reply or standalone)
 */
export async function sendTextMessage(
  data: TextMessageData
): Promise<MessageResult> {
  try {
    console.log(
      `[WhatsApp Messages] Sending text message to ${data.recipientPhone}${data.replyToMessageId ? ' (reply)' : ''}`
    );

    const recipientPhone = formatPhoneNumber(data.recipientPhone);
    if (!recipientPhone) {
      throw new Error("Invalid phone number format");
    }

    // Build the payload
    const payload: any = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "text",
      text: {
        body: data.text,
      },
    };

    // Add context for reply if specified
    if (data.replyToMessageId) {
      payload.context = {
        message_id: data.replyToMessageId,
      };
    }

    console.log(
      "[WhatsApp Messages] Text payload:",
      JSON.stringify(payload, null, 2)
    );

    // Use phoneNumberId from data or fallback to environment variable
    const phoneNumberId = data.phoneNumberId || process.env.FROM_PHONE_NUMBER_ID || "";
    if (!phoneNumberId) {
      throw new Error("Phone Number ID is required but not provided");
    }
    const apiUrl = getMessagesApiUrl(phoneNumberId);

    // Send the message
    const response = await axios.post(apiUrl, payload, {
      headers: {
        Authorization: `Bearer ${data.whatsappApiKey}`,
        "Content-Type": "application/json",
      },
    });

    console.log(
      `[WhatsApp Messages] Text message sent successfully: ${response.data.messages?.[0]?.id}`
    );

    return {
      success: true,
      messageId: response.data.messages?.[0]?.id,
      details: response.data,
    };
  } catch (error: any) {
    console.error(
      "[WhatsApp Messages] Text message failed:",
      error.response?.data || error.message
    );

    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
      details: error.response?.data,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Functions are already exported inline above
