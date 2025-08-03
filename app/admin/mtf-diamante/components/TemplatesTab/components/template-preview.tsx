"use client";

import React from "react";
import { useTheme } from "next-themes";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { variableConverter, type MtfDiamanteVariavel } from "@/app/lib/variable-converter";

interface TemplateComponent {
  tipo: string;
  formato?: string;
  texto?: string;
  variaveis: false | Array<{
    nome: string;
    descricao: string;
    exemplo: string;
  }>;
  botoes?: Array<{
    tipo: string;
    texto: string;
    url: string | null;
    telefone: string | null;
    example?: string[];
  }>;
  example?: any;
}

// Interface alternativa para uso na página de criação
export interface CreateTemplateComponent {
  type: string;
  format?: string;
  text?: string;
  url?: string;
  filename?: string;
  buttons?: Array<{
    type: string;
    text: string;
    url?: string;
    phoneNumber?: string;
    example?: string[];
  }>;
}

interface TemplatePreviewProps {
  components: TemplateComponent[] | CreateTemplateComponent[];
  title?: string;
  description?: string;
  useAlternativeFormat?: boolean;
  showWhatsAppPreview?: boolean;
  variables?: MtfDiamanteVariavel[];
  previewMode?: 'template' | 'interactive';
}

// WhatsApp-style preview component with theme support and variable rendering
function WhatsAppPreview({ 
  components, 
  useAlternativeFormat = false,
  variables = [],
  previewMode = 'template'
}: { 
  components: TemplateComponent[] | CreateTemplateComponent[];
  useAlternativeFormat?: boolean;
  variables?: MtfDiamanteVariavel[];
  previewMode?: 'template' | 'interactive';
}) {
  const { theme } = useTheme();
  
  // Get WhatsApp background image based on theme
  const getWhatsAppBackground = () => {
    return theme === 'dark' ? '/fundo_whatsapp_black.jpg' : '/fundo_whatsapp.jpg';
  };

  // Process WhatsApp formatting (bold, italic, strikethrough, etc.)
  const processWhatsAppFormatting = (text: string): string => {
    if (!text) return text;
    
    return text
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~(.*?)~/g, '<del>$1</del>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-200 dark:bg-gray-700 px-1 rounded text-xs">$1</code>')
      .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-gray-300 pl-4 italic text-gray-600 dark:text-gray-400">$1</blockquote>')
      .replace(/^• (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
      .replace(/\n/g, '<br>');
  };

  // Process text with variables based on preview mode
  const processTextWithVariables = (text: string): string => {
    if (!text) return text;

    let processedText = text;

    // First, process variables
    if (variables.length > 0) {
      if (previewMode === 'interactive') {
        // For interactive messages, show actual variable values
        processedText = variableConverter.generatePreviewText(processedText, variables);
      } else {
        // For templates, show numbered variables with examples
        processedText = variableConverter.generateNumberedPreviewText(processedText, variables);
      }
    }

    // Then, process WhatsApp formatting
    return processWhatsAppFormatting(processedText);
  };

  const renderComponent = (component: TemplateComponent | CreateTemplateComponent, index: number) => {
    if (useAlternativeFormat) {
      const comp = component as CreateTemplateComponent;
      
      return (
        <div key={index} className="mb-2">
          {comp.type === 'header' && comp.text && (
            <div 
              className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-100 break-words overflow-wrap-anywhere"
              dangerouslySetInnerHTML={{ __html: processTextWithVariables(comp.text) }}
            />
          )}
          
          {comp.type === 'header' && comp.format && ['image', 'video', 'document'].includes(comp.format.toLowerCase()) && comp.url && (
            <div className="mb-2">
              {comp.format.toLowerCase() === 'image' && (
                <img 
                  src={comp.url} 
                  alt="Header media" 
                  className="max-w-full h-auto rounded-lg max-h-48 object-cover"
                />
              )}
              {comp.format.toLowerCase() === 'video' && (
                <video 
                  src={comp.url} 
                  controls 
                  className="max-w-full h-auto rounded-lg max-h-48"
                />
              )}
              {comp.format.toLowerCase() === 'document' && (
                <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded">
                  <div className="text-blue-600 dark:text-blue-400">📄</div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {comp.filename || 'Document'}
                  </span>
                </div>
              )}
            </div>
          )}
          
          {comp.type === 'body' && comp.text && (
            <div 
              className="text-sm mb-2 text-gray-900 dark:text-gray-100 break-words overflow-wrap-anywhere"
              dangerouslySetInnerHTML={{ __html: processTextWithVariables(comp.text) }}
            />
          )}
          
          {comp.type === 'footer' && comp.text && (
            <div 
              className="text-xs text-gray-500 dark:text-gray-400 mb-2 break-words overflow-wrap-anywhere"
              dangerouslySetInnerHTML={{ __html: processTextWithVariables(comp.text) }}
            />
          )}
          
          {comp.type === 'buttons' && comp.buttons && comp.buttons.length > 0 && (
            <div className="mt-3 space-y-1">
              {comp.buttons.map((button, btnIndex) => (
                <button
                  key={btnIndex}
                  className="w-full p-2 text-sm border rounded text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  {button.text}
                  {button.type === 'PHONE_NUMBER' && button.phoneNumber && (
                    <span className="ml-1">📞</span>
                  )}
                  {button.type === 'URL' && (
                    <span className="ml-1">🔗</span>
                  )}
                  {button.type === 'COPY_CODE' && (
                    <span className="ml-1">📋</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    } else {
      const comp = component as TemplateComponent;
      
      return (
        <div key={index} className="mb-2">
          {comp.tipo === 'HEADER' && comp.texto && (
            <div 
              className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-100"
              dangerouslySetInnerHTML={{ __html: processTextWithVariables(comp.texto) }}
            />
          )}
          
          {comp.tipo === 'BODY' && comp.texto && (
            <div 
              className="text-sm mb-2 text-gray-900 dark:text-gray-100 break-words overflow-wrap-anywhere"
              dangerouslySetInnerHTML={{ __html: processTextWithVariables(comp.texto) }}
            />
          )}
          
          {comp.tipo === 'FOOTER' && comp.texto && (
            <div 
              className="text-xs text-gray-500 dark:text-gray-400 mb-2 break-words overflow-wrap-anywhere"
              dangerouslySetInnerHTML={{ __html: processTextWithVariables(comp.texto) }}
            />
          )}
          
          {comp.botoes && comp.botoes.length > 0 && (
            <div className="mt-3 space-y-1">
              {comp.botoes.map((button, btnIndex) => (
                <button
                  key={btnIndex}
                  className="w-full p-2 text-sm border rounded text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  {button.texto}
                  {button.tipo === 'PHONE_NUMBER' && button.telefone && (
                    <span className="ml-1">📞</span>
                  )}
                  {button.tipo === 'URL' && (
                    <span className="ml-1">🔗</span>
                  )}
                  {button.tipo === 'COPY_CODE' && (
                    <span className="ml-1">📋</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }
  };

  return (
    <div className="flex justify-center">
      <div 
        className={cn(
          "whatsapp-preview rounded-lg p-4 max-w-sm w-full",
          "bg-cover bg-center bg-no-repeat min-h-[300px]",
          "relative"
        )}
        style={{
          backgroundImage: `url('${getWhatsAppBackground()}')`
        }}
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-md border border-gray-200 dark:border-gray-700">
          {components.map((component, index) => renderComponent(component, index))}
        </div>
      </div>
    </div>
  );
}

export function TemplatePreview({ 
  components,
  title = "Conteúdo do Template",
  description = "Visualização",
  useAlternativeFormat = false,
  showWhatsAppPreview = false,
  variables = [],
  previewMode = 'template'
}: TemplatePreviewProps) {
  // Log para depuração
  console.log("TemplatePreview recebeu:", {
    components,
    useAlternativeFormat,
    variables,
    previewMode
  });
  
  // Format phone number for display
  const formatPhoneNumber = (phone: string) => {
    if (!phone) return "";
    // Basic formatting for Brazil numbers
    if (phone.startsWith("+55") || phone.startsWith("55")) {
      const cleaned = phone.replace(/\D/g, "");
      if (cleaned.length === 12 || cleaned.length === 13) { // With or without country code
        return phone.startsWith("+") 
          ? phone 
          : `+${phone}`;
      }
    }
    return phone;
  };

  // Renderização simplificada para formato alternativo
  if (useAlternativeFormat) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col space-y-1.5 mb-2">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <Tabs defaultValue="whatsapp" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-muted">
            <TabsTrigger value="whatsapp" className="data-[state=active]:bg-background data-[state=active]:text-foreground">WhatsApp</TabsTrigger>
            <TabsTrigger value="visual" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Visual</TabsTrigger>
            <TabsTrigger value="json" className="data-[state=active]:bg-background data-[state=active]:text-foreground">JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="whatsapp" className="mt-4">
            <WhatsAppPreview 
              components={components} 
              useAlternativeFormat={true} 
              variables={variables}
              previewMode={previewMode}
            />
          </TabsContent>

          <TabsContent value="visual" className="mt-4">
            {(components as CreateTemplateComponent[]).map((c, i) => (
              <div key={i} className="border border-border p-4 rounded-md mb-4 bg-card">
                <h3 className="font-semibold mb-2 text-card-foreground">{c.type.toUpperCase()}</h3>
                {c.format && (
                  <p className="text-sm mb-2 text-card-foreground">
                    <strong>Formato:</strong> {c.format.toUpperCase()}
                  </p>
                )}
                {c.text && (
                  <pre className="bg-muted p-2 rounded mb-2 whitespace-pre-wrap text-sm text-foreground">
                    {c.text}
                  </pre>
                )}
                {c.buttons && c.buttons.length > 0 && (
                  <div className="mb-2">
                    <p className="font-medium text-card-foreground">Botões:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {c.buttons.map((b, idx) => (
                        <div
                          key={idx}
                          className="border border-border p-3 rounded shadow-sm hover:shadow-md transition-shadow bg-background"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="font-mono text-xs border-border">
                              {b.type.toUpperCase()}
                            </Badge>
                            <span className="font-medium text-foreground">{b.text}</span>
                          </div>
                          
                          {b.url && (
                            <a 
                              href={b.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1 mt-1"
                            >
                              {b.url}
                            </a>
                          )}
                          
                          {b.phoneNumber && (
                            <a 
                              href={`tel:${b.phoneNumber}`} 
                              className="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1 mt-1"
                            >
                              <Phone className="h-3 w-3" />
                              {formatPhoneNumber(b.phoneNumber)}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="json" className="mt-4">
            <pre className="bg-muted p-4 rounded overflow-auto text-xs max-h-[400px] text-foreground border border-border">
              {JSON.stringify(components, null, 2)}
            </pre>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Renderização original para templates existentes
  return (
    <div className="space-y-4">
      <div className="flex flex-col space-y-1.5 mb-2">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <Tabs defaultValue="whatsapp" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-muted">
          <TabsTrigger value="whatsapp" className="data-[state=active]:bg-background data-[state=active]:text-foreground">WhatsApp</TabsTrigger>
          <TabsTrigger value="visual" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Visual</TabsTrigger>
          <TabsTrigger value="json" className="data-[state=active]:bg-background data-[state=active]:text-foreground">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp" className="mt-4">
          <WhatsAppPreview 
            components={components} 
            useAlternativeFormat={false} 
            variables={variables}
            previewMode={previewMode}
          />
        </TabsContent>

        <TabsContent value="visual" className="mt-4">
          {(components as TemplateComponent[]).map((c, i) => (
            <div key={i} className="border border-border p-4 rounded-md mb-4 bg-card">
              <h3 className="font-semibold mb-2 text-card-foreground">{c.tipo}</h3>
              {c.formato && (
                <p className="text-sm mb-2 text-card-foreground">
                  <strong>Formato:</strong> {c.formato}
                </p>
              )}
              {c.texto && (
                <pre className="bg-muted p-2 rounded mb-2 whitespace-pre-wrap text-sm text-foreground">
                  {c.texto}
                </pre>
              )}
              {Array.isArray(c.variaveis) && (
                <div className="mb-2">
                  <p className="font-medium text-card-foreground">Variáveis:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {c.variaveis.map((v, idx) => (
                      <div
                        key={idx}
                        className="border border-border p-2 rounded text-xs bg-background"
                      >
                        <code className="font-mono bg-muted px-1 rounded text-blue-600 dark:text-blue-400">
                          {"{{" + v.nome + "}}"}
                        </code>
                        <p className="mt-1 text-foreground">{v.descricao}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Exemplo: {v.exemplo}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {c.botoes && (
                <div className="mb-2">
                  <p className="font-medium text-card-foreground">Botões:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {c.botoes.map((b, idx) => (
                      <div
                        key={idx}
                        className="border border-border p-3 rounded shadow-sm hover:shadow-md transition-shadow bg-background"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="font-mono text-xs border-border">
                            {b.tipo}
                          </Badge>
                          <span className="font-medium text-foreground">{b.texto}</span>
                        </div>
                        
                        {b.url && (
                          <a 
                            href={b.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1 mt-1"
                          >
                            {b.url}
                          </a>
                        )}
                        
                        {b.telefone && (
                          <a 
                            href={`tel:${b.telefone}`} 
                            className="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1 mt-1"
                          >
                            <Phone className="h-3 w-3" />
                            {formatPhoneNumber(b.telefone)}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="json" className="mt-4">
          <pre className="bg-muted p-4 rounded overflow-auto text-xs max-h-[400px] text-foreground border border-border">
            {JSON.stringify(components, null, 2)}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
} 