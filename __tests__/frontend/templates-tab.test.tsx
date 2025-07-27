/**
 * Frontend Component Tests for Updated Lead and Template Views
 * Tests components updated for the unified data model
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.2
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'sonner';
import TemplatesTab from '@/app/admin/mtf-diamante/components/TemplatesTab/index';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

jest.mock('axios');
jest.mock('sonner');

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockToast = toast as jest.Mocked<typeof toast>;
const mockRouter = {
  push: jest.fn(),
};

(useRouter as jest.Mock).mockReturnValue(mockRouter);

describe('TemplatesTab Component - Unified Data Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Template Listing with Unified Model', () => {
    it('should render templates from unified Template model', async () => {
      // Arrange
      const mockTemplates = [
        {
          id: 'template-123',
          name: 'Welcome Template',
          status: 'APPROVED',
          category: 'UTILITY',
          language: 'pt_BR',
          type: 'WHATSAPP_OFFICIAL',
        },
        {
          id: 'template-456',
          name: 'Product Info Template',
          status: 'APPROVED',
          category: 'MARKETING',
          language: 'pt_BR',
          type: 'INTERACTIVE_MESSAGE',
        },
        {
          id: 'template-789',
          name: 'Support Template',
          status: 'APPROVED',
          category: 'UTILITY',
          language: 'pt_BR',
          type: 'AUTOMATION_REPLY',
        },
      ];

      mockAxios.get.mockResolvedValue({
        data: {
          success: true,
          templates: mockTemplates,
          isRealData: true,
          fromApi: false,
        },
      });

      // Act
      render(<TemplatesTab />);

      // Assert
      expect(screen.getByText('Templates do WhatsApp')).toBeInTheDocument();
      expect(screen.getByText('Gerencie os templates de mensagens disponíveis em sua conta.')).toBeInTheDocument();

      // Wait for templates to load
      await waitFor(() => {
        expect(screen.getByText('Welcome Template')).toBeInTheDocument();
        expect(screen.getByText('Product Info Template')).toBeInTheDocument();
        expect(screen.getByText('Support Template')).toBeInTheDocument();
      });

      // Verify API call was made
      expect(mockAxios.get).toHaveBeenCalledWith('/api/admin/mtf-diamante/templates');
    });

    it('should handle different template types from unified model', async () => {
      // Arrange
      const mockTemplates = [
        {
          id: 'whatsapp-official-123',
          name: 'Official WhatsApp Template',
          status: 'APPROVED',
          category: 'AUTHENTICATION',
          language: 'pt_BR',
          type: 'WHATSAPP_OFFICIAL',
        },
        {
          id: 'interactive-456',
          name: 'Interactive Message Template',
          status: 'APPROVED',
          category: 'UTILITY',
          language: 'pt_BR',
          type: 'INTERACTIVE_MESSAGE',
        },
        {
          id: 'automation-789',
          name: 'Automation Reply Template',
          status: 'APPROVED',
          category: 'MARKETING',
          language: 'pt_BR',
          type: 'AUTOMATION_REPLY',
        },
      ];

      mockAxios.get.mockResolvedValue({
        data: {
          success: true,
          templates: mockTemplates,
          isRealData: true,
          fromApi: false,
        },
      });

      // Act
      render(<TemplatesTab />);

      // Assert
      await waitFor(() => {
        // All template types should be displayed
        expect(screen.getByText('Official WhatsApp Template')).toBeInTheDocument();
        expect(screen.getByText('Interactive Message Template')).toBeInTheDocument();
        expect(screen.getByText('Automation Reply Template')).toBeInTheDocument();

        // Category badges should be displayed with correct colors
        expect(screen.getByText('AUTHENTICATION')).toBeInTheDocument();
        expect(screen.getByText('UTILITY')).toBeInTheDocument();
        expect(screen.getByText('MARKETING')).toBeInTheDocument();
      });
    });

    it('should filter templates by category using unified model', async () => {
      // Arrange
      const allTemplates = [
        {
          id: 'utility-1',
          name: 'Utility Template 1',
          status: 'APPROVED',
          category: 'UTILITY',
          language: 'pt_BR',
        },
        {
          id: 'marketing-1',
          name: 'Marketing Template 1',
          status: 'APPROVED',
          category: 'MARKETING',
          language: 'pt_BR',
        },
      ];

      const utilityTemplates = [
        {
          id: 'utility-1',
          name: 'Utility Template 1',
          status: 'APPROVED',
          category: 'UTILITY',
          language: 'pt_BR',
        },
      ];

      // Mock initial load with all templates
      mockAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          templates: allTemplates,
          isRealData: true,
          fromApi: false,
        },
      });

      // Mock filtered load with utility templates only
      mockAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          templates: utilityTemplates,
          isRealData: true,
          fromApi: false,
        },
      });

      // Act
      render(<TemplatesTab />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Utility Template 1')).toBeInTheDocument();
        expect(screen.getByText('Marketing Template 1')).toBeInTheDocument();
      });

      // Filter by UTILITY category
      const categorySelect = screen.getByDisplayValue('Todas');
      fireEvent.click(categorySelect);
      
      const utilityOption = screen.getByText('Utilidade');
      fireEvent.click(utilityOption);

      // Assert
      await waitFor(() => {
        expect(mockAxios.get).toHaveBeenCalledWith('/api/admin/mtf-diamante/templates?category=UTILITY');
      });
    });

    it('should sync templates with Meta API', async () => {
      // Arrange
      const initialTemplates: any[] = [];
      const syncedTemplates = [
        {
          id: 'synced-123',
          name: 'Synced Template',
          status: 'APPROVED',
          category: 'UTILITY',
          language: 'pt_BR',
        },
      ];

      // Mock initial empty load
      mockAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          templates: initialTemplates,
          isRealData: false,
          fromApi: false,
        },
      });

      // Mock sync response
      mockAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          templates: syncedTemplates,
          isRealData: true,
          fromApi: true,
        },
      });

      // Act
      render(<TemplatesTab />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Nenhum template encontrado')).toBeInTheDocument();
      });

      // Click sync button
      const syncButton = screen.getByText('Sincronizar com Meta');
      fireEvent.click(syncButton);

      // Assert
      await waitFor(() => {
        expect(mockAxios.get).toHaveBeenCalledWith('/api/admin/mtf-diamante/templates?refresh=true');
        expect(mockToast.success).toHaveBeenCalledWith('1 templates sincronizados com sucesso');
        expect(screen.getByText('Synced Template')).toBeInTheDocument();
      });
    });
  });

  describe('Template Navigation and Actions', () => {
    it('should navigate to template details when clicked', async () => {
      // Arrange
      const mockTemplates = [
        {
          id: 'template-details-123',
          name: 'Clickable Template',
          status: 'APPROVED',
          category: 'UTILITY',
          language: 'pt_BR',
        },
      ];

      mockAxios.get.mockResolvedValue({
        data: {
          success: true,
          templates: mockTemplates,
          isRealData: true,
          fromApi: false,
        },
      });

      // Act
      render(<TemplatesTab />);

      // Wait for templates to load
      await waitFor(() => {
        expect(screen.getByText('Clickable Template')).toBeInTheDocument();
      });

      // Click on template name
      const templateLink = screen.getByText('Clickable Template');
      fireEvent.click(templateLink);

      // Assert
      expect(mockRouter.push).toHaveBeenCalledWith('/admin/mtf-diamante/templates/template-details-123');
    });

    it('should copy template ID to clipboard', async () => {
      // Arrange
      const mockTemplates = [
        {
          id: 'copy-template-123',
          name: 'Copy Template',
          status: 'APPROVED',
          category: 'UTILITY',
          language: 'pt_BR',
        },
      ];

      mockAxios.get.mockResolvedValue({
        data: {
          success: true,
          templates: mockTemplates,
          isRealData: true,
          fromApi: false,
        },
      });

      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn().mockResolvedValue(undefined),
        },
      });

      // Act
      render(<TemplatesTab />);

      // Wait for templates to load
      await waitFor(() => {
        expect(screen.getByText('Copy Template')).toBeInTheDocument();
      });

      // Click copy button
      const copyButtons = screen.getAllByRole('button');
      const copyButton = copyButtons.find(button => 
        button.querySelector('svg') // Find button with copy icon
      );
      
      if (copyButton) {
        fireEvent.click(copyButton);
      }

      // Assert
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('copy-template-123');
        expect(mockToast.success).toHaveBeenCalledWith('ID copiado!');
      });
    });

    it('should navigate to create template view', () => {
      // Act
      render(<TemplatesTab />);

      // Click "Novo Template" button
      const createButton = screen.getByText('Novo Template');
      fireEvent.click(createButton);

      // Assert
      expect(screen.getByText('Criar Novo Template')).toBeInTheDocument();
      expect(screen.getByText('Crie um novo template para envio de mensagens via WhatsApp')).toBeInTheDocument();
    });

    it('should show back button in create view and return to list', () => {
      // Act
      render(<TemplatesTab />);

      // Navigate to create view
      const createButton = screen.getByText('Novo Template');
      fireEvent.click(createButton);

      expect(screen.getByText('Criar Novo Template')).toBeInTheDocument();

      // Click back button
      const backButton = screen.getByRole('button', { name: /back/i });
      fireEvent.click(backButton);

      // Assert
      expect(screen.getByText('Templates do WhatsApp')).toBeInTheDocument();
      expect(screen.getByText('Gerencie os templates de mensagens disponíveis em sua conta.')).toBeInTheDocument();
    });
  });

  describe('Error Handling and Loading States', () => {
    it('should display loading state while fetching templates', () => {
      // Arrange
      mockAxios.get.mockImplementation(() => new Promise(() => {})); // Never resolves

      // Act
      render(<TemplatesTab />);

      // Assert
      expect(screen.getByRole('status')).toBeInTheDocument(); // Loading spinner
    });

    it('should display error message when API fails', async () => {
      // Arrange
      mockAxios.get.mockRejectedValue(new Error('Network error'));

      // Act
      render(<TemplatesTab />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Erro')).toBeInTheDocument();
        expect(screen.getByText('Erro de rede ao carregar os templates')).toBeInTheDocument();
      });
    });

    it('should display API error message when response indicates failure', async () => {
      // Arrange
      mockAxios.get.mockResolvedValue({
        data: {
          success: false,
          details: 'Invalid API credentials',
          templates: [],
        },
      });

      // Act
      render(<TemplatesTab />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Erro')).toBeInTheDocument();
        expect(screen.getByText('Invalid API credentials')).toBeInTheDocument();
      });
    });

    it('should show empty state when no templates are found', async () => {
      // Arrange
      mockAxios.get.mockResolvedValue({
        data: {
          success: true,
          templates: [],
          isRealData: true,
          fromApi: false,
        },
      });

      // Act
      render(<TemplatesTab />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Nenhum template encontrado')).toBeInTheDocument();
        expect(screen.getByText('Tente sincronizar com a API ou criar um novo template')).toBeInTheDocument();
      });
    });

    it('should show sync loading state', async () => {
      // Arrange
      const initialTemplates: any[] = [];

      mockAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          templates: initialTemplates,
          isRealData: false,
          fromApi: false,
        },
      });

      // Mock slow sync response
      mockAxios.get.mockImplementation(() => new Promise(() => {}));

      // Act
      render(<TemplatesTab />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Nenhum template encontrado')).toBeInTheDocument();
      });

      // Click sync button
      const syncButton = screen.getByText('Sincronizar com Meta');
      fireEvent.click(syncButton);

      // Assert
      expect(screen.getByText('Sincronizando...')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument(); // Loading spinner in sync button
    });
  });

  describe('Data Source Indicators', () => {
    it('should show correct data source badge for API data', async () => {
      // Arrange
      mockAxios.get.mockResolvedValue({
        data: {
          success: true,
          templates: [
            {
              id: 'api-template-123',
              name: 'API Template',
              status: 'APPROVED',
              category: 'UTILITY',
              language: 'pt_BR',
            },
          ],
          isRealData: true,
          fromApi: true,
        },
      });

      // Act
      render(<TemplatesTab />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Via API')).toBeInTheDocument();
        expect(screen.getByText('Dados reais')).toBeInTheDocument();
      });
    });

    it('should show correct data source badge for database data', async () => {
      // Arrange
      mockAxios.get.mockResolvedValue({
        data: {
          success: true,
          templates: [
            {
              id: 'db-template-123',
              name: 'Database Template',
              status: 'APPROVED',
              category: 'UTILITY',
              language: 'pt_BR',
            },
          ],
          isRealData: true,
          fromApi: false,
        },
      });

      // Act
      render(<TemplatesTab />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Banco de Dados')).toBeInTheDocument();
        expect(screen.getByText('Dados reais')).toBeInTheDocument();
      });
    });

    it('should show simulated data badge when isRealData is false', async () => {
      // Arrange
      mockAxios.get.mockResolvedValue({
        data: {
          success: true,
          templates: [
            {
              id: 'sim-template-123',
              name: 'Simulated Template',
              status: 'APPROVED',
              category: 'UTILITY',
              language: 'pt_BR',
            },
          ],
          isRealData: false,
          fromApi: false,
        },
      });

      // Act
      render(<TemplatesTab />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Banco de Dados')).toBeInTheDocument();
        expect(screen.getByText('Simulado')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility and User Experience', () => {
    it('should have proper ARIA labels and roles', async () => {
      // Arrange
      mockAxios.get.mockResolvedValue({
        data: {
          success: true,
          templates: [
            {
              id: 'accessible-template-123',
              name: 'Accessible Template',
              status: 'APPROVED',
              category: 'UTILITY',
              language: 'pt_BR',
            },
          ],
          isRealData: true,
          fromApi: false,
        },
      });

      // Act
      render(<TemplatesTab />);

      // Assert
      await waitFor(() => {
        // Check for proper form labels
        expect(screen.getByLabelText('Categoria')).toBeInTheDocument();
        expect(screen.getByLabelText('Idioma')).toBeInTheDocument();

        // Check for proper button roles
        expect(screen.getByRole('button', { name: /Novo Template/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Sincronizar com Meta/i })).toBeInTheDocument();
      });
    });

    it('should support keyboard navigation', async () => {
      // Arrange
      mockAxios.get.mockResolvedValue({
        data: {
          success: true,
          templates: [
            {
              id: 'keyboard-template-123',
              name: 'Keyboard Template',
              status: 'APPROVED',
              category: 'UTILITY',
              language: 'pt_BR',
            },
          ],
          isRealData: true,
          fromApi: false,
        },
      });

      // Act
      render(<TemplatesTab />);

      // Assert
      await waitFor(() => {
        const templateLink = screen.getByText('Keyboard Template');
        expect(templateLink).toBeInTheDocument();
        
        // Template name should be focusable (it's a button)
        templateLink.focus();
        expect(document.activeElement).toBe(templateLink);
      });
    });
  });
});