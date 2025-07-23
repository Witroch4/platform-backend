import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { toast } from 'sonner'
import { InteractiveMessageCreator } from '../InteractiveMessageCreator'
import { useVariableManager } from '@/hooks/useVariableManager'
import type { InteractiveMessage } from '@/types/interactive-messages'

interface ButtonReaction {
  id: string
  buttonId: string
  messageId: string
  type: 'emoji' | 'text'
  emoji?: string
  textReaction?: string
  isActive: boolean
  createdAt: Date
}

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

const mockUseVariableManager = useVariableManager as jest.MockedFunction<typeof useVariableManager>

describe('InteractiveMessageCreator - Integration Tests', () => {
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

  describe('Complete 3-Step Workflow Integration', () => {
    it('should complete full message creation workflow with reactions', async () => {
      const user = userEvent.setup()
      const onSave = jest.fn()

      // Mock successful API response for atomic save
      ;(fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          messageId: 'msg-123',
          reactionIds: ['reaction-1', 'reaction-2'],
          message: {
            id: 'msg-123',
            name: 'Complete Test Message',
            type: 'button',
            content: {
              body: { text: 'Test message with reactions' },
              action: {
                buttons: [
                  { id: 'btn-1', title: 'Button 1', type: 'reply' },
                  { id: 'btn-2', title: 'Button 2', type: 'reply' }
                ]
              }
            }
          },
          reactions: [
            { id: 'reaction-1', buttonId: 'btn-1', type: 'emoji', emoji: '👍' },
            { id: 'reaction-2', buttonId: 'btn-2', type: 'text', textReaction: 'Thanks!' }
          ]
        }),
      } as Response)

      render(<InteractiveMessageCreator {...defaultProps} onSave={onSave} />)

      // Step 1: Type Selection
      expect(screen.getByText(/configure model/i)).toBeInTheDocument()
      
      const buttonTypeOption = screen.getByRole('button', { name: /button/i })
      await user.click(buttonTypeOption)

      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      // Step 2: Configuration with reactions
      const nameInput = screen.getByLabelText(/message name/i)
      await user.clear(nameInput)
      await user.type(nameInput, 'Complete Test Message')

      const bodyInput = screen.getByLabelText(/body text/i)
      await user.clear(bodyInput)
      await user.type(bodyInput, 'Test message with reactions')

      // Add buttons with reactions
      const addButtonBtn = screen.getByRole('button', { name: /add button/i })
      await user.click(addButtonBtn)

      const button1Input = screen.getByDisplayValue('Button 1')
      expect(button1Input).toBeInTheDocument()

      // Configure reaction for button 1 (emoji)
      const addReactionBtn1 = screen.getAllByRole('button', { name: /add reaction/i })[0]
      await user.click(addReactionBtn1)

      const emojiOption = screen.getByRole('button', { name: /react with emoji/i })
      await user.click(emojiOption)

      const emojiPicker = screen.getByTestId('emoji-picker')
      const thumbsUpEmoji = screen.getByText('👍')
      await user.click(thumbsUpEmoji)

      // Add second button
      await user.click(addButtonBtn)
      
      const button2Input = screen.getByDisplayValue('Button 2')
      expect(button2Input).toBeInTheDocument()

      // Configure reaction for button 2 (text)
      const addReactionBtn2 = screen.getAllByRole('button', { name: /add reaction/i })[1]
      await user.click(addReactionBtn2)

      const textOption = screen.getByRole('button', { name: /react with text/i })
      await user.click(textOption)

      const textInput = screen.getByLabelText(/reaction text/i)
      await user.type(textInput, 'Thanks!')

      // Verify preview shows reaction indicators
      expect(screen.getAllByText('⚡️')).toHaveLength(2) // Both buttons should show reaction indicators

      // Proceed to review step
      const nextBtn = screen.getByRole('button', { name: /next/i })
      await user.click(nextBtn)

      await waitFor(() => {
        expect(screen.getByText(/review & save/i)).toBeInTheDocument()
      })

      // Step 3: Review and Save
      expect(screen.getByText('Complete Test Message')).toBeInTheDocument()
      expect(screen.getByText('Test message with reactions')).toBeInTheDocument()
      
      // Verify reaction summary
      expect(screen.getByText('Button 1: 👍')).toBeInTheDocument()
      expect(screen.getByText('Button 2: Thanks!')).toBeInTheDocument()

      // Save the message
      const saveBtn = screen.getByRole('button', { name: /save/i })
      await user.click(saveBtn)

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/admin/mtf-diamante/messages-with-reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caixaId: 'caixa-123',
            message: expect.objectContaining({
              name: 'Complete Test Message',
              type: 'button',
              body: { text: 'Test message with reactions' }
            }),
            reactions: expect.arrayContaining([
              expect.objectContaining({
                buttonId: 'btn-1',
                reaction: { type: 'emoji', value: '👍' }
              }),
              expect.objectContaining({
                buttonId: 'btn-2',
                reaction: { type: 'text', value: 'Thanks!' }
              })
            ])
          })
        })
      })

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        id: 'msg-123',
        name: 'Complete Test Message'
      }))

      expect(toast.success).toHaveBeenCalledWith('Message saved successfully!')
    })

    it('should handle step navigation correctly', async () => {
      const user = userEvent.setup()
      
      render(<InteractiveMessageCreator {...defaultProps} />)

      // Start at step 1
      expect(screen.getByText(/configure model/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()

      // Move to step 2
      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      // Fill required fields
      await user.type(screen.getByLabelText(/message name/i), 'Test Message')
      await user.type(screen.getByLabelText(/body text/i), 'Test body')

      // Move to step 3
      await user.click(screen.getByRole('button', { name: /next/i }))

      await waitFor(() => {
        expect(screen.getByText(/review & save/i)).toBeInTheDocument()
      })

      // Navigate back to step 2
      await user.click(screen.getByRole('button', { name: /back/i }))

      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
        expect(screen.getByDisplayValue('Test Message')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Test body')).toBeInTheDocument()
      })

      // Navigate back to step 1
      await user.click(screen.getByRole('button', { name: /back/i }))

      await waitFor(() => {
        expect(screen.getByText(/configure model/i)).toBeInTheDocument()
      })
    })

    it('should prevent progression with invalid data', async () => {
      const user = userEvent.setup()
      
      render(<InteractiveMessageCreator {...defaultProps} />)

      // Move to step 2
      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      // Try to proceed without filling required fields
      const nextBtn = screen.getByRole('button', { name: /next/i })
      await user.click(nextBtn)

      // Should still be on step 2
      expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      expect(screen.queryByText(/review & save/i)).not.toBeInTheDocument()

      // Should show validation errors
      expect(screen.getByText(/message name is required/i)).toBeInTheDocument()
      expect(screen.getByText(/body text is required/i)).toBeInTheDocument()
    })
  })

  describe('Loading and Editing Existing Messages', () => {
    it('should load existing message with reactions for editing', async () => {
      const existingMessage: InteractiveMessage = {
        id: 'msg-existing',
        name: 'Existing Message',
        type: 'button',
        body: { text: 'Existing body text' },
        action: {
          buttons: [
            { id: 'existing-btn-1', title: 'Existing Button', type: 'reply' }
          ]
        },
        isActive: true,
      }

      const existingReactions: ButtonReaction[] = [
        {
          id: 'reaction-existing',
          buttonId: 'existing-btn-1',
          messageId: 'msg-existing',
          type: 'emoji',
          emoji: '🎉',
          isActive: true,
          createdAt: new Date(),
        }
      ]

      // Mock API response for loading reactions
      ;(fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reactions: existingReactions }),
      } as Response)

      render(
        <InteractiveMessageCreator 
          {...defaultProps} 
          editingMessage={existingMessage}
        />
      )

      // Should skip type selection and go to configuration
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
        expect(screen.getByDisplayValue('Existing Message')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Existing body text')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Existing Button')).toBeInTheDocument()
      })

      // Should load reactions
      expect(fetch).toHaveBeenCalledWith('/api/admin/mtf-diamante/button-reactions?messageId=msg-existing')
      
      // Should show reaction indicator
      await waitFor(() => {
        expect(screen.getByText('⚡️')).toBeInTheDocument()
      })
    })

    it('should update existing message and reactions atomically', async () => {
      const user = userEvent.setup()
      const onSave = jest.fn()

      const existingMessage: InteractiveMessage = {
        id: 'msg-existing',
        name: 'Existing Message',
        type: 'button',
        body: { text: 'Existing body text' },
        isActive: true,
      }

      // Mock successful update response
      ;(fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ reactions: [] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            messageId: 'msg-existing',
            reactionIds: ['new-reaction-1'],
            message: { ...existingMessage, name: 'Updated Message' },
            reactions: [{ id: 'new-reaction-1', buttonId: 'btn-1', type: 'emoji', emoji: '✨' }]
          }),
        } as Response)

      render(
        <InteractiveMessageCreator 
          {...defaultProps} 
          editingMessage={existingMessage}
          onSave={onSave}
        />
      )

      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      // Update message name
      const nameInput = screen.getByDisplayValue('Existing Message')
      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Message')

      // Add a button with reaction
      await user.click(screen.getByRole('button', { name: /add button/i }))
      
      const addReactionBtn = screen.getByRole('button', { name: /add reaction/i })
      await user.click(addReactionBtn)
      
      await user.click(screen.getByRole('button', { name: /react with emoji/i }))
      await user.click(screen.getByText('✨'))

      // Proceed to save
      await user.click(screen.getByRole('button', { name: /next/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/review & save/i)).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/admin/mtf-diamante/messages-with-reactions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: 'msg-existing',
            message: expect.objectContaining({
              name: 'Updated Message'
            }),
            reactions: expect.arrayContaining([
              expect.objectContaining({
                buttonId: 'btn-1',
                reaction: { type: 'emoji', value: '✨' }
              })
            ])
          })
        })
      })

      expect(onSave).toHaveBeenCalled()
    })
  })

  describe('Atomic Save Operations and Rollback Scenarios', () => {
    it('should handle successful atomic save operation', async () => {
      const user = userEvent.setup()
      const onSave = jest.fn()

      // Mock successful atomic save
      ;(fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          messageId: 'msg-123',
          reactionIds: ['reaction-1'],
          message: { id: 'msg-123', name: 'Test Message' },
          reactions: [{ id: 'reaction-1', buttonId: 'btn-1', type: 'emoji', emoji: '👍' }]
        }),
      } as Response)

      render(<InteractiveMessageCreator {...defaultProps} onSave={onSave} />)

      // Complete workflow
      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/message name/i), 'Test Message')
      await user.type(screen.getByLabelText(/body text/i), 'Test body')
      
      await user.click(screen.getByRole('button', { name: /add button/i }))
      await user.click(screen.getByRole('button', { name: /add reaction/i }))
      await user.click(screen.getByRole('button', { name: /react with emoji/i }))
      await user.click(screen.getByText('👍'))

      await user.click(screen.getByRole('button', { name: /next/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/review & save/i)).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/admin/mtf-diamante/messages-with-reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"caixaId":"caixa-123"')
        })
      })

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        id: 'msg-123',
        name: 'Test Message'
      }))
      expect(toast.success).toHaveBeenCalledWith('Message saved successfully!')
    })

    it('should handle atomic save failure with proper error handling', async () => {
      const user = userEvent.setup()
      const onSave = jest.fn()

      // Mock failed atomic save
      ;(fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'Database transaction failed',
          code: 'DATABASE_TRANSACTION_FAILED',
          requestId: 'req-123'
        }),
      } as Response)

      render(<InteractiveMessageCreator {...defaultProps} onSave={onSave} />)

      // Complete workflow
      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/message name/i), 'Test Message')
      await user.type(screen.getByLabelText(/body text/i), 'Test body')

      await user.click(screen.getByRole('button', { name: /next/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/review & save/i)).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to save message. Please try again.')
      })

      // Should not call onSave on failure
      expect(onSave).not.toHaveBeenCalled()
      
      // Should remain on review step for retry
      expect(screen.getByText(/review & save/i)).toBeInTheDocument()
    })

    it('should handle validation errors from server', async () => {
      const user = userEvent.setup()

      // Mock validation error response
      ;(fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Validation failed',
          code: 'VALIDATION_FAILED',
          details: [
            { field: 'message.body.text', message: 'Body text is required', code: 'required' },
            { field: 'reactions.0.buttonId', message: 'Button ID is required', code: 'required' }
          ]
        }),
      } as Response)

      render(<InteractiveMessageCreator {...defaultProps} />)

      // Complete workflow with invalid data
      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/message name/i), 'Test Message')
      // Intentionally skip body text to trigger validation error

      await user.click(screen.getByRole('button', { name: /next/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/review & save/i)).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Validation failed. Please check your input.')
      })

      // Should show specific validation errors
      expect(screen.getByText(/body text is required/i)).toBeInTheDocument()
      expect(screen.getByText(/button id is required/i)).toBeInTheDocument()
    })

    it('should handle network errors gracefully', async () => {
      const user = userEvent.setup()

      // Mock network error
      ;(fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('Network error')
      )

      render(<InteractiveMessageCreator {...defaultProps} />)

      // Complete workflow
      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/message name/i), 'Test Message')
      await user.type(screen.getByLabelText(/body text/i), 'Test body')

      await user.click(screen.getByRole('button', { name: /next/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/review & save/i)).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Network error. Please check your connection and try again.')
      })
    })
  })

  describe('Reaction Configuration Integration', () => {
    it('should configure emoji reactions correctly', async () => {
      const user = userEvent.setup()

      render(<InteractiveMessageCreator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/message name/i), 'Test Message')
      await user.type(screen.getByLabelText(/body text/i), 'Test body')

      // Add button and configure emoji reaction
      await user.click(screen.getByRole('button', { name: /add button/i }))
      
      const addReactionBtn = screen.getByRole('button', { name: /add reaction/i })
      await user.click(addReactionBtn)

      // Should show reaction type selection
      expect(screen.getByRole('button', { name: /react with emoji/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /react with text/i })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /react with emoji/i }))

      // Should show emoji picker
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()

      // Select emoji
      await user.click(screen.getByText('🎉'))

      // Should show reaction indicator in preview
      expect(screen.getByText('⚡️')).toBeInTheDocument()

      // Should show emoji in reaction config
      expect(screen.getByText('🎉')).toBeInTheDocument()
    })

    it('should configure text reactions correctly', async () => {
      const user = userEvent.setup()

      render(<InteractiveMessageCreator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/message name/i), 'Test Message')
      await user.type(screen.getByLabelText(/body text/i), 'Test body')

      // Add button and configure text reaction
      await user.click(screen.getByRole('button', { name: /add button/i }))
      
      const addReactionBtn = screen.getByRole('button', { name: /add reaction/i })
      await user.click(addReactionBtn)

      await user.click(screen.getByRole('button', { name: /react with text/i }))

      // Should show text input
      const textInput = screen.getByLabelText(/reaction text/i)
      expect(textInput).toBeInTheDocument()

      await user.type(textInput, 'Thank you for your selection!')

      // Should show reaction indicator in preview
      expect(screen.getByText('⚡️')).toBeInTheDocument()

      // Should show text in reaction config
      expect(screen.getByDisplayValue('Thank you for your selection!')).toBeInTheDocument()
    })

    it('should remove reactions correctly', async () => {
      const user = userEvent.setup()

      render(<InteractiveMessageCreator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/message name/i), 'Test Message')
      await user.type(screen.getByLabelText(/body text/i), 'Test body')

      // Add button and configure reaction
      await user.click(screen.getByRole('button', { name: /add button/i }))
      await user.click(screen.getByRole('button', { name: /add reaction/i }))
      await user.click(screen.getByRole('button', { name: /react with emoji/i }))
      await user.click(screen.getByText('👍'))

      // Should show reaction indicator
      expect(screen.getByText('⚡️')).toBeInTheDocument()

      // Remove reaction
      const removeReactionBtn = screen.getByRole('button', { name: /remove reaction/i })
      await user.click(removeReactionBtn)

      // Should not show reaction indicator
      expect(screen.queryByText('⚡️')).not.toBeInTheDocument()
    })

    it('should handle multiple buttons with different reaction types', async () => {
      const user = userEvent.setup()

      render(<InteractiveMessageCreator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/message name/i), 'Test Message')
      await user.type(screen.getByLabelText(/body text/i), 'Test body')

      // Add first button with emoji reaction
      await user.click(screen.getByRole('button', { name: /add button/i }))
      
      const addReactionBtns = screen.getAllByRole('button', { name: /add reaction/i })
      await user.click(addReactionBtns[0])
      await user.click(screen.getByRole('button', { name: /react with emoji/i }))
      await user.click(screen.getByText('👍'))

      // Add second button with text reaction
      await user.click(screen.getByRole('button', { name: /add button/i }))
      
      const updatedAddReactionBtns = screen.getAllByRole('button', { name: /add reaction/i })
      await user.click(updatedAddReactionBtns[1])
      await user.click(screen.getByRole('button', { name: /react with text/i }))
      
      const textInput = screen.getByLabelText(/reaction text/i)
      await user.type(textInput, 'Thanks!')

      // Should show both reaction indicators
      expect(screen.getAllByText('⚡️')).toHaveLength(2)

      // Proceed to review
      await user.click(screen.getByRole('button', { name: /next/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/review & save/i)).toBeInTheDocument()
      })

      // Should show both reactions in summary
      expect(screen.getByText('Button 1: 👍')).toBeInTheDocument()
      expect(screen.getByText('Button 2: Thanks!')).toBeInTheDocument()
    })
  })

  describe('Real-time Preview Integration', () => {
    it('should update preview in real-time as user types', async () => {
      const user = userEvent.setup()

      render(<InteractiveMessageCreator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText(/message name/i)
      const bodyInput = screen.getByLabelText(/body text/i)

      // Type in name field
      await user.type(nameInput, 'Dynamic Message')
      
      // Preview should update immediately
      expect(screen.getByText('Dynamic Message')).toBeInTheDocument()

      // Type in body field
      await user.type(bodyInput, 'This updates in real-time')
      
      // Preview should update immediately
      expect(screen.getByText('This updates in real-time')).toBeInTheDocument()
    })

    it('should show reaction indicators in preview when reactions are configured', async () => {
      const user = userEvent.setup()

      render(<InteractiveMessageCreator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/message name/i), 'Test Message')
      await user.type(screen.getByLabelText(/body text/i), 'Test body')

      // Add button - should not show reaction indicator initially
      await user.click(screen.getByRole('button', { name: /add button/i }))
      expect(screen.queryByText('⚡️')).not.toBeInTheDocument()

      // Configure reaction - should show indicator immediately
      await user.click(screen.getByRole('button', { name: /add reaction/i }))
      await user.click(screen.getByRole('button', { name: /react with emoji/i }))
      await user.click(screen.getByText('👍'))

      expect(screen.getByText('⚡️')).toBeInTheDocument()
    })

    it('should update preview when buttons are added or removed', async () => {
      const user = userEvent.setup()

      render(<InteractiveMessageCreator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/message name/i), 'Test Message')
      await user.type(screen.getByLabelText(/body text/i), 'Test body')

      // Initially no buttons in preview
      expect(screen.queryByRole('button', { name: /button 1/i })).not.toBeInTheDocument()

      // Add button - should appear in preview
      await user.click(screen.getByRole('button', { name: /add button/i }))
      expect(screen.getByText('Button 1')).toBeInTheDocument()

      // Add second button - should appear in preview
      await user.click(screen.getByRole('button', { name: /add button/i }))
      expect(screen.getByText('Button 2')).toBeInTheDocument()

      // Remove first button - should disappear from preview
      const removeButtons = screen.getAllByRole('button', { name: /remove button/i })
      await user.click(removeButtons[0])
      
      expect(screen.queryByText('Button 1')).not.toBeInTheDocument()
      expect(screen.getByText('Button 2')).toBeInTheDocument()
    })
  })

  describe('Error Handling and Validation Integration', () => {
    it('should show validation errors and prevent progression', async () => {
      const user = userEvent.setup()

      render(<InteractiveMessageCreator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      // Try to proceed without filling required fields
      await user.click(screen.getByRole('button', { name: /next/i }))

      // Should show validation errors
      expect(screen.getByText(/message name is required/i)).toBeInTheDocument()
      expect(screen.getByText(/body text is required/i)).toBeInTheDocument()

      // Should not proceed to next step
      expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      expect(screen.queryByText(/review & save/i)).not.toBeInTheDocument()
    })

    it('should clear validation errors when fields are filled', async () => {
      const user = userEvent.setup()

      render(<InteractiveMessageCreator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      // Try to proceed without filling required fields
      await user.click(screen.getByRole('button', { name: /next/i }))

      // Should show validation errors
      expect(screen.getByText(/message name is required/i)).toBeInTheDocument()

      // Fill the name field
      await user.type(screen.getByLabelText(/message name/i), 'Test Message')

      // Name validation error should disappear
      expect(screen.queryByText(/message name is required/i)).not.toBeInTheDocument()

      // Fill the body field
      await user.type(screen.getByLabelText(/body text/i), 'Test body')

      // Body validation error should disappear
      expect(screen.queryByText(/body text is required/i)).not.toBeInTheDocument()

      // Should now be able to proceed
      await user.click(screen.getByRole('button', { name: /next/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/review & save/i)).toBeInTheDocument()
      })
    })

    it('should handle API loading states correctly', async () => {
      const user = userEvent.setup()

      // Mock slow API response
      let resolvePromise: (value: any) => void
      const slowPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      ;(fetch as jest.MockedFunction<typeof fetch>).mockReturnValueOnce(slowPromise as any)

      render(<InteractiveMessageCreator {...defaultProps} />)

      // Complete workflow
      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/message name/i), 'Test Message')
      await user.type(screen.getByLabelText(/body text/i), 'Test body')

      await user.click(screen.getByRole('button', { name: /next/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/review & save/i)).toBeInTheDocument()
      })

      // Click save
      await user.click(screen.getByRole('button', { name: /save/i }))

      // Should show loading state
      expect(screen.getByRole('button', { name: /saving.../i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /saving.../i })).toBeDisabled()

      // Resolve the promise
      resolvePromise!({
        ok: true,
        json: async () => ({
          success: true,
          messageId: 'msg-123',
          message: { id: 'msg-123', name: 'Test Message' },
          reactions: []
        }),
      })

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /saving.../i })).not.toBeInTheDocument()
      })
    })
  })

  describe('Memory Management and Performance', () => {
    it('should cleanup properly on unmount', () => {
      const { unmount } = render(<InteractiveMessageCreator {...defaultProps} />)
      
      // Should unmount without errors or memory leaks
      expect(() => unmount()).not.toThrow()
    })

    it('should handle rapid state changes without performance issues', async () => {
      const user = userEvent.setup()

      render(<InteractiveMessageCreator {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /button/i }))
      
      await waitFor(() => {
        expect(screen.getByText(/edit model/i)).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText(/message name/i)
      const bodyInput = screen.getByLabelText(/body text/i)

      // Rapid typing should not cause performance issues
      await user.type(nameInput, 'Rapid typing test message name')
      await user.type(bodyInput, 'This is a test of rapid typing in the body field to ensure performance')

      // Add and remove buttons rapidly
      for (let i = 0; i < 5; i++) {
        await user.click(screen.getByRole('button', { name: /add button/i }))
      }

      const removeButtons = screen.getAllByRole('button', { name: /remove button/i })
      for (const button of removeButtons.slice(0, 3)) {
        await user.click(button)
      }

      // Should still be responsive
      expect(screen.getByDisplayValue('Rapid typing test message name')).toBeInTheDocument()
      expect(screen.getAllByText(/button \d+/i)).toHaveLength(2) // Should have 2 buttons remaining
    })
  })
})