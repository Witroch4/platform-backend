import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import { TemplatePreview, CreateTemplateComponent } from '../template-preview';
import { MtfDiamanteVariavel } from '@/app/lib/variable-converter';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light' }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

const mockVariables: MtfDiamanteVariavel[] = [
  { chave: 'nome', valor: 'João Silva' },
  { chave: 'protocolo', valor: 'ABC123' },
  { chave: 'chave_pix', valor: '12345678901' }
];

const mockTemplateComponents: CreateTemplateComponent[] = [
  {
    type: 'header',
    text: 'Olá {{nome}}, seu protocolo é {{protocolo}}'
  },
  {
    type: 'body',
    text: 'Sua chave PIX é {{chave_pix}}. Use o código {{protocolo}} para referência.'
  },
  {
    type: 'footer',
    text: 'Atenciosamente, {{nome_do_escritorio_rodape}}'
  }
];

describe('TemplatePreview', () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider attribute="class" defaultTheme="light">
        {component}
      </ThemeProvider>
    );
  };

  describe('Variable Rendering', () => {
    it('should render template mode with numbered variables and examples', () => {
      renderWithTheme(
        <TemplatePreview
          components={mockTemplateComponents}
          useAlternativeFormat={true}
          variables={mockVariables}
          previewMode="template"
        />
      );

      // Check if numbered variables with examples are displayed
      expect(screen.getByText(/{{1}} \(João Silva\)/)).toBeInTheDocument();
      expect(screen.getByText(/{{2}} \(ABC123\)/)).toBeInTheDocument();
      expect(screen.getByText(/{{3}} \(12345678901\)/)).toBeInTheDocument();
    });

    it('should render interactive mode with actual variable values', () => {
      renderWithTheme(
        <TemplatePreview
          components={mockTemplateComponents}
          useAlternativeFormat={true}
          variables={mockVariables}
          previewMode="interactive"
        />
      );

      // Check if actual variable values are displayed
      expect(screen.getByText(/Olá João Silva, seu protocolo é ABC123/)).toBeInTheDocument();
      expect(screen.getByText(/Sua chave PIX é 12345678901/)).toBeInTheDocument();
    });

    it('should handle templates without variables', () => {
      const componentsWithoutVariables: CreateTemplateComponent[] = [
        {
          type: 'body',
          text: 'Esta é uma mensagem sem variáveis.'
        }
      ];

      renderWithTheme(
        <TemplatePreview
          components={componentsWithoutVariables}
          useAlternativeFormat={true}
          variables={[]}
          previewMode="template"
        />
      );

      expect(screen.getByText('Esta é uma mensagem sem variáveis.')).toBeInTheDocument();
    });

    it('should handle missing variable values gracefully', () => {
      const componentsWithMissingVars: CreateTemplateComponent[] = [
        {
          type: 'body',
          text: 'Olá {{nome_inexistente}}, bem-vindo!'
        }
      ];

      renderWithTheme(
        <TemplatePreview
          components={componentsWithMissingVars}
          useAlternativeFormat={true}
          variables={mockVariables}
          previewMode="template"
        />
      );

      // Should show numbered variable with example placeholder
      expect(screen.getByText(/{{1}} \(Example 1\)/)).toBeInTheDocument();
    });
  });

  describe('Dark Mode Support', () => {
    it('should use dark WhatsApp background in dark mode', () => {
      // Mock dark theme
      jest.doMock('next-themes', () => ({
        useTheme: () => ({ theme: 'dark' }),
        ThemeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
      }));

      renderWithTheme(
        <TemplatePreview
          components={mockTemplateComponents}
          useAlternativeFormat={true}
          variables={mockVariables}
          previewMode="template"
        />
      );

      // Check if dark background is applied
      const previewContainer = document.querySelector('.whatsapp-preview');
      expect(previewContainer).toHaveStyle({
        backgroundImage: "url('/fundo_whatsapp_black.jpg')"
      });
    });
  });

  describe('Media Support', () => {
    it('should render image header correctly', () => {
      const componentsWithImage: CreateTemplateComponent[] = [
        {
          type: 'header',
          format: 'image',
          url: 'https://example.com/image.jpg'
        },
        {
          type: 'body',
          text: 'Mensagem com imagem'
        }
      ];

      renderWithTheme(
        <TemplatePreview
          components={componentsWithImage}
          useAlternativeFormat={true}
          variables={[]}
          previewMode="template"
        />
      );

      const image = screen.getByAltText('Header media');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
    });

    it('should render video header correctly', () => {
      const componentsWithVideo: CreateTemplateComponent[] = [
        {
          type: 'header',
          format: 'video',
          url: 'https://example.com/video.mp4'
        },
        {
          type: 'body',
          text: 'Mensagem com vídeo'
        }
      ];

      renderWithTheme(
        <TemplatePreview
          components={componentsWithVideo}
          useAlternativeFormat={true}
          variables={[]}
          previewMode="template"
        />
      );

      const video = document.querySelector('video');
      expect(video).toBeInTheDocument();
      expect(video).toHaveAttribute('src', 'https://example.com/video.mp4');
    });

    it('should render document header correctly', () => {
      const componentsWithDocument: CreateTemplateComponent[] = [
        {
          type: 'header',
          format: 'document',
          filename: 'documento.pdf'
        },
        {
          type: 'body',
          text: 'Mensagem com documento'
        }
      ];

      renderWithTheme(
        <TemplatePreview
          components={componentsWithDocument}
          useAlternativeFormat={true}
          variables={[]}
          previewMode="template"
        />
      );

      expect(screen.getByText('documento.pdf')).toBeInTheDocument();
      expect(screen.getByText('📄')).toBeInTheDocument();
    });
  });

  describe('Button Support', () => {
    it('should render different button types correctly', () => {
      const componentsWithButtons: CreateTemplateComponent[] = [
        {
          type: 'body',
          text: 'Mensagem com botões'
        },
        {
          type: 'buttons',
          buttons: [
            {
              type: 'URL',
              text: 'Visitar Site',
              url: 'https://example.com'
            },
            {
              type: 'PHONE_NUMBER',
              text: 'Ligar',
              phoneNumber: '+5511999999999'
            },
            {
              type: 'COPY_CODE',
              text: 'Copiar Código',
              example: ['ABC123']
            }
          ]
        }
      ];

      renderWithTheme(
        <TemplatePreview
          components={componentsWithButtons}
          useAlternativeFormat={true}
          variables={[]}
          previewMode="template"
        />
      );

      expect(screen.getByText('Visitar Site')).toBeInTheDocument();
      expect(screen.getByText('Ligar')).toBeInTheDocument();
      expect(screen.getByText('Copiar Código')).toBeInTheDocument();
      
      // Check for button icons
      expect(screen.getByText('🔗')).toBeInTheDocument();
      expect(screen.getByText('📞')).toBeInTheDocument();
      expect(screen.getByText('📋')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should render all tabs correctly', () => {
      renderWithTheme(
        <TemplatePreview
          components={mockTemplateComponents}
          useAlternativeFormat={true}
          variables={mockVariables}
          previewMode="template"
        />
      );

      expect(screen.getByText('WhatsApp')).toBeInTheDocument();
      expect(screen.getByText('Visual')).toBeInTheDocument();
      expect(screen.getByText('JSON')).toBeInTheDocument();
    });
  });

  describe('Legacy Template Format', () => {
    it('should handle legacy template components correctly', () => {
      const legacyComponents = [
        {
          tipo: 'HEADER',
          texto: 'Cabeçalho com {{nome}}'
        },
        {
          tipo: 'BODY',
          texto: 'Corpo da mensagem com {{protocolo}}'
        },
        {
          tipo: 'FOOTER',
          texto: 'Rodapé'
        }
      ];

      renderWithTheme(
        <TemplatePreview
          components={legacyComponents}
          useAlternativeFormat={false}
          variables={mockVariables}
          previewMode="template"
        />
      );

      // Check if legacy format is processed with variables
      expect(screen.getByText(/Cabeçalho com {{1}} \(João Silva\)/)).toBeInTheDocument();
      expect(screen.getByText(/Corpo da mensagem com {{2}} \(ABC123\)/)).toBeInTheDocument();
    });
  });
});