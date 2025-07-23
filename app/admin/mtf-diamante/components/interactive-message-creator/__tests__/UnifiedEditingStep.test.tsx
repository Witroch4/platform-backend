import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { UnifiedEditingStep } from '../UnifiedEditingStep'
import type { InteractiveMessage, ButtonReaction } from '@/types/interactive-messages'

// Mock dependencies
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))

jest.mock('../../shared/InteractivePreview', () => ({
  InteractivePreview: ({ message, reactions }: any) => (
    <div data-testid="interactive-preview">
      <div data-testid="preview-message-name">{message.name}</div>
      <div data-testid="preview-body-text">{message.body.text}</div>
      <div data-testid="preview-reactions-count">{reactions.length}</div>
    </div>
  ),
}))

jest.mock('../../shared/WhatsAppTextEditor', () => ({
  WhatsAppTextEditor: ({ initialText, onChange, onSave, onClose, inline }: any) => {
    if (inline) {
      return (
        <textarea
          data-testid="whatsapp-text-editor-inline"
          value={initialText}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="WhatsApp Text Editor"
        />
      )
    }
    return (
      <div data-testid="whatsapp-text-editor-modal">
        <textarea
          data-testid="whatsapp-text-editor-textarea"
          defaultValue={initialText}
          onChange={(e) => onChange?.(e.target.value)}
        />
        <button onClick={() => onSave?.(initialText)}>Save</button>
        <button onClick={onClose}>Close</button>
      </div>
    )
  },
}))

jest.mock('../../shared/ButtonManager', () => ({
  ButtonManager: ({ buttons, onChange, reactions, onReactionChange }: any) => (
    <div data-testid="button-manager">
      <div data-testid="buttons-count">{buttons.length}</div>
      <button
        data-testid="add-button"
        onClick={() => onChange([...buttons, { id: 'new-btn', title: 'New Button', type: 'reply' }])}
      >
        Add Button
      </button>
      {buttons.map((button: any) => (
        <div key={button.id} data-testid={`button-${button.id}`}>
          {button.title}
        </div>
      ))}
    </div>
  ),
}))

jest.mock('../../shared/MediaUploadComponent', () => ({
  MediaUploadComponent: ({ value, onChange, mediaType }: any) => (
    <div data-testid={`media-upload-${mediaType}`}>
      <input
        data-testid={`media-input-${mediaType}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${mediaType} URL`}
      />
    </div>
  ),
}))

jest.mock('../../shared/ReactionConfigManager', () => ({
  ReactionConfigManager: ({ isOpen, onClose, buttonText }: any) => 
    isOpen ? (
      <div data-testid="reaction-config-manager">
        <div data-testid="reaction-button-text">{buttonText}</div>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

describe('UnifiedEditingStep', () => {
  const mockMessage: InteractiveMessage = {
    id: 'test-message',
    name: 'Test Message',
    type: 'button',
    body: { text: 'Hello World' },
    isActive: true,
    action: {
      type: 'button',
      buttons: [
        { id: 'btn1', title: 'Button 1', type: 'reply' },
        { id: 'btn2', title: 'Button 2', type: 'reply' },
      ],
    },
  }

  const mockReactions: ButtonReaction[] = [
    {
      id: 'reaction1',
      buttonId: 'btn1',
      messageId: 'test-message',
      type: 'emoji',
      emoji: '👍',
      isActive: true,
    },
  ]

  const defaultProps = {
    message: mockMessage,
    reactions: mockReactions,
    onMessageUpdate: jest.fn(),
    onReactionUpdate: jest.fn(),
    onNext: jest.fn(),
    onBack: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders the dual-panel layout correctly', () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      expect(screen.getByText('Edit Message Content')).toBeInTheDocument()
      expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
      expect(screen.getByText('Message Configuration')).toBeInTheDocument()
      expect(screen.getByText('Live Preview')).toBeInTheDocument()
    })

    it('displays all configuration sections', () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      expect(screen.getByText('Message Configuration')).toBeInTheDocument()
      expect(screen.getByText('Header (Optional)')).toBeInTheDocument()
      expect(screen.getByText('Message Body *')).toBeInTheDocument()
      expect(screen.getByText('Footer (Optional)')).toBeInTheDocument()
      expect(screen.getByText('Interactive Buttons')).toBeInTheDocument()
    })

    it('shows interactive preview with real-time updates', () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      const preview = screen.getByTestId('interactive-preview')
      expect(preview).toBeInTheDocument()
      expect(screen.getByTestId('preview-message-name')).toHaveTextContent('Test Message')
      expect(screen.getByTestId('preview-body-text')).toHaveTextContent('Hello World')
    })

    it('displays navigation buttons', () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      expect(screen.getByText('Back to Type Selection')).toBeInTheDocument()
      expect(screen.getByText('Continue to Review')).toBeInTheDocument()
    })
  })

  describe('Message Name Configuration', () => {
    it('updates message name and validates in real-time', async () => {
      const onMessageUpdate = jest.fn()
      
      render(<UnifiedEditingStep {...defaultProps} onMessageUpdate={onMessageUpdate} />)

      const nameInput = screen.getByLabelText('Message Name *')
      fireEvent.change(nameInput, { target: { value: 'Updated Message Name' } })

      expect(onMessageUpdate).toHaveBeenCalledWith({ name: 'Updated Message Name' })
    })

    it('shows validation error for empty message name', async () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      const nameInput = screen.getByLabelText('Message Name *')
      fireEvent.change(nameInput, { target: { value: '' } })
      fireEvent.blur(nameInput)

      await waitFor(() => {
        expect(screen.getByText('Message name is required')).toBeInTheDocument()
      })
    })

    it('shows validation error for message name exceeding max length', async () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      const nameInput = screen.getByLabelText('Message Name *')
      const longName = 'a'.repeat(101) // Exceeds 100 character limit
      
      fireEvent.change(nameInput, { target: { value: longName } })

      await waitFor(() => {
        expect(screen.getByText('Name cannot exceed 100 characters')).toBeInTheDocument()
      })
    })

    it('displays character count for message name', () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      expect(screen.getByText('12/100')).toBeInTheDocument() // "Test Message" = 12 chars
    })
  })

  describe('Header Configuration', () => {
    it('shows text input for text header type', () => {
      const messageWithTextHeader = {
        ...mockMessage,
        header: { type: 'text' as const, content: 'Header Text' }
      }
      
      render(<UnifiedEditingStep {...defaultProps} message={messageWithTextHeader} />)

      expect(screen.getByLabelText('Header Text')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Header Text')).toBeInTheDocument()
    })

    it('shows media upload component for non-text header types', () => {
      const messageWithImageHeader = {
        ...mockMessage,
        header: { type: 'image' as const, content: '' }
      }
      
      render(<UnifiedEditingStep {...defaultProps} message={messageWithImageHeader} />)

      expect(screen.getByTestId('media-upload-image')).toBeInTheDocument()
    })

    it('validates header text length', async () => {
      const messageWithTextHeader = {
        ...mockMessage,
        header: { type: 'text' as const, content: '' }
      }
      
      render(<UnifiedEditingStep {...defaultProps} message={messageWithTextHeader} />)

      const headerInput = screen.getByLabelText('Header Text')
      const longText = 'a'.repeat(61) // Exceeds 60 character limit
      
      fireEvent.change(headerInput, { target: { value: longText } })

      await waitFor(() => {
        expect(screen.getByText('Header text cannot exceed 60 characters')).toBeInTheDocument()
      })
    })
  })

  describe('Body Text Configuration', () => {
    it('updates body text with inline editor', async () => {
      const onMessageUpdate = jest.fn()
      
      render(<UnifiedEditingStep {...defaultProps} onMessageUpdate={onMessageUpdate} />)

      const bodyEditor = screen.getByTestId('whatsapp-text-editor-inline')
      fireEvent.change(bodyEditor, { target: { value: 'Updated body text' } })

      expect(onMessageUpdate).toHaveBeenCalledWith({ body: { text: 'Updated body text' } })
    })

    it('opens rich text editor modal', async () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      const richEditorButton = screen.getByText('Rich Editor')
      fireEvent.click(richEditorButton)

      expect(screen.getByTestId('whatsapp-text-editor-modal')).toBeInTheDocument()
    })

    it('validates body text is required', async () => {
      const messageWithEmptyBody = {
        ...mockMessage,
        body: { text: '' }
      }
      
      render(<UnifiedEditingStep {...defaultProps} message={messageWithEmptyBody} />)

      const bodyEditor = screen.getByTestId('whatsapp-text-editor-inline')
      fireEvent.change(bodyEditor, { target: { value: '' } })
      fireEvent.blur(bodyEditor)

      await waitFor(() => {
        expect(screen.getByText('Message body is required')).toBeInTheDocument()
      })
    })

    it('validates body text length limit', async () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      const bodyEditor = screen.getByTestId('whatsapp-text-editor-inline')
      const longText = 'a'.repeat(1025) // Exceeds 1024 character limit
      
      fireEvent.change(bodyEditor, { target: { value: longText } })

      await waitFor(() => {
        expect(screen.getByText('Body text cannot exceed 1024 characters')).toBeInTheDocument()
      })
    })
  })

  describe('Footer Configuration', () => {
    it('updates footer text', async () => {
      const onMessageUpdate = jest.fn()
      
      render(<UnifiedEditingStep {...defaultProps} onMessageUpdate={onMessageUpdate} />)

      const footerInput = screen.getByLabelText('Footer Text')
      fireEvent.change(footerInput, { target: { value: 'Footer text' } })

      expect(onMessageUpdate).toHaveBeenCalledWith({ footer: { text: 'Footer text' } })
    })

    it('validates footer text length', async () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      const footerInput = screen.getByLabelText('Footer Text')
      const longText = 'a'.repeat(61) // Exceeds 60 character limit
      
      fireEvent.change(footerInput, { target: { value: longText } })

      await waitFor(() => {
        expect(screen.getByText('Footer text cannot exceed 60 characters')).toBeInTheDocument()
      })
    })

    it('opens rich text editor for footer', async () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      const richEditorButtons = screen.getAllByText('Rich Editor')
      const footerRichEditorButton = richEditorButtons[1] // Second one is for footer
      fireEvent.click(footerRichEditorButton)

      expect(screen.getByTestId('whatsapp-text-editor-modal')).toBeInTheDocument()
    })
  })

  describe('Button Management', () => {
    it('renders button manager for button type messages', () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      expect(screen.getByTestId('button-manager')).toBeInTheDocument()
      expect(screen.getByTestId('buttons-count')).toHaveTextContent('2')
    })

    it('does not render button manager for non-button type messages', () => {
      const listMessage = { ...mockMessage, type: 'list' as const }
      
      render(<UnifiedEditingStep {...defaultProps} message={listMessage} />)

      expect(screen.queryByTestId('button-manager')).not.toBeInTheDocument()
    })

    it('updates buttons when button manager changes', async () => {
      const onMessageUpdate = jest.fn()
      
      render(<UnifiedEditingStep {...defaultProps} onMessageUpdate={onMessageUpdate} />)

      const addButton = screen.getByTestId('add-button')
      fireEvent.click(addButton)

      expect(onMessageUpdate).toHaveBeenCalledWith({
        action: {
          type: 'button',
          buttons: [
            ...mockMessage.action!.buttons,
            { id: 'new-btn', title: 'New Button', type: 'reply' }
          ]
        }
      })
    })

    it('validates button count limit', async () => {
      const messageWithMaxButtons = {
        ...mockMessage,
        action: {
          type: 'button' as const,
          buttons: [
            { id: 'btn1', title: 'Button 1', type: 'reply' as const },
            { id: 'btn2', title: 'Button 2', type: 'reply' as const },
            { id: 'btn3', title: 'Button 3', type: 'reply' as const },
            { id: 'btn4', title: 'Button 4', type: 'reply' as const }, // Exceeds limit of 3
          ]
        }
      }
      
      render(<UnifiedEditingStep {...defaultProps} message={messageWithMaxButtons} />)

      await waitFor(() => {
        expect(screen.getByText('Cannot have more than 3 buttons')).toBeInTheDocument()
      })
    })
  })

  describe('Real-time Preview Updates', () => {
    it('updates preview when message name changes', async () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      const nameInput = screen.getByLabelText('Message Name *')
      fireEvent.change(nameInput, { target: { value: 'New Name' } })

      await waitFor(() => {
        expect(screen.getByTestId('preview-message-name')).toHaveTextContent('New Name')
      })
    })

    it('updates preview when body text changes', async () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      const bodyEditor = screen.getByTestId('whatsapp-text-editor-inline')
      fireEvent.change(bodyEditor, { target: { value: 'New body text' } })

      await waitFor(() => {
        expect(screen.getByTestId('preview-body-text')).toHaveTextContent('New body text')
      })
    })

    it('shows reaction indicators in preview', () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      expect(screen.getByTestId('preview-reactions-count')).toHaveTextContent('1')
    })
  })

  describe('Form Validation', () => {
    it('prevents navigation when form has errors', async () => {
      const onNext = jest.fn()
      const messageWithErrors = {
        ...mockMessage,
        name: '', // Invalid: empty name
        body: { text: '' } // Invalid: empty body
      }
      
      render(<UnifiedEditingStep {...defaultProps} message={messageWithErrors} onNext={onNext} />)

      const nextButton = screen.getByText('Continue to Review')
      fireEvent.click(nextButton)

      expect(onNext).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith('Please fix validation errors before proceeding')
    })

    it('allows navigation when form is valid', async () => {
      const onNext = jest.fn()
      
      render(<UnifiedEditingStep {...defaultProps} onNext={onNext} />)

      const nextButton = screen.getByText('Continue to Review')
      fireEvent.click(nextButton)

      expect(onNext).toHaveBeenCalled()
    })

    it('shows error indicator when form has validation errors', () => {
      const messageWithErrors = {
        ...mockMessage,
        name: '', // Invalid: empty name
      }
      
      render(<UnifiedEditingStep {...defaultProps} message={messageWithErrors} />)

      expect(screen.getByText('Please fix errors before continuing')).toBeInTheDocument()
    })

    it('disables next button when form has errors', () => {
      const messageWithErrors = {
        ...mockMessage,
        name: '', // Invalid: empty name
      }
      
      render(<UnifiedEditingStep {...defaultProps} message={messageWithErrors} />)

      const nextButton = screen.getByText('Continue to Review')
      expect(nextButton).toBeDisabled()
    })
  })

  describe('Navigation', () => {
    it('calls onBack when back button is clicked', async () => {
      const onBack = jest.fn()
      
      render(<UnifiedEditingStep {...defaultProps} onBack={onBack} />)

      const backButton = screen.getByText('Back to Type Selection')
      fireEvent.click(backButton)

      expect(onBack).toHaveBeenCalled()
    })

    it('calls onNext when next button is clicked with valid form', async () => {
      const onNext = jest.fn()
      
      render(<UnifiedEditingStep {...defaultProps} onNext={onNext} />)

      const nextButton = screen.getByText('Continue to Review')
      fireEvent.click(nextButton)

      expect(onNext).toHaveBeenCalled()
    })
  })

  describe('Disabled State', () => {
    it('disables all inputs when disabled prop is true', () => {
      render(<UnifiedEditingStep {...defaultProps} disabled={true} />)

      expect(screen.getByLabelText('Message Name *')).toBeDisabled()
      expect(screen.getByLabelText('Footer Text')).toBeDisabled()
      expect(screen.getByText('Back to Type Selection')).toBeDisabled()
      expect(screen.getByText('Continue to Review')).toBeDisabled()
    })
  })

  describe('Accessibility', () => {
    it('has proper labels for form inputs', () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      expect(screen.getByLabelText('Message Name *')).toBeInTheDocument()
      expect(screen.getByLabelText('Header Type')).toBeInTheDocument()
      expect(screen.getByLabelText('Body Text')).toBeInTheDocument()
      expect(screen.getByLabelText('Footer Text')).toBeInTheDocument()
    })

    it('shows validation errors with proper ARIA attributes', async () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      const nameInput = screen.getByLabelText('Message Name *')
      fireEvent.change(nameInput, { target: { value: '' } })
      fireEvent.blur(nameInput)

      await waitFor(() => {
        const errorMessage = screen.getByText('Message name is required')
        expect(errorMessage).toBeInTheDocument()
        expect(errorMessage).toHaveClass('text-destructive')
      })
    })

    it('has proper heading structure', () => {
      render(<UnifiedEditingStep {...defaultProps} />)

      expect(screen.getByRole('heading', { name: 'Edit Message Content' })).toBeInTheDocument()
      expect(screen.getByText('Message Configuration')).toBeInTheDocument()
      expect(screen.getByText('Live Preview')).toBeInTheDocument()
    })
  })
})