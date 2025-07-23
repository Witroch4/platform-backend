/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import ReviewStep from '../ReviewStep'
import type { InteractiveMessage, ButtonReaction } from '@/types/interactive-messages'

// Mock dependencies
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('../../shared/InteractivePreview', () => ({
  InteractivePreview: ({ message, reactions }: any) => (
    <div data-testid="interactive-preview">
      <div>Message: {message.name}</div>
      <div>Body: {message.body.text}</div>
      <div>Reactions: {reactions.length}</div>
    </div>
  ),
}))

// Mock fetch globally
global.fetch = jest.fn()

describe('ReviewStep', () => {
  const mockMessage: InteractiveMessage = {
    id: 'test-message-1',
    name: 'Test Message',
    type: 'button',
    body: { text: 'This is a test message body' },
    header: {
      type: 'text',
      content: 'Test Header'
    },
    footer: { text: 'Test Footer' },
    action: {
      type: 'button',
      buttons: [
        { id: 'btn-1', title: 'Button 1', payload: 'payload-1' },
        { id: 'btn-2', title: 'Button 2', payload: 'payload-2' }
      ]
    },
    isActive: true
  }

  const mockReactions = [
    {
      buttonId: 'btn-1',
      reaction: { type: 'emoji' as const, value: '👍' }
    },
    {
      buttonId: 'btn-2',
      reaction: { type: 'text' as const, value: 'Thank you!' }
    }
  ]

  const defaultProps = {
    message: mockMessage,
    reactions: mockReactions,
    caixaId: 'test-caixa-1',
    onBack: jest.fn(),
    onSave: jest.fn()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(fetch as jest.Mock).mockClear()
  })

  describe('Rendering', () => {
    it('renders step header correctly', () => {
      render(<ReviewStep {...defaultProps} />)
      
      expect(screen.getByText('Review & Save Message')).toBeInTheDocument()
      expect(screen.getByText('Review your message configuration before saving')).toBeInTheDocument()
      expect(screen.getByText('Step 3 of 3')).toBeInTheDocument()
    })

    it('displays message summary correctly', () => {
      render(<ReviewStep {...defaultProps} />)
      
      expect(screen.getByText('Test Message')).toBeInTheDocument()
      expect(screen.getByText('Quick Reply Buttons')).toBeInTheDocument()
      expect(screen.getByText('Header ✓')).toBeInTheDocument()
      expect(screen.getByText('Body ✓')).toBeInTheDocument()
      expect(screen.getByText('Footer ✓')).toBeInTheDocument()
      expect(screen.getByText('Buttons (2)')).toBeInTheDocument()
    })

    it('displays reaction configuration table', () => {
      render(<ReviewStep {...defaultProps} />)
      
      expect(screen.getByText('Automatic Reactions')).toBeInTheDocument()
      expect(screen.getByText('2 configured')).toBeInTheDocument()
      expect(screen.getByText('Button 1')).toBeInTheDocument()
      expect(screen.getByText('Button 2')).toBeInTheDocument()
      expect(screen.getByText('👍')).toBeInTheDocument()
      expect(screen.getByText('"Thank you!"')).toBeInTheDocument()
    })

    it('shows character counts', () => {
      render(<ReviewStep {...defaultProps} />)
      
      expect(screen.getByText('27/1024')).toBeInTheDocument() // Body text count
      expect(screen.getAllByText('11/60')).toHaveLength(2) // Header and Footer text counts
    })

    it('renders interactive preview', () => {
      render(<ReviewStep {...defaultProps} />)
      
      expect(screen.getByTestId('interactive-preview')).toBeInTheDocument()
      expect(screen.getByText('Message: Test Message')).toBeInTheDocument()
      expect(screen.getByText('Body: This is a test message body')).toBeInTheDocument()
      expect(screen.getByText('Reactions: 2')).toBeInTheDocument()
    })
  })

  describe('Message without reactions', () => {
    it('displays no reactions message when no reactions configured', () => {
      const propsWithoutReactions = {
        ...defaultProps,
        reactions: []
      }
      
      render(<ReviewStep {...propsWithoutReactions} />)
      
      expect(screen.getByText('No automatic reactions configured')).toBeInTheDocument()
      expect(screen.getByText('Buttons will work normally without automatic responses')).toBeInTheDocument()
    })
  })

  describe('Message without optional components', () => {
    it('handles message without header and footer', () => {
      const minimalMessage: InteractiveMessage = {
        name: 'Minimal Message',
        type: 'button',
        body: { text: 'Just body text' },
        isActive: true
      }
      
      render(<ReviewStep {...defaultProps} message={minimalMessage} reactions={[]} />)
      
      expect(screen.getByText('Header ✗')).toBeInTheDocument()
      expect(screen.getByText('Footer ✗')).toBeInTheDocument()
      expect(screen.getByText('Buttons (0)')).toBeInTheDocument()
    })
  })

  describe('Save functionality', () => {
    it('calls save API with correct payload for new message', async () => {
      const mockResponse = {
        success: true,
        messageId: 'new-message-id',
        reactionIds: ['reaction-1', 'reaction-2'],
        message: { id: 'new-message-id', ...mockMessage }
      }
      
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      render(<ReviewStep {...defaultProps} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/admin/mtf-diamante/messages-with-reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"caixaId":"test-caixa-1"')
        })
      })

      expect(toast.success).toHaveBeenCalledWith('Interactive message saved successfully!')
    })

    it('calls save API with correct payload for editing message', async () => {
      const mockResponse = {
        success: true,
        messageId: 'test-message-1',
        reactionIds: ['reaction-1', 'reaction-2'],
        message: mockMessage
      }
      
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      render(<ReviewStep {...defaultProps} editingMessage={mockMessage} />)
      
      const updateButton = screen.getByRole('button', { name: /update message/i })
      fireEvent.click(updateButton)

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/admin/mtf-diamante/messages-with-reactions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"messageId":"test-message-1"')
        })
      })

      expect(toast.success).toHaveBeenCalledWith('Interactive message updated successfully!')
    })

    it('handles save API error', async () => {
      const errorResponse = {
        error: 'Validation failed'
      }
      
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => errorResponse
      })

      render(<ReviewStep {...defaultProps} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Validation failed')
      })
    })

    it('handles network error', async () => {
      ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      render(<ReviewStep {...defaultProps} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Network error')
      })
    })

    it('shows loading state during save', async () => {
      ;(fetch as jest.Mock).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      )

      render(<ReviewStep {...defaultProps} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      fireEvent.click(saveButton)

      expect(screen.getByText('Saving...')).toBeInTheDocument()
      expect(saveButton).toBeDisabled()
    })

    it('shows success state after successful save', async () => {
      const mockResponse = {
        success: true,
        messageId: 'new-message-id',
        message: mockMessage
      }
      
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      render(<ReviewStep {...defaultProps} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Saved!')).toBeInTheDocument()
      })

      expect(screen.getByText('Message saved successfully! All configurations have been applied.')).toBeInTheDocument()
    })

    it('calls onSave callback after successful save', async () => {
      const mockResponse = {
        success: true,
        messageId: 'new-message-id',
        message: { content: mockMessage }
      }
      
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const onSaveMock = jest.fn()
      render(<ReviewStep {...defaultProps} onSave={onSaveMock} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(onSaveMock).toHaveBeenCalledWith(mockMessage)
      })
    })
  })

  describe('Validation', () => {
    it('disables save button when message name is empty', () => {
      const invalidMessage = { ...mockMessage, name: '' }
      render(<ReviewStep {...defaultProps} message={invalidMessage} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      expect(saveButton).toBeDisabled()
      expect(screen.getByText('Please ensure name and body text are provided')).toBeInTheDocument()
    })

    it('disables save button when message body is empty', () => {
      const invalidMessage = { ...mockMessage, body: { text: '' } }
      render(<ReviewStep {...defaultProps} message={invalidMessage} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      expect(saveButton).toBeDisabled()
    })

    it('enables save button when required fields are present', () => {
      render(<ReviewStep {...defaultProps} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      expect(saveButton).not.toBeDisabled()
    })
  })

  describe('Navigation', () => {
    it('calls onBack when back button is clicked', () => {
      const onBackMock = jest.fn()
      render(<ReviewStep {...defaultProps} onBack={onBackMock} />)
      
      const backButton = screen.getByRole('button', { name: /back to edit/i })
      fireEvent.click(backButton)
      
      expect(onBackMock).toHaveBeenCalled()
    })

    it('disables back button during save', async () => {
      ;(fetch as jest.Mock).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      )

      render(<ReviewStep {...defaultProps} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      fireEvent.click(saveButton)

      const backButton = screen.getByRole('button', { name: /back to edit/i })
      expect(backButton).toBeDisabled()
    })
  })

  describe('Send for Analysis', () => {
    it('shows Send for Analysis button for new messages', () => {
      render(<ReviewStep {...defaultProps} />)
      
      expect(screen.getByRole('button', { name: /send for analysis/i })).toBeInTheDocument()
    })

    it('does not show Send for Analysis button for editing messages', () => {
      render(<ReviewStep {...defaultProps} editingMessage={mockMessage} />)
      
      expect(screen.queryByRole('button', { name: /send for analysis/i })).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA labels and roles', () => {
      render(<ReviewStep {...defaultProps} />)
      
      expect(screen.getByRole('button', { name: /save message/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /back to edit/i })).toBeInTheDocument()
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    it('shows proper loading states with screen reader text', async () => {
      ;(fetch as jest.Mock).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      )

      render(<ReviewStep {...defaultProps} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      fireEvent.click(saveButton)

      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })
  })

  describe('Error handling', () => {
    it('displays error alert when save fails', async () => {
      ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('Server error'))

      render(<ReviewStep {...defaultProps} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument()
      })
    })

    it('clears error state on successful retry', async () => {
      // First call fails
      ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('Server error'))

      render(<ReviewStep {...defaultProps} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument()
      })

      // Second call succeeds
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, messageId: 'test', message: mockMessage })
      })

      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.queryByText('Server error')).not.toBeInTheDocument()
        expect(screen.getByText('Saved!')).toBeInTheDocument()
      })
    })
  })

  describe('Payload construction', () => {
    it('constructs correct payload for message with all components', async () => {
      const mockResponse = { success: true, messageId: 'test', message: mockMessage }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      render(<ReviewStep {...defaultProps} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(fetch).toHaveBeenCalled()
      })

      const callArgs = (fetch as jest.Mock).mock.calls[0]
      const payload = JSON.parse(callArgs[1].body)

      expect(payload).toEqual({
        caixaId: 'test-caixa-1',
        message: {
          name: 'Test Message',
          type: 'button',
          header: {
            type: 'text',
            text: 'Test Header',
            media_url: undefined,
            filename: undefined
          },
          body: {
            text: 'This is a test message body'
          },
          footer: {
            text: 'Test Footer'
          },
          action: {
            type: 'button',
            buttons: [
              { id: 'btn-1', title: 'Button 1', payload: 'payload-1' },
              { id: 'btn-2', title: 'Button 2', payload: 'payload-2' }
            ]
          }
        },
        reactions: [
          {
            buttonId: 'btn-1',
            reaction: { type: 'emoji', value: '👍' }
          },
          {
            buttonId: 'btn-2',
            reaction: { type: 'text', value: 'Thank you!' }
          }
        ]
      })
    })

    it('constructs correct payload for minimal message', async () => {
      const minimalMessage: InteractiveMessage = {
        name: 'Minimal Message',
        type: 'button',
        body: { text: 'Just body text' },
        isActive: true
      }

      const mockResponse = { success: true, messageId: 'test', message: minimalMessage }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      render(<ReviewStep {...defaultProps} message={minimalMessage} reactions={[]} />)
      
      const saveButton = screen.getByRole('button', { name: /save message/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(fetch).toHaveBeenCalled()
      })

      const callArgs = (fetch as jest.Mock).mock.calls[0]
      const payload = JSON.parse(callArgs[1].body)

      expect(payload).toEqual({
        caixaId: 'test-caixa-1',
        message: {
          name: 'Minimal Message',
          type: 'button',
          header: undefined,
          body: {
            text: 'Just body text'
          },
          footer: undefined,
          action: undefined
        },
        reactions: []
      })
    })
  })
})