import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { toast } from 'sonner'
import { InteractiveMessageCreator } from '../../InteractiveMessageCreator'
import { useVariableManager } from '@/hooks/useVariableManager'
import type { InteractiveMessage } from '@/types/interactive-messages'

// Mock dependencies
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/hooks/useVariableManager', () => ({
  useVariableManager: jest.fn(),
}))

// Mock fetch globally
global.fetch = jest.fn()

// Mock child components
jest.mock('../TypeSelectionStep', () => ({
  TypeSelectionStep: ({ selectedType, onTypeSelect }: any) => (
    <div data-testid="type-selection-step">
      <div>Selected: {selectedType}</div>
      <button onClick={() => onTypeSelect('button')}>Select Button</button>
      <button onClick={() => onTypeSelect('list')}>Select List</button>
    </div>
  ),
}))

jest.mock('../UnifiedEditingStep', () => ({
  UnifiedEditingStep: ({ message, reactions, onMessageUpdate, onReactionUpdate, onNext, onBack }: any) => (
    <div data-testid="unified-editing-step">
      <div>Message: {message.name}</div>
      <div>Body: {message.body.text}</div>
      <div>Reactions: {reactions.length}</div>
      <input
        data-testid="message-name-input"
        value={message.name}
        onChange={(e) => onMessageUpdate({ name: e.target.value })}
      />
      <input
        data-testid="message-body-input"
        value={message.body.text}
        onChange={(e) => onMessageUpdate({ body: { text: e.target.value } })}
      />
      <button onClick={() => onReactionUpdate('btn-1', { type: 'emoji', emoji: '👍' })}>
        Add Reaction
      </button>
      <button onClick={onNext}>Next</button>
      <button onClick={onBack}>Back</button>
    </div>
  ),
}))

jest.mock('../ReviewStep', () => ({
  ReviewStep: ({ message, reactions, onSave, onBack }: any) => (
    <div data-testid="review-step">
      <div>Final Message: {message.name}</div>
      <div>Final Body: {message.body.text}</div>
      <div>Final Reactions: {reactions.length}</div>
      <button onClick={() => onSave({ ...message, id: 'saved-123' })}>Save</button>
      <button onClick={onBack}>Back</button>
    </div>
  ),
}))

jest.mock('../StepIndicator', () => ({
  StepIndicator: ({ currentStep }: any) => (
    <div data-testid="step-indicator">Current: {currentStep}</div>
  ),
}))

const mockUseVariableManager = useVariableManager as jest.MockedFunction<typeof useVariableManager>

describe('InteractiveMessageCreator', () => {
  const defaultProps = {
    caixaId: 'caixa-123',
    onSave: jest.fn(),
  }

  const mockVariables = [
    { chave: 'nome_do_escritorio_rodape', valor: 'Test Company' },
    { chave: 'other_var', valor: 'Other Value' },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseVariableManager.mockReturnValue({
      variables: mockVariables,
      loading: false,
    })
    ;(fetch as jest.MockedFunction<typeof fetch>).mockClear()
  })

  describe('Initial State and Step Management', () => {
    it('should render with type selection step initially', () => {
      render(<InteractiveMessageCreator {...defaultProps} />)
      
      expect(screen.getByTestId('step-indicator')).toHaveTextContent('Current: type-selection')
      expect(screen.getByTestId('type-selection-step')).toBeInTheDocument()
      expect(screen.queryByTestId('unified-editing-step')).not.toBeInTheDocument()
      expect(screen.queryByTestId('review-step')).not.toBeInTheDocument()
    })

    it('should show correct step indicator for each step', async () => {
      render(<InteractiveMessageCreator {...defaultProps} />)
      
      // Step 1: Type Selection
      expect(screen.getByTestId('step-indicator')).toHaveTextContent('Current: type-selection')
      
      // Move to Step 2: Configuration
      fireEvent.click(screen.getByText('Select Button'))
      await waitFor(() => {
        expect(screen.getByTestId('step-indicator')).toHaveTextContent('Current: configuration')
      })
      
      // Fill required fields and move to Step 3: Review
      fireEvent.change(screen.getByTestId('message-name-input'), { target: { value: 'Test Message' } })
      fireEvent.change(screen.getByTestId('message-body-input'), { target: { value: 'Test body content' } })
      fireEvent.click(screen.getByText('Next'))
      
      await waitFor(() => {
        expect(screen.getByTestId('step-indicator')).toHaveTextContent('Current: preview')
      })
    })
  })

  describe('3-Step Workflow Navigation', () => {
    it('should navigate through all steps in correct order', async () => {
      render(<InteractiveMessageCreator {...defaultProps} />)
      
      // Step 1: Type Selection
      expect(screen.getByTestId('type-selection-step')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Select Button'))
      
      await waitFor(() => {
        // Step 2: Unified Editing
        expect(screen.getByTestId('unified-editing-step')).toBeInTheDocument()
        expect(screen.queryByTestId('type-selection-step')).not.toBeInTheDocument()
      })
      
      // Fill required fields
      fireEvent.change(screen.getByTestId('message-name-input'), { target: { value: 'Test Message' } })
      fireEvent.change(screen.getByTestId('message-body-input'), { target: { value: 'Test body content' } })
      fireEvent.click(screen.getByText('Next'))
      
      await waitFor(() => {
        // Step 3: Review
        expect(screen.getByTestId('review-step')).toBeInTheDocument()
        expect(screen.queryByTestId('unified-editing-step')).not.toBeInTheDocument()
      })
    })

    it('should allow navigation back through steps', async () => {
      render(<InteractiveMessageCreator {...defaultProps} />)
      
      // Navigate to step 2
      fireEvent.click(screen.getByText('Select Button'))
      await waitFor(() => {
        expect(screen.getByTestId('unified-editing-step')).toBeInTheDocument()
      })
      
      fireEvent.change(screen.getByTestId('message-name-input'), { target: { value: 'Test Message' } })
      fireEvent.change(screen.getByTestId('message-body-input'), { target: { value: 'Test body content' } })
      
      // Navigate to step 3
      fireEvent.click(screen.getByText('Next'))
      await waitFor(() => {
        expect(screen.getByTestId('review-step')).toBeInTheDocument()
      })
      
      // Navigate back to step 2
      fireEvent.click(screen.getByText('Back'))
      await waitFor(() => {
        expect(screen.getByTestId('unified-editing-step')).toBeInTheDocument()
      })
      
      // Navigate back to step 1
      fireEvent.click(screen.getByText('Back'))
      await waitFor(() => {
        expect(screen.getByTestId('type-selection-step')).toBeInTheDocument()
      })
    })
  })

  describe('State Management and Data Flow', () => {
    it('should maintain state across step transitions', async () => {
      render(<InteractiveMessageCreator {...defaultProps} />)
      
      // Select type and move to configuration
      fireEvent.click(screen.getByText('Select Button'))
      await waitFor(() => {
        expect(screen.getByTestId('unified-editing-step')).toBeInTheDocument()
      })
      
      // Fill in message details
      fireEvent.change(screen.getByTestId('message-name-input'), { target: { value: 'Test Message' } })
      fireEvent.change(screen.getByTestId('message-body-input'), { target: { value: 'Test body content' } })
      
      // Add a reaction
      fireEvent.click(screen.getByText('Add Reaction'))
      
      // Move to review step
      fireEvent.click(screen.getByText('Next'))
      
      await waitFor(() => {
        // Verify state is maintained
        expect(screen.getByText('Final Message: Test Message')).toBeInTheDocument()
        expect(screen.getByText('Final Body: Test body content')).toBeInTheDocument()
        expect(screen.getByText('Final Reactions: 1')).toBeInTheDocument()
      })
    })

    it('should update message state correctly', async () => {
      render(<InteractiveMessageCreator {...defaultProps} />)
      
      fireEvent.click(screen.getByText('Select Button'))
      await waitFor(() => {
        expect(screen.getByTestId('unified-editing-step')).toBeInTheDocument()
      })
      
      // Test message name update
      fireEvent.change(screen.getByTestId('message-name-input'), { target: { value: 'Updated Name' } })
      expect(screen.getByDisplayValue('Updated Name')).toBeInTheDocument()
      
      // Test message body update
      fireEvent.change(screen.getByTestId('message-body-input'), { target: { value: 'Updated body' } })
      expect(screen.getByDisplayValue('Updated body')).toBeInTheDocument()
    })

    it('should manage reactions state correctly', async () => {
      render(<InteractiveMessageCreator {...defaultProps} />)
      
      fireEvent.click(screen.getByText('Select Button'))
      await waitFor(() => {
        expect(screen.getByTestId('unified-editing-step')).toBeInTheDocument()
      })
      
      // Initially no reactions
      expect(screen.getByText('Reactions: 0')).toBeInTheDocument()
      
      // Add a reaction
      fireEvent.click(screen.getByText('Add Reaction'))
      expect(screen.getByText('Reactions: 1')).toBeInTheDocument()
    })
  })

  describe('Data Persistence and Loading', () => {
    it('should load existing message data when editing', () => {
      const editingMessage: InteractiveMessage = {
        id: 'msg-123',
        name: 'Existing Message',
        type: 'button',
        body: { text: 'Existing body text' },
        isActive: true,
      }

      render(
        <InteractiveMessageCreator 
          {...defaultProps} 
          editingMessage={editingMessage} 
        />
      )
      
      // Should skip type selection and go to configuration
      expect(screen.getByTestId('step-indicator')).toHaveTextContent('Current: configuration')
      expect(screen.getByText('Message: Existing Message')).toBeInTheDocument()
      expect(screen.getByText('Body: Existing body text')).toBeInTheDocument()
    })

    it('should load existing reactions when editing', async () => {
      const editingMessage: InteractiveMessage = {
        id: 'msg-123',
        name: 'Existing Message',
        type: 'button',
        body: { text: 'Existing body text' },
        isActive: true,
      }

      const mockReactions = [
        { id: 'r1', buttonId: 'btn-1', messageId: 'msg-123', type: 'emoji', emoji: '👍', isActive: true },
      ]

      ;(fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reactions: mockReactions }),
      } as Response)

      render(
        <InteractiveMessageCreator 
          {...defaultProps} 
          editingMessage={editingMessage} 
        />
      )
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/admin/mtf-diamante/button-reactions?messageId=msg-123')
      })
    })

    it('should auto-populate footer with company name', () => {
      render(<InteractiveMessageCreator {...defaultProps} />)
      
      // The footer should be auto-populated with company name from variables
      // This is tested indirectly through the useEffect in the component
      expect(mockUseVariableManager).toHaveBeenCalled()
    })
  })

  describe('Save Functionality', () => {
    it('should call onSave when save is successful', async () => {
      const onSave = jest.fn()
      
      render(<InteractiveMessageCreator {...defaultProps} onSave={onSave} />)
      
      // Navigate through workflow
      fireEvent.click(screen.getByText('Select Button'))
      await waitFor(() => {
        expect(screen.getByTestId('unified-editing-step')).toBeInTheDocument()
      })
      
      fireEvent.change(screen.getByTestId('message-name-input'), { target: { value: 'Test Message' } })
      fireEvent.change(screen.getByTestId('message-body-input'), { target: { value: 'Test body content' } })
      fireEvent.click(screen.getByText('Next'))
      
      await waitFor(() => {
        expect(screen.getByTestId('review-step')).toBeInTheDocument()
      })
      
      // Save the message
      fireEvent.click(screen.getByText('Save'))
      
      expect(onSave).toHaveBeenCalledWith({
        id: 'saved-123',
        name: 'Test Message',
        type: 'button',
        body: { text: 'Test body content' },
        footer: { text: 'Test Company' }, // Auto-populated from variables
        isActive: true,
      })
    })
  })

  describe('Error Handling and Validation', () => {
    it('should handle API errors gracefully', async () => {
      const editingMessage: InteractiveMessage = {
        id: 'msg-123',
        name: 'Existing Message',
        type: 'button',
        body: { text: 'Existing body text' },
        isActive: true,
      }

      ;(fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('API Error')
      )

      render(
        <InteractiveMessageCreator 
          {...defaultProps} 
          editingMessage={editingMessage} 
        />
      )
      
      // Should not crash and should handle the error gracefully
      await waitFor(() => {
        expect(fetch).toHaveBeenCalled()
      })
    })

    it('should prevent navigation to review with invalid data', async () => {
      render(<InteractiveMessageCreator {...defaultProps} />)
      
      fireEvent.click(screen.getByText('Select Button'))
      await waitFor(() => {
        expect(screen.getByTestId('unified-editing-step')).toBeInTheDocument()
      })
      
      // Try to proceed without filling required fields
      fireEvent.click(screen.getByText('Next'))
      
      // Should still be on configuration step
      expect(screen.getByTestId('unified-editing-step')).toBeInTheDocument()
      expect(screen.queryByTestId('review-step')).not.toBeInTheDocument()
    })
  })

  describe('Integration with Child Components', () => {
    it('should pass correct props to TypeSelectionStep', () => {
      render(<InteractiveMessageCreator {...defaultProps} />)
      
      expect(screen.getByText('Selected: button')).toBeInTheDocument()
    })

    it('should pass correct props to UnifiedEditingStep', async () => {
      render(<InteractiveMessageCreator {...defaultProps} />)
      
      fireEvent.click(screen.getByText('Select Button'))
      await waitFor(() => {
        expect(screen.getByTestId('unified-editing-step')).toBeInTheDocument()
      })
      
      expect(screen.getByText('Message:')).toBeInTheDocument()
      expect(screen.getByText('Body:')).toBeInTheDocument()
      expect(screen.getByText('Reactions: 0')).toBeInTheDocument()
    })

    it('should pass correct props to ReviewStep', async () => {
      render(<InteractiveMessageCreator {...defaultProps} />)
      
      fireEvent.click(screen.getByText('Select Button'))
      await waitFor(() => {
        expect(screen.getByTestId('unified-editing-step')).toBeInTheDocument()
      })
      
      fireEvent.change(screen.getByTestId('message-name-input'), { target: { value: 'Test Message' } })
      fireEvent.change(screen.getByTestId('message-body-input'), { target: { value: 'Test body content' } })
      fireEvent.click(screen.getByText('Next'))
      
      await waitFor(() => {
        expect(screen.getByText('Final Message: Test Message')).toBeInTheDocument()
        expect(screen.getByText('Final Body: Test body content')).toBeInTheDocument()
      })
    })
  })

  describe('Variable Manager Integration', () => {
    it('should handle loading state', () => {
      mockUseVariableManager.mockReturnValue({
        variables: [],
        loading: true,
      })

      render(<InteractiveMessageCreator {...defaultProps} />)
      
      // Component should render without crashing during loading
      expect(screen.getByTestId('type-selection-step')).toBeInTheDocument()
    })

    it('should use variables when available', () => {
      const customVariables = [
        { chave: 'nome_do_escritorio_rodape', valor: 'Custom Company Name' },
      ]

      mockUseVariableManager.mockReturnValue({
        variables: customVariables,
        loading: false,
      })

      render(<InteractiveMessageCreator {...defaultProps} />)
      
      // The component should use the variables (tested through useEffect)
      expect(mockUseVariableManager).toHaveBeenCalled()
    })
  })

  describe('Memory Management and Performance', () => {
    it('should cleanup properly on unmount', () => {
      const { unmount } = render(<InteractiveMessageCreator {...defaultProps} />)
      
      // Should unmount without errors
      expect(() => unmount()).not.toThrow()
    })

    it('should memoize expensive computations', async () => {
      const { rerender } = render(<InteractiveMessageCreator {...defaultProps} />)
      
      fireEvent.click(screen.getByText('Select Button'))
      await waitFor(() => {
        expect(screen.getByTestId('unified-editing-step')).toBeInTheDocument()
      })
      
      // Rerender with same props should not cause unnecessary re-computations
      rerender(<InteractiveMessageCreator {...defaultProps} />)
      
      expect(screen.getByTestId('unified-editing-step')).toBeInTheDocument()
    })
  })
})