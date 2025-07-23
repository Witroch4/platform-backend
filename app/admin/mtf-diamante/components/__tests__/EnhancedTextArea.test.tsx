import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EnhancedTextArea } from '../EnhancedTextArea';

// Mock the variable converter
jest.mock('@/app/lib/variable-converter', () => ({
  variableConverter: {
    validateTemplate: jest.fn((text: string) => ({
      isValid: !text.includes('{{}}'),
      errors: text.includes('{{}}') ? ['Template contains empty variables. Variable names cannot be empty.'] : []
    })),
    getVariableStats: jest.fn((text: string) => {
      const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
      return {
        totalVariables: matches.length,
        uniqueVariables: new Set(matches).size,
        variableNames: matches.map(m => m.replace(/[{}]/g, ''))
      };
    })
  }
}));

const mockVariables = [
  { id: '1', chave: 'nome', valor: 'João Silva' },
  { id: '2', chave: 'protocolo', valor: 'ABC123' }
];

describe('EnhancedTextArea', () => {
  const defaultProps = {
    value: '',
    onChange: jest.fn(),
    variables: mockVariables
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with basic props', () => {
    render(<EnhancedTextArea {...defaultProps} />);
    
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
  });

  it('displays label and description when provided', () => {
    render(
      <EnhancedTextArea
        {...defaultProps}
        label="Test Label"
        description="Test description"
      />
    );
    
    expect(screen.getByText('Test Label')).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('shows character count when maxLength is provided', () => {
    render(
      <EnhancedTextArea
        {...defaultProps}
        value="Hello"
        maxLength={100}
      />
    );
    
    expect(screen.getByText('5/100')).toBeInTheDocument();
  });

  it('calls onChange when text is entered', () => {
    const onChange = jest.fn();
    render(<EnhancedTextArea {...defaultProps} onChange={onChange} />);
    
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello {{nome}}' } });
    
    expect(onChange).toHaveBeenCalledWith('Hello {{nome}}');
  });

  it('shows validation errors when showValidation is true', async () => {
    render(
      <EnhancedTextArea
        {...defaultProps}
        value="Hello {{}}"
        showValidation={true}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText(/Template contains empty variables/)).toBeInTheDocument();
    });
  });

  it('shows variable statistics when showVariableStats is true', async () => {
    render(
      <EnhancedTextArea
        {...defaultProps}
        value="Hello {{nome}} and {{protocolo}}"
        showVariableStats={true}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText(/2 variáveis encontradas/)).toBeInTheDocument();
    });
  });

  it('renders as single line input when multiline is false', () => {
    render(
      <EnhancedTextArea
        {...defaultProps}
        multiline={false}
      />
    );
    
    const input = screen.getByRole('textbox');
    expect(input.tagName).toBe('INPUT');
  });

  it('renders as textarea when multiline is true', () => {
    render(
      <EnhancedTextArea
        {...defaultProps}
        multiline={true}
      />
    );
    
    const textarea = screen.getByRole('textbox');
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('calls onValidationChange when validation state changes', async () => {
    const onValidationChange = jest.fn();
    
    const { rerender } = render(
      <EnhancedTextArea
        {...defaultProps}
        value="Valid text"
        showValidation={true}
        onValidationChange={onValidationChange}
      />
    );
    
    await waitFor(() => {
      expect(onValidationChange).toHaveBeenCalledWith(true, []);
    });
    
    rerender(
      <EnhancedTextArea
        {...defaultProps}
        value="Invalid {{}}"
        showValidation={true}
        onValidationChange={onValidationChange}
      />
    );
    
    await waitFor(() => {
      expect(onValidationChange).toHaveBeenCalledWith(false, ['Template contains empty variables. Variable names cannot be empty.']);
    });
  });

  it('is disabled when disabled prop is true', () => {
    render(<EnhancedTextArea {...defaultProps} disabled={true} />);
    
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();
  });
});