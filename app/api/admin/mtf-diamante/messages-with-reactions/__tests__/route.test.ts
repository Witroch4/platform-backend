import { NextRequest } from "next/server";
import { POST, PUT, GET } from "../route";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Mock dependencies
jest.mock("@/auth");
jest.mock("@/lib/prisma", () => ({
  prisma: {
    caixaEntrada: {
      findFirst: jest.fn(),
    },
    interactiveMessage: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    buttonReactionMapping: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockPrisma = prisma as any;

describe("/api/admin/mtf-diamante/messages-with-reactions", () => {
  const mockSession = {
    user: {
      id: "test-user-id",
      email: "test@example.com",
    },
  };

  const mockCaixa = {
    id: "test-caixa-id",
    nome: "Test Caixa",
    usuarioChatwit: {
      appUserId: "test-user-id",
    },
  };

  const mockMessage = {
    id: "test-message-id",
    name: "Test Message",
    type: "button",
    bodyText: "Test message body",
    headerType: null,
    headerContent: null,
    footerText: null,
    actionData: {
      buttons: [
        { id: "btn1", title: "Button 1" },
        { id: "btn2", title: "Button 2" },
      ],
    },
    latitude: null,
    longitude: null,
    locationName: null,
    locationAddress: null,
    reactionEmoji: null,
    targetMessageId: null,
    stickerMediaId: null,
    stickerUrl: null,
    createdById: "test-user-id",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReaction = {
    id: "test-reaction-id",
    buttonId: "btn1",
    messageId: "test-message-id",
    emoji: "👍",
    description: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(mockSession);
  });

  describe("POST /messages-with-reactions", () => {
    const validRequestBody = {
      caixaId: "test-caixa-id",
      message: {
        name: "Test Message",
        type: "button",
        body: { text: "Test message body" },
        action: {
          buttons: [
            { id: "btn1", title: "Button 1" },
            { id: "btn2", title: "Button 2" },
          ],
        },
      },
      reactions: [
        {
          buttonId: "btn1",
          reaction: { type: "emoji", value: "👍" },
        },
        {
          buttonId: "btn2",
          reaction: { type: "text", value: "Thank you!" },
        },
      ],
    };

    it("should create message with reactions successfully", async () => {
      // Setup mocks
      mockPrisma.caixaEntrada.findFirst.mockResolvedValue(mockCaixa);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          interactiveMessage: {
            create: jest.fn().mockResolvedValue(mockMessage),
          },
          buttonReactionMapping: {
            create: jest.fn().mockResolvedValue(mockReaction),
          },
        });
      });

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "POST",
        body: JSON.stringify(validRequestBody),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.messageId).toBe("test-message-id");
      expect(data.message).toBeDefined();
      expect(data.reactions).toBeDefined();
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("should return 401 when user is not authenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "POST",
        body: JSON.stringify(validRequestBody),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("should return 400 when validation fails", async () => {
      const invalidRequestBody = {
        caixaId: "", // Invalid empty string
        message: {
          name: "", // Invalid empty string
          type: "invalid-type", // Invalid type
          body: { text: "" }, // Invalid empty text
        },
        reactions: [],
      };

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "POST",
        body: JSON.stringify(invalidRequestBody),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Validation failed");
      expect(data.details).toBeDefined();
    });

    it("should return 404 when caixa is not found", async () => {
      mockPrisma.caixaEntrada.findFirst.mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "POST",
        body: JSON.stringify(validRequestBody),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Caixa not found or access denied");
    });

    it("should handle database transaction rollback on error", async () => {
      mockPrisma.caixaEntrada.findFirst.mockResolvedValue(mockCaixa);
      mockPrisma.$transaction.mockRejectedValue(new Error("Database error"));

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "POST",
        body: JSON.stringify(validRequestBody),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Internal server error");
    });

    it("should handle unique constraint violations", async () => {
      mockPrisma.caixaEntrada.findFirst.mockResolvedValue(mockCaixa);
      mockPrisma.$transaction.mockRejectedValue(new Error("Unique constraint violation"));

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "POST",
        body: JSON.stringify(validRequestBody),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe("Duplicate button ID detected");
    });

    it("should create message without reactions", async () => {
      const requestBodyWithoutReactions = {
        ...validRequestBody,
        reactions: [],
      };

      mockPrisma.caixaEntrada.findFirst.mockResolvedValue(mockCaixa);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          interactiveMessage: {
            create: jest.fn().mockResolvedValue(mockMessage),
          },
          buttonReactionMapping: {
            create: jest.fn(),
          },
        });
      });

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "POST",
        body: JSON.stringify(requestBodyWithoutReactions),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.reactions).toEqual([]);
    });
  });

  describe("PUT /messages-with-reactions", () => {
    const validUpdateBody = {
      messageId: "test-message-id",
      message: {
        name: "Updated Message",
        body: { text: "Updated message body" },
      },
      reactions: [
        {
          buttonId: "btn1",
          reaction: { type: "emoji", value: "❤️" },
        },
      ],
    };

    it("should update message with reactions successfully", async () => {
      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          interactiveMessage: {
            update: jest.fn().mockResolvedValue({ ...mockMessage, name: "Updated Message" }),
          },
          buttonReactionMapping: {
            deleteMany: jest.fn(),
            create: jest.fn().mockResolvedValue(mockReaction),
          },
        });
      });

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "PUT",
        body: JSON.stringify(validUpdateBody),
        headers: { "Content-Type": "application/json" },
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.messageId).toBe("test-message-id");
    });

    it("should return 400 when messageId is missing", async () => {
      const invalidUpdateBody = {
        message: { name: "Updated Message" },
        reactions: [],
      };

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "PUT",
        body: JSON.stringify(invalidUpdateBody),
        headers: { "Content-Type": "application/json" },
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("messageId is required for updates");
    });

    it("should return 404 when message is not found", async () => {
      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "PUT",
        body: JSON.stringify(validUpdateBody),
        headers: { "Content-Type": "application/json" },
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Message not found or access denied");
    });
  });

  describe("GET /messages-with-reactions", () => {
    it("should get message with reactions by messageId", async () => {
      const messageWithReactions = {
        ...mockMessage,
        buttonReactions: [mockReaction],
      };

      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(messageWithReactions);

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions?messageId=test-message-id");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBeDefined();
      expect(data.reactions).toBeDefined();
      expect(data.reactions).toHaveLength(1);
    });

    it("should get all messages for a caixa", async () => {
      const messagesWithReactions = [
        {
          ...mockMessage,
          buttonReactions: [mockReaction],
        },
      ];

      mockPrisma.interactiveMessage.findMany.mockResolvedValue(messagesWithReactions);

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions?caixaId=test-caixa-id");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.messages).toBeDefined();
      expect(data.messages).toHaveLength(1);
      expect(data.messages[0].reactions).toHaveLength(1);
    });

    it("should return 400 when neither messageId nor caixaId is provided", async () => {
      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Either messageId or caixaId is required");
    });

    it("should return 404 when message is not found", async () => {
      mockPrisma.interactiveMessage.findFirst.mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions?messageId=non-existent-id");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Message not found or access denied");
    });
  });

  describe("Error Handling", () => {
    it("should handle foreign key constraint violations", async () => {
      mockPrisma.caixaEntrada.findFirst.mockResolvedValue(mockCaixa);
      mockPrisma.$transaction.mockRejectedValue(new Error("Foreign key constraint violation"));

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "POST",
        body: JSON.stringify({
          caixaId: "test-caixa-id",
          message: {
            name: "Test Message",
            type: "button",
            body: { text: "Test message body" },
          },
          reactions: [],
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid reference data");
    });

    it("should handle malformed JSON requests", async () => {
      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "POST",
        body: "invalid json",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(500);
    });
  });

  describe("Data Validation", () => {
    it("should validate message name length", async () => {
      const requestWithLongName = {
        caixaId: "test-caixa-id",
        message: {
          name: "a".repeat(256), // Exceeds 255 character limit
          type: "button",
          body: { text: "Test message body" },
        },
        reactions: [],
      };

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "POST",
        body: JSON.stringify(requestWithLongName),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Validation failed");
    });

    it("should validate body text length", async () => {
      const requestWithLongBody = {
        caixaId: "test-caixa-id",
        message: {
          name: "Test Message",
          type: "button",
          body: { text: "a".repeat(1025) }, // Exceeds 1024 character limit
        },
        reactions: [],
      };

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "POST",
        body: JSON.stringify(requestWithLongBody),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Validation failed");
    });

    it("should validate footer text length", async () => {
      const requestWithLongFooter = {
        caixaId: "test-caixa-id",
        message: {
          name: "Test Message",
          type: "button",
          body: { text: "Test message body" },
          footer: { text: "a".repeat(61) }, // Exceeds 60 character limit
        },
        reactions: [],
      };

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "POST",
        body: JSON.stringify(requestWithLongFooter),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Validation failed");
    });

    it("should validate reaction types", async () => {
      const requestWithInvalidReaction = {
        caixaId: "test-caixa-id",
        message: {
          name: "Test Message",
          type: "button",
          body: { text: "Test message body" },
        },
        reactions: [
          {
            buttonId: "btn1",
            reaction: { type: "invalid-type", value: "test" }, // Invalid reaction type
          },
        ],
      };

      const request = new NextRequest("http://localhost:3000/api/admin/mtf-diamante/messages-with-reactions", {
        method: "POST",
        body: JSON.stringify(requestWithInvalidReaction),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Validation failed");
    });
  });
});