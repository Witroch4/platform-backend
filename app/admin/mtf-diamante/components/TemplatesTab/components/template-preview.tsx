"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Phone } from "lucide-react";

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
}

export function TemplatePreview({ 
  components,
  title = "Conteúdo do Template",
  description = "Visualização",
  useAlternativeFormat = false
}: TemplatePreviewProps) {
  // Log para depuração
  console.log("TemplatePreview recebeu:", {
    components,
    useAlternativeFormat
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
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <Tabs defaultValue="visual">
          <TabsList>
            <TabsTrigger value="visual">Visual</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="visual">
            {(components as CreateTemplateComponent[]).map((c, i) => (
              <div key={i} className="border p-4 rounded-md mb-4">
                <h3 className="font-semibold mb-2">{c.type.toUpperCase()}</h3>
                {c.format && (
                  <p className="text-sm mb-2">
                    <strong>Formato:</strong> {c.format.toUpperCase()}
                  </p>
                )}
                {c.text && (
                  <pre className="bg-muted p-2 rounded mb-2 whitespace-pre-wrap text-sm">
                    {c.text}
                  </pre>
                )}
                {c.buttons && c.buttons.length > 0 && (
                  <div className="mb-2">
                    <p className="font-medium">Botões:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {c.buttons.map((b, idx) => (
                        <div
                          key={idx}
                          className="border p-3 rounded shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="font-mono text-xs">
                              {b.type.toUpperCase()}
                            </Badge>
                            <span className="font-medium">{b.text}</span>
                          </div>
                          
                          {b.url && (
                            <a 
                              href={b.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-sm flex items-center gap-1 mt-1"
                            >
                              {b.url}
                            </a>
                          )}
                          
                          {b.phoneNumber && (
                            <a 
                              href={`tel:${b.phoneNumber}`} 
                              className="text-blue-600 hover:underline text-sm flex items-center gap-1 mt-1"
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

          <TabsContent value="json">
            <pre className="bg-muted p-4 rounded overflow-auto text-xs max-h-[400px]">
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
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <Tabs defaultValue="visual">
        <TabsList>
          <TabsTrigger value="visual">Visual</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="visual">
          {(components as TemplateComponent[]).map((c, i) => (
            <div key={i} className="border p-4 rounded-md mb-4">
              <h3 className="font-semibold mb-2">{c.tipo}</h3>
              {c.formato && (
                <p className="text-sm mb-2">
                  <strong>Formato:</strong> {c.formato}
                </p>
              )}
              {c.texto && (
                <pre className="bg-muted p-2 rounded mb-2 whitespace-pre-wrap text-sm">
                  {c.texto}
                </pre>
              )}
              {Array.isArray(c.variaveis) && (
                <div className="mb-2">
                  <p className="font-medium">Variáveis:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {c.variaveis.map((v, idx) => (
                      <div
                        key={idx}
                        className="border p-2 rounded text-xs"
                      >
                        <code className="font-mono bg-slate-100 px-1 rounded text-blue-600">
                          {"{{" + v.nome + "}}"}
                        </code>
                        <p className="mt-1 text-gray-700">{v.descricao}</p>
                        <p className="mt-1 text-xs text-gray-500">Exemplo: {v.exemplo}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {c.botoes && (
                <div className="mb-2">
                  <p className="font-medium">Botões:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {c.botoes.map((b, idx) => (
                      <div
                        key={idx}
                        className="border p-3 rounded shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="font-mono text-xs">
                            {b.tipo}
                          </Badge>
                          <span className="font-medium">{b.texto}</span>
                        </div>
                        
                        {b.url && (
                          <a 
                            href={b.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm flex items-center gap-1 mt-1"
                          >
                            {b.url}
                          </a>
                        )}
                        
                        {b.telefone && (
                          <a 
                            href={`tel:${b.telefone}`} 
                            className="text-blue-600 hover:underline text-sm flex items-center gap-1 mt-1"
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

        <TabsContent value="json">
          <pre className="bg-muted p-4 rounded overflow-auto text-xs max-h-[400px]">
            {JSON.stringify(components, null, 2)}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
} 