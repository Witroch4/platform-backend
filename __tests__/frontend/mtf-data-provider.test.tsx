/**
 * Frontend Component Tests for MtfDataProvider Context
 * Tests the context provider updated for unified data model
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.2
 */

import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import {
  MtfDataProvider,
  useMtfData,
} from "@/app/admin/mtf-diamante/context/MtfDataProvider";

// Mock fetch globally
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Test component that uses the context
const TestComponent: React.FC = () => {
  const {
    variaveis,
    loadingVariaveis,
    refreshVariaveis,
    lotes,
    loadingLotes,
    refreshLotes,
    caixas,
    setCaixas,
    loadingCaixas,
    refreshCaixas,
    isInitialized,
  } = useMtfData();

  return (
    <div>
      <div data-testid="initialized">{isInitialized ? "true" : "false"}</div>

      {/* Variáveis */}
      <div data-testid="loading-variaveis">
        {loadingVariaveis ? "true" : "false"}
      </div>
      <div data-testid="variaveis-count">{variaveis.length}</div>
      {variaveis.map((variavel) => (
        <div
          key={variavel.id || variavel.chave}
          data-testid={`variavel-${variavel.chave}`}
        >
          {variavel.chave}: {variavel.valor}
        </div>
      ))}
      <button onClick={refreshVariaveis} data-testid="refresh-variaveis">
        Refresh Variáveis
      </button>

      {/* Lotes */}
      <div data-testid="loading-lotes">{loadingLotes ? "true" : "false"}</div>
      <div data-testid="lotes-count">{lotes.length}</div>
      {lotes.map((lote) => (
        <div key={lote.id || lote.numero} data-testid={`lote-${lote.numero}`}>
          {lote.nome}: {lote.valor} ({lote.isActive ? "ativo" : "inativo"})
        </div>
      ))}
      <button onClick={refreshLotes} data-testid="refresh-lotes">
        Refresh Lotes
      </button>

      {/* Caixas */}
      <div data-testid="loading-caixas">{loadingCaixas ? "true" : "false"}</div>
      <div data-testid="caixas-count">{caixas.length}</div>
      {caixas.map((caixa) => (
        <div key={caixa.id} data-testid={`caixa-${caixa.inboxId}`}>
          {caixa.nome} (Inbox: {caixa.inboxId}) - Agentes:{" "}
          {caixa.agentes.length}
        </div>
      ))}
      <button onClick={refreshCaixas} data-testid="refresh-caixas">
        Refresh Caixas
      </button>
      <button
        onClick={() =>
          setCaixas((prev) => [
            ...prev,
            {
              id: "new-caixa",
              nome: "Nova Caixa",
              inboxId: "999",
              inboxName: "Nova Inbox",
              chatwitAccountId: "acc-999",
              channelType: "whatsapp",
              agentes: [],
            },
          ])
        }
        data-testid="add-caixa"
      >
        Add Caixa
      </button>
    </div>
  );
};

describe("MtfDataProvider Context - Unified Data Model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Initial Data Loading", () => {
    it("should initialize with loading states and fetch all data", async () => {
      // Arrange
      const mockVariaveisResponse = {
        ok: true,
        json: async () => ({
          variaveis: [
            { id: "var-1", chave: "API_KEY", valor: "test-key" },
            { id: "var-2", chave: "PHONE_ID", valor: "test-phone" },
          ],
        }),
      };

      const mockLotesResponse = {
        ok: true,
        json: async () => ({
          lotes: [
            {
              id: "lote-1",
              numero: 1,
              nome: "Lote Teste",
              valor: "100",
              dataInicio: new Date("2024-01-01"),
              dataFim: new Date("2024-12-31"),
              isActive: true,
            },
          ],
        }),
      };

      const mockCaixasResponse = {
        ok: true,
        json: async () => ({
          caixas: [
            {
              id: "caixa-1",
              nome: "Caixa Principal",
              inboxId: "4",
              inboxName: "WhatsApp Principal",
              chatwitAccountId: "acc-123",
              channelType: "whatsapp",
              agentes: [
                {
                  id: "agent-1",
                  nome: "Agente Principal",
                  projectId: "project-123",
                  region: "us-central1",
                  ativo: true,
                },
              ],
            },
          ],
        }),
      };

      mockFetch
        .mockResolvedValueOnce(mockVariaveisResponse as any)
        .mockResolvedValueOnce(mockLotesResponse as any)
        .mockResolvedValueOnce(mockCaixasResponse as any);

      // Act
      render(
        <MtfDataProvider>
          <TestComponent />
        </MtfDataProvider>
      );

      // Assert initial loading states
      expect(screen.getByTestId("initialized")).toHaveTextContent("false");
      expect(screen.getByTestId("loading-variaveis")).toHaveTextContent("true");
      expect(screen.getByTestId("loading-lotes")).toHaveTextContent("true");
      expect(screen.getByTestId("loading-caixas")).toHaveTextContent("true");

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByTestId("initialized")).toHaveTextContent("true");
        expect(screen.getByTestId("loading-variaveis")).toHaveTextContent(
          "false"
        );
        expect(screen.getByTestId("loading-lotes")).toHaveTextContent("false");
        expect(screen.getByTestId("loading-caixas")).toHaveTextContent("false");
      });

      // Verify API calls were made
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/mtf-diamante/variaveis"
      );
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/mtf-diamante/lotes");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/mtf-diamante/dialogflow/caixas"
      );
    });

    it("should display loaded data correctly", async () => {
      // Arrange
      const mockVariaveisResponse = {
        ok: true,
        json: async () => ({
          variaveis: [
            { id: "var-1", chave: "BUSINESS_ID", valor: "business-123" },
            { id: "var-2", chave: "PHONE_NUMBER_ID", valor: "phone-456" },
          ],
        }),
      };

      const mockLotesResponse = {
        ok: true,
        json: async () => ({
          lotes: [
            {
              id: "lote-1",
              numero: 1,
              nome: "Lote Ativo",
              valor: "500",
              dataInicio: new Date("2024-01-01"),
              dataFim: new Date("2024-12-31"),
              isActive: true,
            },
            {
              id: "lote-2",
              numero: 2,
              nome: "Lote Inativo",
              valor: "200",
              dataInicio: new Date("2023-01-01"),
              dataFim: new Date("2023-12-31"),
              isActive: false,
            },
          ],
        }),
      };

      const mockCaixasResponse = {
        ok: true,
        json: async () => ({
          caixas: [
            {
              id: "caixa-1",
              nome: "Caixa WhatsApp",
              inboxId: "4",
              inboxName: "WhatsApp Business",
              chatwitAccountId: "acc-123",
              channelType: "whatsapp",
              agentes: [
                {
                  id: "agent-1",
                  nome: "Agente Principal",
                  projectId: "project-123",
                  region: "us-central1",
                  ativo: true,
                },
                {
                  id: "agent-2",
                  nome: "Agente Secundário",
                  projectId: "project-456",
                  region: "us-east1",
                  ativo: false,
                },
              ],
            },
          ],
        }),
      };

      mockFetch
        .mockResolvedValueOnce(mockVariaveisResponse as any)
        .mockResolvedValueOnce(mockLotesResponse as any)
        .mockResolvedValueOnce(mockCaixasResponse as any);

      // Act
      render(
        <MtfDataProvider>
          <TestComponent />
        </MtfDataProvider>
      );

      // Assert
      await waitFor(() => {
        // Variáveis
        expect(screen.getByTestId("variaveis-count")).toHaveTextContent("2");
        expect(screen.getByTestId("variavel-BUSINESS_ID")).toHaveTextContent(
          "BUSINESS_ID: business-123"
        );
        expect(
          screen.getByTestId("variavel-PHONE_NUMBER_ID")
        ).toHaveTextContent("PHONE_NUMBER_ID: phone-456");

        // Lotes
        expect(screen.getByTestId("lotes-count")).toHaveTextContent("2");
        expect(screen.getByTestId("lote-1")).toHaveTextContent(
          "Lote Ativo: 500 (ativo)"
        );
        expect(screen.getByTestId("lote-2")).toHaveTextContent(
          "Lote Inativo: 200 (inativo)"
        );

        // Caixas
        expect(screen.getByTestId("caixas-count")).toHaveTextContent("1");
        expect(screen.getByTestId("caixa-4")).toHaveTextContent(
          "Caixa WhatsApp (Inbox: 4) - Agentes: 2"
        );
      });
    });
  });

  describe("Data Refresh Functionality", () => {
    it("should refresh variáveis when requested", async () => {
      // Arrange
      const initialVariaveisResponse = {
        ok: true,
        json: async () => ({
          variaveis: [{ id: "var-1", chave: "OLD_KEY", valor: "old-value" }],
        }),
      };

      const refreshedVariaveisResponse = {
        ok: true,
        json: async () => ({
          variaveis: [
            { id: "var-1", chave: "OLD_KEY", valor: "updated-value" },
            { id: "var-2", chave: "NEW_KEY", valor: "new-value" },
          ],
        }),
      };

      const mockLotesResponse = {
        ok: true,
        json: async () => ({ lotes: [] }),
      };

      const mockCaixasResponse = {
        ok: true,
        json: async () => ({ caixas: [] }),
      };

      mockFetch
        .mockResolvedValueOnce(initialVariaveisResponse as any)
        .mockResolvedValueOnce(mockLotesResponse as any)
        .mockResolvedValueOnce(mockCaixasResponse as any)
        .mockResolvedValueOnce(refreshedVariaveisResponse as any);

      // Act
      render(
        <MtfDataProvider>
          <TestComponent />
        </MtfDataProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId("variaveis-count")).toHaveTextContent("1");
        expect(screen.getByTestId("variavel-OLD_KEY")).toHaveTextContent(
          "OLD_KEY: old-value"
        );
      });

      // Refresh variáveis
      const refreshButton = screen.getByTestId("refresh-variaveis");
      act(() => {
        refreshButton.click();
      });

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId("variaveis-count")).toHaveTextContent("2");
        expect(screen.getByTestId("variavel-OLD_KEY")).toHaveTextContent(
          "OLD_KEY: updated-value"
        );
        expect(screen.getByTestId("variavel-NEW_KEY")).toHaveTextContent(
          "NEW_KEY: new-value"
        );
      });

      // Verify refresh API call was made
      expect(mockFetch).toHaveBeenCalledTimes(4); // 3 initial + 1 refresh
    });

    it("should refresh lotes when requested", async () => {
      // Arrange
      const mockVariaveisResponse = {
        ok: true,
        json: async () => ({ variaveis: [] }),
      };

      const initialLotesResponse = {
        ok: true,
        json: async () => ({
          lotes: [
            {
              id: "lote-1",
              numero: 1,
              nome: "Lote Original",
              valor: "100",
              dataInicio: new Date("2024-01-01"),
              dataFim: new Date("2024-12-31"),
              isActive: true,
            },
          ],
        }),
      };

      const refreshedLotesResponse = {
        ok: true,
        json: async () => ({
          lotes: [
            {
              id: "lote-1",
              numero: 1,
              nome: "Lote Atualizado",
              valor: "200",
              dataInicio: new Date("2024-01-01"),
              dataFim: new Date("2024-12-31"),
              isActive: false,
            },
          ],
        }),
      };

      const mockCaixasResponse = {
        ok: true,
        json: async () => ({ caixas: [] }),
      };

      mockFetch
        .mockResolvedValueOnce(mockVariaveisResponse as any)
        .mockResolvedValueOnce(initialLotesResponse as any)
        .mockResolvedValueOnce(mockCaixasResponse as any)
        .mockResolvedValueOnce(refreshedLotesResponse as any);

      // Act
      render(
        <MtfDataProvider>
          <TestComponent />
        </MtfDataProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId("lote-1")).toHaveTextContent(
          "Lote Original: 100 (ativo)"
        );
      });

      // Refresh lotes
      const refreshButton = screen.getByTestId("refresh-lotes");
      act(() => {
        refreshButton.click();
      });

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId("lote-1")).toHaveTextContent(
          "Lote Atualizado: 200 (inativo)"
        );
      });
    });

    it("should refresh caixas when requested", async () => {
      // Arrange
      const mockVariaveisResponse = {
        ok: true,
        json: async () => ({ variaveis: [] }),
      };

      const mockLotesResponse = {
        ok: true,
        json: async () => ({ lotes: [] }),
      };

      const initialCaixasResponse = {
        ok: true,
        json: async () => ({
          caixas: [
            {
              id: "caixa-1",
              nome: "Caixa Original",
              inboxId: "4",
              inboxName: "Inbox Original",
              chatwitAccountId: "acc-123",
              channelType: "whatsapp",
              agentes: [],
            },
          ],
        }),
      };

      const refreshedCaixasResponse = {
        ok: true,
        json: async () => ({
          caixas: [
            {
              id: "caixa-1",
              nome: "Caixa Atualizada",
              inboxId: "4",
              inboxName: "Inbox Atualizada",
              chatwitAccountId: "acc-123",
              channelType: "whatsapp",
              agentes: [
                {
                  id: "agent-1",
                  nome: "Novo Agente",
                  projectId: "project-123",
                  region: "us-central1",
                  ativo: true,
                },
              ],
            },
          ],
        }),
      };

      mockFetch
        .mockResolvedValueOnce(mockVariaveisResponse as any)
        .mockResolvedValueOnce(mockLotesResponse as any)
        .mockResolvedValueOnce(initialCaixasResponse as any)
        .mockResolvedValueOnce(refreshedCaixasResponse as any);

      // Act
      render(
        <MtfDataProvider>
          <TestComponent />
        </MtfDataProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId("caixa-4")).toHaveTextContent(
          "Caixa Original (Inbox: 4) - Agentes: 0"
        );
      });

      // Refresh caixas
      const refreshButton = screen.getByTestId("refresh-caixas");
      act(() => {
        refreshButton.click();
      });

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId("caixa-4")).toHaveTextContent(
          "Caixa Atualizada (Inbox: 4) - Agentes: 1"
        );
      });
    });
  });

  describe("State Management", () => {
    it("should allow direct manipulation of caixas state", async () => {
      // Arrange
      const mockVariaveisResponse = {
        ok: true,
        json: async () => ({ variaveis: [] }),
      };

      const mockLotesResponse = {
        ok: true,
        json: async () => ({ lotes: [] }),
      };

      const mockCaixasResponse = {
        ok: true,
        json: async () => ({
          caixas: [
            {
              id: "caixa-1",
              nome: "Caixa Existente",
              inboxId: "4",
              inboxName: "Inbox Existente",
              chatwitAccountId: "acc-123",
              channelType: "whatsapp",
              agentes: [],
            },
          ],
        }),
      };

      mockFetch
        .mockResolvedValueOnce(mockVariaveisResponse as any)
        .mockResolvedValueOnce(mockLotesResponse as any)
        .mockResolvedValueOnce(mockCaixasResponse as any);

      // Act
      render(
        <MtfDataProvider>
          <TestComponent />
        </MtfDataProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId("caixas-count")).toHaveTextContent("1");
      });

      // Add new caixa
      const addButton = screen.getByTestId("add-caixa");
      act(() => {
        addButton.click();
      });

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId("caixas-count")).toHaveTextContent("2");
        expect(screen.getByTestId("caixa-999")).toHaveTextContent(
          "Nova Caixa (Inbox: 999) - Agentes: 0"
        );
      });
    });
  });

  describe("Caching and Performance", () => {
    it("should not refetch data within cache duration", async () => {
      // Arrange
      const mockVariaveisResponse = {
        ok: true,
        json: async () => ({
          variaveis: [
            { id: "var-1", chave: "CACHED_KEY", valor: "cached-value" },
          ],
        }),
      };

      const mockLotesResponse = {
        ok: true,
        json: async () => ({ lotes: [] }),
      };

      const mockCaixasResponse = {
        ok: true,
        json: async () => ({ caixas: [] }),
      };

      mockFetch
        .mockResolvedValueOnce(mockVariaveisResponse as any)
        .mockResolvedValueOnce(mockLotesResponse as any)
        .mockResolvedValueOnce(mockCaixasResponse as any);

      // Act
      render(
        <MtfDataProvider>
          <TestComponent />
        </MtfDataProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId("initialized")).toHaveTextContent("true");
      });

      // Try to refresh immediately (should not make new API calls due to cache)
      const refreshButton = screen.getByTestId("refresh-variaveis");
      act(() => {
        refreshButton.click();
      });

      // Assert - should still only have made 3 initial API calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should refetch data when cache expires", async () => {
      // Arrange
      const mockVariaveisResponse = {
        ok: true,
        json: async () => ({
          variaveis: [
            { id: "var-1", chave: "EXPIRED_KEY", valor: "expired-value" },
          ],
        }),
      };

      const refreshedVariaveisResponse = {
        ok: true,
        json: async () => ({
          variaveis: [
            { id: "var-1", chave: "EXPIRED_KEY", valor: "fresh-value" },
          ],
        }),
      };

      const mockLotesResponse = {
        ok: true,
        json: async () => ({ lotes: [] }),
      };

      const mockCaixasResponse = {
        ok: true,
        json: async () => ({ caixas: [] }),
      };

      mockFetch
        .mockResolvedValueOnce(mockVariaveisResponse as any)
        .mockResolvedValueOnce(mockLotesResponse as any)
        .mockResolvedValueOnce(mockCaixasResponse as any)
        .mockResolvedValueOnce(refreshedVariaveisResponse as any);

      // Act
      render(
        <MtfDataProvider>
          <TestComponent />
        </MtfDataProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId("variavel-EXPIRED_KEY")).toHaveTextContent(
          "EXPIRED_KEY: expired-value"
        );
      });

      // Fast-forward time to expire cache (10 minutes + 1ms)
      act(() => {
        jest.advanceTimersByTime(10 * 60 * 1000 + 1);
      });

      // Refresh after cache expiry
      const refreshButton = screen.getByTestId("refresh-variaveis");
      act(() => {
        refreshButton.click();
      });

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId("variavel-EXPIRED_KEY")).toHaveTextContent(
          "EXPIRED_KEY: fresh-value"
        );
      });

      // Should have made 4 API calls (3 initial + 1 refresh)
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe("Error Handling", () => {
    it("should handle API errors gracefully", async () => {
      // Arrange
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"));

      // Act
      render(
        <MtfDataProvider>
          <TestComponent />
        </MtfDataProvider>
      );

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId("initialized")).toHaveTextContent("true");
        expect(screen.getByTestId("loading-variaveis")).toHaveTextContent(
          "false"
        );
        expect(screen.getByTestId("loading-lotes")).toHaveTextContent("false");
        expect(screen.getByTestId("loading-caixas")).toHaveTextContent("false");
      });

      // Data should be empty but provider should still work
      expect(screen.getByTestId("variaveis-count")).toHaveTextContent("0");
      expect(screen.getByTestId("lotes-count")).toHaveTextContent("0");
      expect(screen.getByTestId("caixas-count")).toHaveTextContent("0");

      // Errors should be logged
      expect(consoleSpy).toHaveBeenCalledWith(
        "Erro ao buscar variáveis:",
        expect.any(Error)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "Erro ao buscar lotes:",
        expect.any(Error)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "Erro ao buscar caixas:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it("should handle non-ok responses gracefully", async () => {
      // Arrange
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const errorResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      };

      mockFetch
        .mockResolvedValueOnce(errorResponse as any)
        .mockResolvedValueOnce(errorResponse as any)
        .mockResolvedValueOnce(errorResponse as any);

      // Act
      render(
        <MtfDataProvider>
          <TestComponent />
        </MtfDataProvider>
      );

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId("initialized")).toHaveTextContent("true");
      });

      // Data should be empty
      expect(screen.getByTestId("variaveis-count")).toHaveTextContent("0");
      expect(screen.getByTestId("lotes-count")).toHaveTextContent("0");
      expect(screen.getByTestId("caixas-count")).toHaveTextContent("0");

      consoleSpy.mockRestore();
    });
  });

  describe("Context Usage", () => {
    it("should throw error when used outside provider", () => {
      // Arrange
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Act & Assert
      expect(() => {
        render(<TestComponent />);
      }).toThrow("useMtfData deve ser usado dentro de MtfDataProvider");

      consoleSpy.mockRestore();
    });
  });
});
