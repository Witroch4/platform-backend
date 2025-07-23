/**
 * Unit tests for the messages-with-reactions API endpoint logic
 * These tests focus on the business logic without complex imports
 */

import { z } from "zod";

// Validation schemas (copied from the main file for testing)
const ReactionSchema = z.object({
  type: z.enum(["emoji", "text"]),
  value: z.string().min(1),
});

const ButtonReactionSchema = z.object({
  buttonId: z.string().min(1),
  reaction: ReactionSchema.optional(),
});

const InteractiveMessageSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum([
    "cta_url",
    "flow", 
    "list",
    "button",
    "location",
    "location_request",
    "reaction",
    "sticker",
  ]),
  header: z.object({
    type: z.enum(["text", "image", "video", "document"]),
    text: z.string().optional(),
    media_url: z.string().optional(),
    filename: z.string().optional(),
  }).optional(),
  body: z.object({
    text: z.string().min(1).max(1024),
  }),
  footer: z.object({
    text: z.string().max(60),
  }).optional(),
  action: z.any().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  locationName: z.string().optional(),
  locationAddress: z.string().optional(),
  reactionEmoji: z.string().optional(),
  targetMessageId: z.string().optional(),
  stickerMediaId: z.string().optional(),
  stickerUrl: z.string().optional(),
});

const SaveMessageWithReactionsSchema = z.object({
  caixaId: z.string().min(1),
  message: InteractiveMessageSchema,
  reactions: z.array(ButtonReactionSchema),
});

// Helper functions (copied from the main file for testing)
function formatReaction(reaction: any) {
  return {
    id: reaction.id,
    buttonId: reaction.buttonId,
    messageId: reaction.messageId,
    type: reaction.description ? "text" : "emoji",
    emoji: reaction.emoji,
    textReaction: reaction.description,
    isActive: reaction.isActive,
    createdAt: reaction.createdAt,
  };
}

function formatMessage(message: any) {
  return {
    id: message.id,
    name: message.name,
    type: message.type,
    content: {
      name: message.name,
      type: message.type,
      header: message.headerType ? {
        type: message.headerType,
        text: message.headerContent || "",
        media_url: message.headerType !== 'text' ? message.headerContent || "" : ""
      } : undefined,
      body: {
        text: message.bodyText
      },
      footer: message.footerText ? {
        text: message.footerText
      } : undefined,
      action: message.actionData,
      latitude: message.latitude,
      longitude: message.longitude,
      locationName: message.locationName,
      locationAddress: message.locationAddress,
      reactionEmoji: message.reactionEmoji,
      targetMessageId: message.targetMessageId,
      stickerMediaId: message.stickerMediaId,
      stickerUrl: message.stickerUrl
    },
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

describe("Messages with Reactions API Logic", () => {
  describe("Validation Schemas", () => {
    describe("ReactionSchema", () => {
      it("should validate emoji reactions", () => {
        const validEmojiReaction = { type: "emoji", value: "👍" };
        const result = ReactionSchema.safeParse(validEmojiReaction);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe("emoji");
          expect(result.data.value).toBe("👍");
        }
      });

      it("should validate text reactions", () => {
        const validTextReaction = { type: "text", value: "Thank you!" };
        const result = ReactionSchema.safeParse(validTextReaction);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe("text");
          expect(result.data.value).toBe("Thank you!");
        }
      });

      it("should reject invalid reaction types", () => {
        const invalidReaction = { type: "invalid", value: "test" };
        const result = ReactionSchema.safeParse(invalidReaction);
        
        expect(result.success).toBe(false);
      });

      it("should reject empty reaction values", () => {
        const emptyReaction = { type: "emoji", value: "" };
        const result = ReactionSchema.safeParse(emptyReaction);
        
        expect(result.success).toBe(false);
      });
    });

    describe("ButtonReactionSchema", () => {
      it("should validate button reactions with reactions", () => {
        const validButtonReaction = {
          buttonId: "btn1",
          reaction: { type: "emoji", value: "👍" }
        };
        const result = ButtonReactionSchema.safeParse(validButtonReaction);
        
        expect(result.success).toBe(true);
      });

      it("should validate button reactions without reactions", () => {
        const buttonWithoutReaction = { buttonId: "btn1" };
        const result = ButtonReactionSchema.safeParse(buttonWithoutReaction);
        
        expect(result.success).toBe(true);
      });

      it("should reject empty button IDs", () => {
        const invalidButton = { buttonId: "", reaction: { type: "emoji", value: "👍" } };
        const result = ButtonReactionSchema.safeParse(invalidButton);
        
        expect(result.success).toBe(false);
      });
    });

    describe("InteractiveMessageSchema", () => {
      it("should validate basic button messages", () => {
        const validMessage = {
          name: "Test Message",
          type: "button",
          body: { text: "Hello World" }
        };
        const result = InteractiveMessageSchema.safeParse(validMessage);
        
        expect(result.success).toBe(true);
      });

      it("should validate messages with headers", () => {
        const messageWithHeader = {
          name: "Test Message",
          type: "button",
          header: { type: "text", text: "Header Text" },
          body: { text: "Hello World" }
        };
        const result = InteractiveMessageSchema.safeParse(messageWithHeader);
        
        expect(result.success).toBe(true);
      });

      it("should validate messages with footers", () => {
        const messageWithFooter = {
          name: "Test Message",
          type: "button",
          body: { text: "Hello World" },
          footer: { text: "Footer Text" }
        };
        const result = InteractiveMessageSchema.safeParse(messageWithFooter);
        
        expect(result.success).toBe(true);
      });

      it("should reject messages with empty names", () => {
        const invalidMessage = {
          name: "",
          type: "button",
          body: { text: "Hello World" }
        };
        const result = InteractiveMessageSchema.safeParse(invalidMessage);
        
        expect(result.success).toBe(false);
      });

      it("should reject messages with names too long", () => {
        const invalidMessage = {
          name: "a".repeat(256),
          type: "button",
          body: { text: "Hello World" }
        };
        const result = InteractiveMessageSchema.safeParse(invalidMessage);
        
        expect(result.success).toBe(false);
      });

      it("should reject messages with empty body text", () => {
        const invalidMessage = {
          name: "Test Message",
          type: "button",
          body: { text: "" }
        };
        const result = InteractiveMessageSchema.safeParse(invalidMessage);
        
        expect(result.success).toBe(false);
      });

      it("should reject messages with body text too long", () => {
        const invalidMessage = {
          name: "Test Message",
          type: "button",
          body: { text: "a".repeat(1025) }
        };
        const result = InteractiveMessageSchema.safeParse(invalidMessage);
        
        expect(result.success).toBe(false);
      });

      it("should reject messages with footer text too long", () => {
        const invalidMessage = {
          name: "Test Message",
          type: "button",
          body: { text: "Hello World" },
          footer: { text: "a".repeat(61) }
        };
        const result = InteractiveMessageSchema.safeParse(invalidMessage);
        
        expect(result.success).toBe(false);
      });

      it("should reject messages with invalid types", () => {
        const invalidMessage = {
          name: "Test Message",
          type: "invalid_type",
          body: { text: "Hello World" }
        };
        const result = InteractiveMessageSchema.safeParse(invalidMessage);
        
        expect(result.success).toBe(false);
      });

      it("should validate location messages", () => {
        const locationMessage = {
          name: "Location Message",
          type: "location",
          body: { text: "Here's the location" },
          latitude: -23.5505,
          longitude: -46.6333,
          locationName: "São Paulo",
          locationAddress: "São Paulo, Brazil"
        };
        const result = InteractiveMessageSchema.safeParse(locationMessage);
        
        expect(result.success).toBe(true);
      });
    });

    describe("SaveMessageWithReactionsSchema", () => {
      it("should validate complete request payload", () => {
        const validPayload = {
          caixaId: "test-caixa-id",
          message: {
            name: "Test Message",
            type: "button",
            body: { text: "Hello World" }
          },
          reactions: [
            {
              buttonId: "btn1",
              reaction: { type: "emoji", value: "👍" }
            }
          ]
        };
        const result = SaveMessageWithReactionsSchema.safeParse(validPayload);
        
        expect(result.success).toBe(true);
      });

      it("should validate payload without reactions", () => {
        const validPayload = {
          caixaId: "test-caixa-id",
          message: {
            name: "Test Message",
            type: "button",
            body: { text: "Hello World" }
          },
          reactions: []
        };
        const result = SaveMessageWithReactionsSchema.safeParse(validPayload);
        
        expect(result.success).toBe(true);
      });

      it("should reject payload with empty caixaId", () => {
        const invalidPayload = {
          caixaId: "",
          message: {
            name: "Test Message",
            type: "button",
            body: { text: "Hello World" }
          },
          reactions: []
        };
        const result = SaveMessageWithReactionsSchema.safeParse(invalidPayload);
        
        expect(result.success).toBe(false);
      });
    });
  });

  describe("Helper Functions", () => {
    describe("formatReaction", () => {
      it("should format emoji reactions correctly", () => {
        const mockReaction = {
          id: "reaction-1",
          buttonId: "btn1",
          messageId: "msg1",
          emoji: "👍",
          description: null,
          isActive: true,
          createdAt: new Date("2023-01-01"),
        };

        const formatted = formatReaction(mockReaction);

        expect(formatted).toEqual({
          id: "reaction-1",
          buttonId: "btn1",
          messageId: "msg1",
          type: "emoji",
          emoji: "👍",
          textReaction: null,
          isActive: true,
          createdAt: new Date("2023-01-01"),
        });
      });

      it("should format text reactions correctly", () => {
        const mockReaction = {
          id: "reaction-1",
          buttonId: "btn1",
          messageId: "msg1",
          emoji: "Thank you!",
          description: "Thank you!",
          isActive: true,
          createdAt: new Date("2023-01-01"),
        };

        const formatted = formatReaction(mockReaction);

        expect(formatted).toEqual({
          id: "reaction-1",
          buttonId: "btn1",
          messageId: "msg1",
          type: "text",
          emoji: "Thank you!",
          textReaction: "Thank you!",
          isActive: true,
          createdAt: new Date("2023-01-01"),
        });
      });
    });

    describe("formatMessage", () => {
      it("should format basic messages correctly", () => {
        const mockMessage = {
          id: "msg1",
          name: "Test Message",
          type: "button",
          bodyText: "Hello World",
          headerType: null,
          headerContent: null,
          footerText: null,
          actionData: { buttons: [{ id: "btn1", title: "Click me" }] },
          latitude: null,
          longitude: null,
          locationName: null,
          locationAddress: null,
          reactionEmoji: null,
          targetMessageId: null,
          stickerMediaId: null,
          stickerUrl: null,
          createdAt: new Date("2023-01-01"),
          updatedAt: new Date("2023-01-01"),
        };

        const formatted = formatMessage(mockMessage);

        expect(formatted.id).toBe("msg1");
        expect(formatted.name).toBe("Test Message");
        expect(formatted.type).toBe("button");
        expect(formatted.content.body.text).toBe("Hello World");
        expect(formatted.content.header).toBeUndefined();
        expect(formatted.content.footer).toBeUndefined();
        expect(formatted.content.action).toEqual({ buttons: [{ id: "btn1", title: "Click me" }] });
      });

      it("should format messages with headers correctly", () => {
        const mockMessage = {
          id: "msg1",
          name: "Test Message",
          type: "button",
          bodyText: "Hello World",
          headerType: "text",
          headerContent: "Header Text",
          footerText: null,
          actionData: null,
          latitude: null,
          longitude: null,
          locationName: null,
          locationAddress: null,
          reactionEmoji: null,
          targetMessageId: null,
          stickerMediaId: null,
          stickerUrl: null,
          createdAt: new Date("2023-01-01"),
          updatedAt: new Date("2023-01-01"),
        };

        const formatted = formatMessage(mockMessage);

        expect(formatted.content.header).toEqual({
          type: "text",
          text: "Header Text",
          media_url: ""
        });
      });

      it("should format messages with media headers correctly", () => {
        const mockMessage = {
          id: "msg1",
          name: "Test Message",
          type: "button",
          bodyText: "Hello World",
          headerType: "image",
          headerContent: "https://example.com/image.jpg",
          footerText: null,
          actionData: null,
          latitude: null,
          longitude: null,
          locationName: null,
          locationAddress: null,
          reactionEmoji: null,
          targetMessageId: null,
          stickerMediaId: null,
          stickerUrl: null,
          createdAt: new Date("2023-01-01"),
          updatedAt: new Date("2023-01-01"),
        };

        const formatted = formatMessage(mockMessage);

        expect(formatted.content.header).toEqual({
          type: "image",
          text: "https://example.com/image.jpg",
          media_url: "https://example.com/image.jpg"
        });
      });

      it("should format messages with footers correctly", () => {
        const mockMessage = {
          id: "msg1",
          name: "Test Message",
          type: "button",
          bodyText: "Hello World",
          headerType: null,
          headerContent: null,
          footerText: "Footer Text",
          actionData: null,
          latitude: null,
          longitude: null,
          locationName: null,
          locationAddress: null,
          reactionEmoji: null,
          targetMessageId: null,
          stickerMediaId: null,
          stickerUrl: null,
          createdAt: new Date("2023-01-01"),
          updatedAt: new Date("2023-01-01"),
        };

        const formatted = formatMessage(mockMessage);

        expect(formatted.content.footer).toEqual({
          text: "Footer Text"
        });
      });

      it("should format location messages correctly", () => {
        const mockMessage = {
          id: "msg1",
          name: "Location Message",
          type: "location",
          bodyText: "Here's the location",
          headerType: null,
          headerContent: null,
          footerText: null,
          actionData: null,
          latitude: -23.5505,
          longitude: -46.6333,
          locationName: "São Paulo",
          locationAddress: "São Paulo, Brazil",
          reactionEmoji: null,
          targetMessageId: null,
          stickerMediaId: null,
          stickerUrl: null,
          createdAt: new Date("2023-01-01"),
          updatedAt: new Date("2023-01-01"),
        };

        const formatted = formatMessage(mockMessage);

        expect(formatted.content.latitude).toBe(-23.5505);
        expect(formatted.content.longitude).toBe(-46.6333);
        expect(formatted.content.locationName).toBe("São Paulo");
        expect(formatted.content.locationAddress).toBe("São Paulo, Brazil");
      });
    });
  });

  describe("Business Logic Validation", () => {
    it("should handle multiple reactions for different buttons", () => {
      const reactions = [
        {
          buttonId: "btn1",
          reaction: { type: "emoji", value: "👍" }
        },
        {
          buttonId: "btn2",
          reaction: { type: "text", value: "Thank you!" }
        },
        {
          buttonId: "btn3"
          // No reaction configured
        }
      ];

      const validationResult = z.array(ButtonReactionSchema).safeParse(reactions);
      expect(validationResult.success).toBe(true);

      if (validationResult.success) {
        const validReactions = validationResult.data;
        expect(validReactions).toHaveLength(3);
        expect(validReactions[0].reaction?.type).toBe("emoji");
        expect(validReactions[1].reaction?.type).toBe("text");
        expect(validReactions[2].reaction).toBeUndefined();
      }
    });

    it("should validate complex message structures", () => {
      const complexMessage = {
        name: "Complex Interactive Message",
        type: "button",
        header: {
          type: "image",
          media_url: "https://example.com/header.jpg",
          filename: "header.jpg"
        },
        body: {
          text: "This is a complex message with header, footer, and action buttons."
        },
        footer: {
          text: "Footer information"
        },
        action: {
          buttons: [
            { id: "btn1", title: "Option 1", type: "reply" },
            { id: "btn2", title: "Option 2", type: "reply" },
            { id: "btn3", title: "Visit Website", type: "url", url: "https://example.com" }
          ]
        }
      };

      const result = InteractiveMessageSchema.safeParse(complexMessage);
      expect(result.success).toBe(true);
    });

    it("should validate edge cases for text lengths", () => {
      // Test exact boundary conditions
      const boundaryMessage = {
        name: "a".repeat(255), // Exactly at limit
        type: "button",
        body: { text: "a".repeat(1024) }, // Exactly at limit
        footer: { text: "a".repeat(60) } // Exactly at limit
      };

      const result = InteractiveMessageSchema.safeParse(boundaryMessage);
      expect(result.success).toBe(true);
    });

    it("should reject messages that exceed boundaries by one character", () => {
      const overLimitMessage = {
        name: "a".repeat(256), // One over limit
        type: "button",
        body: { text: "a".repeat(1025) }, // One over limit
        footer: { text: "a".repeat(61) } // One over limit
      };

      const result = InteractiveMessageSchema.safeParse(overLimitMessage);
      expect(result.success).toBe(false);
    });
  });
});