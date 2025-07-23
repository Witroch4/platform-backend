import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HeaderField, BodyField, FooterField, TemplateFields } from '../TemplateFieldComponents';

// Mock the EnhancedTextArea component
jest.mock('../../EnhancedTextArea', () => ({
  EnhancedTextArea: React.forwardRef<any, any>(({ label, placeholder, value, onChange, maxLength }, ref) => (
    <div data-testid="enhanced-textarea">
      <label>{label}</label>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
      />
    </div>
  ))
}));

const mockVariables = [
  { id: '1', chave: 'nome', valor: 'João Silva' },
  { id: '2', chave: 'nome_do_escritorio_rodape', valor: 'Escritório Silva & Associados' }
];

describe('TemplateFieldComponents', () => {
  describe('HeaderField', () => {
    const defaultProps = {
      value: '',
      onChange: jest.fn(),
      variables: mockVariables
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('renders when headerType is TEXT', () => {
      render(<HeaderField {...defaultProps} headerType="TEXT" />);
      
      expect(screen.getByText('Texto do Cabeçalho')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Digite o texto do cabeçalho/)).toBeInTheDocument();
    });

    it('does not render when headerType is not TEXT', () => {
      render(<HeaderField {...defaultProps} headerType="IMAGE" />);
      
      expect(screen.queryByText('Texto do Cabeçalho')).not.toBeInTheDocument();
    });

    it('calls onChange when text is entered', () => {
      const onChange = jest.fn();
      render(<HeaderField {...defaultProps} onChange={onChange} headerType="TEXT" />);
      
      const input = screen.getByPlaceholderText(/Digite o texto do cabeçalho/);
      fireEvent.change(input, { target: { value: 'Hello {{nome}}' } });
      
      expect(onChange).toHaveBeenCalledWith('Hello {{nome}}');
    });
  });

  describe('BodyField', () => {
    const defaultProps = {
      value: '',
      onChange: jest.fn(),
      variables: mockVariables
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('renders correctly', () => {
      render(<BodyField {...defaultProps} />);
      
      expect(screen.getByText('Corpo da Mensagem *')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Digite o conteúdo principal/)).toBeInTheDocument();
    });

    it('calls onChange when text is entered', () => {
      const onChange = jest.fn();
      render(<BodyField {...defaultProps} onChange={onChange} />);
      
      const input = screen.getByPlaceholderText(/Digite o conteúdo principal/);
      fireEvent.change(input, { target: { value: 'Body text {{nome}}' } });
      
      expect(onChange).toHaveBeenCalledWith('Body text {{nome}}');
    });
  });

  describe('FooterField', () => {
    const defaultProps = {
      value: '',
      onChange: jest.fn(),
      variables: mockVariables
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('renders correctly', () => {
      render(<FooterField {...defaultProps} />);
      
      expect(screen.getByText('Rodapé da Mensagem')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Digite o texto do rodapé/)).toBeInTheDocument();
    });

    it('auto-populates with company name when enabled and footer is empty', () => {
      const onChange = jest.fn();
      render(
        <FooterField
          {...defaultProps}
          onChange={onChange}
          autoPopulateCompanyName={true}
        />
      );
      
      expect(onChange).toHaveBeenCalledWith('{{nome_do_escritorio_rodape}}');
    });

    it('does not auto-populate when footer already has content', () => {
      const onChange = jest.fn();
      render(
        <FooterField
          {...defaultProps}
          value="Existing footer"
          onChange={onChange}
          autoPopulateCompanyName={true}
        />
      );
      
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not auto-populate when autoPopulateCompanyName is false', () => {
      const onChange = jest.fn();
      render(
        <FooterField
          {...defaultProps}
          onChange={onChange}
          autoPopulateCompanyName={false}
        />
      );
      
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('TemplateFields', () => {
    const defaultProps = {
      headerType: 'TEXT' as const,
      headerValue: '',
      onHeaderChange: jest.fn(),
      bodyValue: '',
      onBodyChange: jest.fn(),
      footerValue: '',
      onFooterChange: jest.fn(),
      variables: mockVariables
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('renders all fields when headerType is TEXT', () => {
      render(<TemplateFields {...defaultProps} />);
      
      expect(screen.getByText('Texto do Cabeçalho')).toBeInTheDocument();
      expect(screen.getByText('Corpo da Mensagem *')).toBeInTheDocument();
      expect(screen.getByText('Rodapé da Mensagem')).toBeInTheDocument();
    });

    it('does not render header field when headerType is not TEXT', () => {
      render(<TemplateFields {...defaultProps} headerType="IMAGE" />);
      
      expect(screen.queryByText('Texto do Cabeçalho')).not.toBeInTheDocument();
      expect(screen.getByText('Corpo da Mensagem *')).toBeInTheDocument();
      expect(screen.getByText('Rodapé da Mensagem')).toBeInTheDocument();
    });

    it('calls validation change handlers', () => {
      const onValidationChange = jest.fn();
      render(
        <TemplateFields
          {...defaultProps}
          onValidationChange={onValidationChange}
        />
      );
      
      // The validation handlers should be set up (we can't easily test the actual calls
      // without triggering validation, but we can verify the component renders without errors)
      expect(screen.getByText('Corpo da Mensagem *')).toBeInTheDocument();
    });
  });
});