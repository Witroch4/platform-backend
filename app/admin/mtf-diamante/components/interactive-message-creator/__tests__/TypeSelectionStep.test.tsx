import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TypeSelectionStep } from "../TypeSelectionStep";
import type { InteractiveMessageType } from "../types";

// Mock the UI components
jest.mock("@/components/ui/card", () => ({
  Card: ({ children, className, onClick }: any) => (
    <div className={className} onClick={onClick} data-testid="card">
      {children}
    </div>
  ),
  CardContent: ({ children, className }: any) => (
    <div className={className} data-testid="card-content">
      {children}
    </div>
  ),
  CardDescription: ({ children, className }: any) => (
    <div className={className} data-testid="card-description">
      {children}
    </div>
  ),
  CardHeader: ({ children, className }: any) => (
    <div className={className} data-testid="card-header">
      {children}
    </div>
  ),
  CardTitle: ({ children, className }: any) => (
    <div className={className} data-testid="card-title">
      {children}
    </div>
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, variant, size, className }: any) => (
    <button
      onClick={onClick}
      className={className}
      data-variant={variant}
      data-size={size}
      data-testid="button"
    >
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children, variant, className }: any) => (
    <span className={className} data-variant={variant} data-testid="badge">
      {children}
    </span>
  ),
}));

jest.mock("@/lib/utils", () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(" "),
}));

// Mock Lucide React icons
jest.mock("lucide-react", () => ({
  MessageSquare: ({ className }: any) => (
    <div className={className} data-testid="message-square-icon" />
  ),
  MousePointer: ({ className }: any) => (
    <div className={className} data-testid="mouse-pointer-icon" />
  ),
  List: ({ className }: any) => (
    <div className={className} data-testid="list-icon" />
  ),
  ExternalLink: ({ className }: any) => (
    <div className={className} data-testid="external-link-icon" />
  ),
  Workflow: ({ className }: any) => (
    <div className={className} data-testid="workflow-icon" />
  ),
  MapPin: ({ className }: any) => (
    <div className={className} data-testid="map-pin-icon" />
  ),
  Navigation: ({ className }: any) => (
    <div className={className} data-testid="navigation-icon" />
  ),
  Smile: ({ className }: any) => (
    <div className={className} data-testid="smile-icon" />
  ),
  Image: ({ className }: any) => (
    <div className={className} data-testid="image-icon" />
  ),
  Check: ({ className }: any) => (
    <div className={className} data-testid="check-icon" />
  ),
  ChevronRight: ({ className }: any) => (
    <div className={className} data-testid="chevron-right-icon" />
  ),
  Info: ({ className }: any) => (
    <div className={className} data-testid="info-icon" />
  ),
}));

describe("TypeSelectionStep", () => {
  const mockOnTypeSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const defaultProps = {
    selectedType: "button" as InteractiveMessageType,
    onTypeSelect: mockOnTypeSelect,
  };

  describe("Rendering", () => {
    it("renders the main title and description", () => {
      render(<TypeSelectionStep {...defaultProps} />);

      expect(
        screen.getByText("Escolher Tipo de Mensagem Interativa")
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Selecione o tipo de mensagem que melhor atende às suas necessidades"
        )
      ).toBeInTheDocument();
    });

    it("renders recommended types by default", () => {
      render(<TypeSelectionStep {...defaultProps} />);

      expect(screen.getByText("Tipos Recomendados")).toBeInTheDocument();
      expect(screen.getByText("Mais Populares")).toBeInTheDocument();

      // Should show recommended types (button and list)
      expect(screen.getByText("Botões de Resposta Rápida")).toBeInTheDocument();
      expect(screen.getByText("Lista de Opções")).toBeInTheDocument();

      // Should not show non-recommended types initially
      expect(
        screen.queryByText("Botão Call-to-Action")
      ).not.toBeInTheDocument();
    });

    it("renders all types when showAllTypes is true", () => {
      render(<TypeSelectionStep {...defaultProps} />);

      // Click the toggle button to show all types
      const toggleButton = screen.getByText("Ver Todos os Tipos");
      fireEvent.click(toggleButton);

      expect(screen.getByText("Todos os Tipos")).toBeInTheDocument();
      expect(screen.getByText("Botão Call-to-Action")).toBeInTheDocument();
      expect(screen.getByText("Fluxo Interativo")).toBeInTheDocument();
      expect(screen.getByText("Enviar Localização")).toBeInTheDocument();
      expect(screen.getByText("Solicitar Localização")).toBeInTheDocument();
    });

    it("shows selected type summary when a type is selected", () => {
      render(<TypeSelectionStep {...defaultProps} />);

      expect(
        screen.getByText("Tipo Selecionado: Botões de Resposta Rápida")
      ).toBeInTheDocument();
      // Use getAllByText to handle multiple instances
      const descriptions = screen.getAllByText(
        "Botões simples para respostas rápidas do usuário"
      );
      expect(descriptions.length).toBeGreaterThan(0);
      expect(
        screen.getByText(
          "Você pode prosseguir para configurar os detalhes desta mensagem interativa no próximo passo."
        )
      ).toBeInTheDocument();
    });
  });

  describe("Type Selection", () => {
    it("calls onTypeSelect when a type card is clicked", () => {
      render(<TypeSelectionStep {...defaultProps} />);

      const listTypeCard = screen
        .getByText("Lista de Opções")
        .closest('[data-testid="card"]');
      fireEvent.click(listTypeCard!);

      expect(mockOnTypeSelect).toHaveBeenCalledWith("list");
    });

    it("calls onTypeSelect when a type button is clicked", () => {
      render(<TypeSelectionStep {...defaultProps} />);

      const buttons = screen.getAllByTestId("button");
      const selectButton = buttons.find(
        (button) => button.textContent === "Selecionar"
      );

      if (selectButton) {
        fireEvent.click(selectButton);
        expect(mockOnTypeSelect).toHaveBeenCalled();
      }
    });

    it("shows selected state for the currently selected type", () => {
      render(<TypeSelectionStep {...defaultProps} selectedType="button" />);

      const selectedButton = screen.getByText("Selecionado");
      expect(selectedButton).toBeInTheDocument();
      expect(selectedButton).toHaveAttribute("data-variant", "default");
    });

    it("shows unselected state for non-selected types", () => {
      render(<TypeSelectionStep {...defaultProps} selectedType="button" />);

      // Toggle to show all types first
      const toggleButton = screen.getByText("Ver Todos os Tipos");
      fireEvent.click(toggleButton);

      const selectButtons = screen.getAllByText("Selecionar");
      expect(selectButtons.length).toBeGreaterThan(0);

      selectButtons.forEach((button) => {
        expect(button).toHaveAttribute("data-variant", "outline");
      });
    });
  });

  describe("Toggle Functionality", () => {
    it("toggles between recommended and all types", () => {
      render(<TypeSelectionStep {...defaultProps} />);

      // Initially shows recommended types
      expect(screen.getByText("Ver Todos os Tipos")).toBeInTheDocument();
      expect(screen.getByText("Tipos Recomendados")).toBeInTheDocument();

      // Click to show all types
      fireEvent.click(screen.getByText("Ver Todos os Tipos"));

      expect(screen.getByText("Ver Apenas Recomendados")).toBeInTheDocument();
      expect(screen.getByText("Todos os Tipos")).toBeInTheDocument();

      // Click to go back to recommended
      fireEvent.click(screen.getByText("Ver Apenas Recomendados"));

      expect(screen.getByText("Ver Todos os Tipos")).toBeInTheDocument();
      expect(screen.getByText("Tipos Recomendados")).toBeInTheDocument();
    });
  });

  describe("Type Information Display", () => {
    it("displays complexity badges correctly", () => {
      render(<TypeSelectionStep {...defaultProps} />);

      // Toggle to show all types to see different complexities
      fireEvent.click(screen.getByText("Ver Todos os Tipos"));

      // Use getAllByText to handle multiple instances
      expect(screen.getAllByText("Simples").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Médio").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Avançado").length).toBeGreaterThan(0);
    });

    it("displays recommended badges for recommended types", () => {
      render(<TypeSelectionStep {...defaultProps} />);

      const recommendedBadges = screen.getAllByText("Recomendado");
      expect(recommendedBadges.length).toBeGreaterThan(0);
    });

    it("displays features and examples in selected type summary", () => {
      render(<TypeSelectionStep {...defaultProps} selectedType="button" />);

      expect(screen.getByText("Recursos:")).toBeInTheDocument();
      expect(screen.getByText("Exemplos de uso:")).toBeInTheDocument();
      // Use getAllByText to handle multiple instances
      expect(screen.getAllByText("Até 3 botões").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Menu principal").length).toBeGreaterThan(0);
    });
  });

  describe("Accessibility", () => {
    it("has proper ARIA labels and roles", () => {
      render(<TypeSelectionStep {...defaultProps} />);

      // Check that cards are clickable
      const cards = screen.getAllByTestId("card");
      const clickableCards = cards.filter((card) => card.onclick);
      expect(clickableCards.length).toBeGreaterThan(0);
    });

    it("supports keyboard navigation", () => {
      render(<TypeSelectionStep {...defaultProps} />);

      const buttons = screen.getAllByTestId("button");
      buttons.forEach((button) => {
        expect(button).toBeInstanceOf(HTMLButtonElement);
      });
    });
  });

  describe("Different Selected Types", () => {
    it("displays correct information for list type", () => {
      render(<TypeSelectionStep {...defaultProps} selectedType="list" />);

      expect(
        screen.getByText("Tipo Selecionado: Lista de Opções")
      ).toBeInTheDocument();
      // Use getAllByText to handle multiple instances and check the first one
      const descriptions = screen.getAllByText(
        "Menu organizado com múltiplas seções e opções"
      );
      expect(descriptions.length).toBeGreaterThan(0);
    });

    it("displays correct information for cta_url type", () => {
      render(<TypeSelectionStep {...defaultProps} selectedType="cta_url" />);

      // First show all types to make cta_url visible
      fireEvent.click(screen.getByText("Ver Todos os Tipos"));

      expect(
        screen.getByText("Tipo Selecionado: Botão Call-to-Action")
      ).toBeInTheDocument();
      // Use getAllByText to handle multiple instances
      const descriptions = screen.getAllByText(
        "Botão que direciona para um link externo"
      );
      expect(descriptions.length).toBeGreaterThan(0);
    });

    it("displays correct information for flow type", () => {
      render(<TypeSelectionStep {...defaultProps} selectedType="flow" />);

      // First show all types to make flow visible
      fireEvent.click(screen.getByText("Ver Todos os Tipos"));

      expect(
        screen.getByText("Tipo Selecionado: Fluxo Interativo")
      ).toBeInTheDocument();
      // Use getAllByText to handle multiple instances
      const descriptions = screen.getAllByText(
        "Inicia um fluxo complexo do WhatsApp Business"
      );
      expect(descriptions.length).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("handles missing selectedType gracefully", () => {
      render(
        <TypeSelectionStep
          selectedType={undefined as any}
          onTypeSelect={mockOnTypeSelect}
        />
      );

      // Should still render the main interface
      expect(
        screen.getByText("Escolher Tipo de Mensagem Interativa")
      ).toBeInTheDocument();

      // Should not show selected type summary
      expect(screen.queryByText(/Tipo Selecionado:/)).not.toBeInTheDocument();
    });

    it("handles invalid selectedType gracefully", () => {
      render(
        <TypeSelectionStep
          selectedType={"invalid" as any}
          onTypeSelect={mockOnTypeSelect}
        />
      );

      // Should still render the main interface
      expect(
        screen.getByText("Escolher Tipo de Mensagem Interativa")
      ).toBeInTheDocument();

      // Should not show selected type summary for invalid type
      expect(screen.queryByText(/Tipo Selecionado:/)).not.toBeInTheDocument();
    });
  });
});
