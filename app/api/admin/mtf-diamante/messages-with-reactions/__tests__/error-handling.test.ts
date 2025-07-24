// Integration tests for API error handling
// Tests the complete error handling flow in the messages-with-reactions API
// @ts-nocheck - Temporarily ignore type errors due to schema changes

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { NextRequest } from "next/server";
import { POST, PUT, GET } from "../route";

// Mock dependencies
jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

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
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/validation/interactive-message-validation", () => ({
  InteractiveMessageValidator: {
    validateMessage: jest.fn(),
  },
}));

jest.mock("@/lib/error-handling/interactive-message-errors", () => ({
  errorHandler: {
    handleError: jest.fn(),
    handleValidationError: jest.fn(),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { InteractiveMessageValidator } from "@/lib/validation/interactive-message-validation";
import { errorHandler } from "@/lib/error-handling/interactive-message-errors";

describe("API Error Handling Integration Tests", () => {
  let mockRequest: NextRequest;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock console.log and console.error to avoid noise in tests
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});

    // Setup default mock implementations
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "user123" },
    });

    (prisma.caixaEntrada.findFirst as jest.Mock).mockResolvedValue({
      id: "caixa123",
      usuarioChatwit: { appUserId: "user123" },
    });

    (InteractiveMessageValidator.validateMessage as jest.Mock).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
    });

    (errorHandler.handleError as jest.Mock).mockImplementation((error) => ({
      id: "error123",
      category: "SERVER",
      severity: "HIGH",
      code: "UNKNOWN_ERROR",
      message: error.message,
      userMessage: "An error occurred",
      timestamp: new Date(),
      context: {},
    }));

    (errorHandler.handleValidationError as jest.Mock).mockImplementation(
      (errors) => ({
        id: "validation_error123",
        category: "VALIDATION",
        severity: "MEDIUM",
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        userMessage: "Please check your input",
        timestamp: new Date(),
        context: {},
        details: { validationErrors: errors },
      })
    );
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("POST /api/admin/mtf-diamante/messages-with-reactions", () => {
    beforeEach(() => {
      mockRequest = {
        json: jest.fn().mockResolvedValue({
          caixaId: "caixa123",
          message: {
            name: "Test Message",
            type: "button",
            body: { text: "Hello world" },
            action: {
              type: "button",
              buttons: [{ id: "btn1", title: "Option 1" }],
            },
          },
          reactions: [],
        }),
      } as any;
    });

    it("should handle authentication errors", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
      expect(data.code).toBe("AUTH_UNAUTHORIZED");
      expect(data.requestId).toBeDefined();
      expect(errorHandler.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          action: "create_message_with_reactions",
          component: "messages-with-reactions-api",
        })
      );
    });

    it("should handle JSON parsing errors", async () => {
      mockRequest.json = jest.fn().mockRejectedValue(new Error("Invalid JSON"));

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid request format");
      expect(data.code).toBe("INVALID_JSON");
      expect(data.requestId).toBeDefined();
      expect(errorHandler.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          action: "parse_request_body",
          component: "messages-with-reactions-api",
        })
      );
    });

    it("should handle validation errors", async () => {
      mockRequest.json = jest.fn().mockResolvedValue({
        caixaId: "", // Invalid - empty string
        message: {
          name: "", // Invalid - empty string
          type: "button",
          body: { text: "" }, // Invalid - empty string
        },
        reactions: [],
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Validation failed");
      expect(data.code).toBe("VALIDATION_FAILED");
      expect(data.details).toBeDefined();
      expect(Array.isArray(data.details)).toBe(true);
      expect(data.requestId).toBeDefined();
    });

    it("should handle business validation errors", async () => {
      (
        InteractiveMessageValidator.validateMessage as jest.Mock
      ).mockReturnValue({
        isValid: false,
        errors: [
          {
            field: "name",
            code: "REQUIRED_FIELD",
            message: "Name is required",
            severity: "error",
          },
        ],
        warnings: [],
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Message validation failed");
      expect(data.code).toBe("BUSINESS_VALIDATION_FAILED");
      expect(data.details).toBeDefined();
      expect(data.requestId).toBeDefined();
    });

    it("should handle business validation exceptions", async () => {
      (
        InteractiveMessageValidator.validateMessage as jest.Mock
      ).mockImplementation(() => {
        throw new Error("Validation system error");
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Validation error");
      expect(data.code).toBe("BUSINESS_VALIDATION_ERROR");
      expect(data.requestId).toBeDefined();
      expect(errorHandler.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          action: "business_validation",
          component: "messages-with-reactions-api",
        })
      );
    });

    it("should handle database connection errors during caixa verification", async () => {
      (prisma.caixaEntrada.findFirst as jest.Mock).mockRejectedValue(
        new Error("Connection timeout")
      );

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Database error");
      expect(data.code).toBe("DATABASE_ERROR");
      expect(data.requestId).toBeDefined();
      expect(errorHandler.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          action: "verify_caixa_access",
          component: "messages-with-reactions-api",
        })
      );
    });

    it("should handle caixa not found errors", async () => {
      (prisma.caixaEntrada.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Caixa not found or access denied");
      expect(data.code).toBe("CAIXA_NOT_FOUND");
      expect(data.requestId).toBeDefined();
    });

    it("should handle database transaction unique constraint violations", async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error("Unique constraint violation")
      );

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe("Duplicate button ID detected");
      expect(data.code).toBe("DATABASE_CONSTRAINT_VIOLATION");
      expect(data.details).toBe("Button IDs must be unique within a message");
      expect(data.requestId).toBeDefined();
    });

    it("should handle database transaction foreign key violations", async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error("Foreign key constraint violation")
      );

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid reference data");
      expect(data.code).toBe("DATABASE_FOREIGN_KEY_VIOLATION");
      expect(data.details).toBe("Referenced data does not exist");
      expect(data.requestId).toBeDefined();
    });

    it("should handle database connection errors during transaction", async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error("Connection lost during transaction")
      );

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("Database connection error");
      expect(data.code).toBe("DATABASE_CONNECTION_ERROR");
      expect(data.details).toBe("Unable to connect to database");
      expect(data.requestId).toBeDefined();
    });

    it("should handle generic database transaction failures", async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error("Transaction rolled back")
      );

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Database transaction failed");
      expect(data.code).toBe("DATABASE_TRANSACTION_FAILED");
      expect(data.requestId).toBeDefined();
    });

    it("should handle unexpected errors with catch-all handler", async () => {
      // Mock an unexpected error that doesn't match specific patterns
      (prisma.caixaEntrada.findFirst as jest.Mock).mockImplementation(() => {
        throw new TypeError("Unexpected type error");
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Internal server error");
      expect(data.code).toBe("INTERNAL_SERVER_ERROR");
      expect(data.requestId).toBeDefined();
      expect(errorHandler.handleError).toHaveBeenCalledWith(
        expect.any(TypeError),
        expect.objectContaining({
          action: "create_message_with_reactions",
          component: "messages-with-reactions-api",
        })
      );
    });

    it("should include requestId in all error responses for tracing", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(data.requestId).toBeDefined();
      expect(typeof data.requestId).toBe("string");
      expect(data.requestId).toMatch(/^post_\d+_[a-z0-9]+$/);
    });

    it("should log errors with proper context and request ID", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await POST(mockRequest);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\[post_\d+_[a-z0-9]+\] Authentication failed:/),
        expect.any(Object)
      );
    });
  });

  describe("PUT /api/admin/mtf-diamante/messages-with-reactions", () => {
    beforeEach(() => {
      mockRequest = {
        json: jest.fn().mockResolvedValue({
          messageId: "msg123",
          message: {
            name: "Updated Message",
            type: "button",
            body: { text: "Updated hello world" },
          },
          reactions: [],
        }),
      } as any;

      (prisma.interactiveMessage.findFirst as jest.Mock).mockResolvedValue({
        id: "msg123",
        name: "Original Message",
        createdById: "user123",
      });
    });

    it("should handle missing messageId in update requests", async () => {
      mockRequest.json = jest.fn().mockResolvedValue({
        message: { name: "Test" },
        reactions: [],
      });

      const response = await PUT(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("messageId is required for updates");
    });

    it("should handle message not found during updates", async () => {
      (prisma.interactiveMessage.findFirst as jest.Mock).mockResolvedValue(
        null
      );

      const response = await PUT(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Message not found or access denied");
    });

    it("should handle validation errors in update requests", async () => {
      mockRequest.json = jest.fn().mockResolvedValue({
        messageId: "msg123",
        message: {
          name: "a".repeat(256), // Too long
          body: { text: "a".repeat(1025) }, // Too long
        },
        reactions: [],
      });

      const response = await PUT(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Message validation failed");
      expect(data.details).toBeDefined();
    });
  });

  describe("GET /api/admin/mtf-diamante/messages-with-reactions", () => {
    it("should handle missing query parameters", async () => {
      mockRequest = {
        url: "http://localhost/api/admin/mtf-diamante/messages-with-reactions",
      } as any;

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Either messageId or caixaId is required");
    });

    it("should handle message not found in GET requests", async () => {
      mockRequest = {
        url: "http://localhost/api/admin/mtf-diamante/messages-with-reactions?messageId=nonexistent",
      } as any;

      (prisma.interactiveMessage.findFirst as jest.Mock).mockResolvedValue(
        null
      );

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Message not found or access denied");
    });

    it("should handle database errors in GET requests", async () => {
      mockRequest = {
        url: "http://localhost/api/admin/mtf-diamante/messages-with-reactions?messageId=msg123",
      } as any;

      (prisma.interactiveMessage.findFirst as jest.Mock).mockRejectedValue(
        new Error("Database connection failed")
      );

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Internal server error");
    });
  });

  describe("Error logging and monitoring", () => {
    it("should log detailed error information for debugging", async () => {
      mockRequest = {
        json: jest.fn().mockResolvedValue({
          caixaId: "caixa123",
          message: {
            name: "Test Message",
            type: "button",
            body: { text: "Hello world" },
          },
          reactions: [],
        }),
      } as any;

      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error("Transaction failed")
      );

      await POST(mockRequest);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\[post_\d+_[a-z0-9]+\] Transaction failed:/),
        expect.any(Object)
      );
    });

    it("should call error handler with proper context for all errors", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await POST(mockRequest);

      expect(errorHandler.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          userId: undefined,
          action: "create_message_with_reactions",
          component: "messages-with-reactions-api",
        })
      );
    });
  });
});
