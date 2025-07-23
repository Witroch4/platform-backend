"use client";

import React, { useState } from "react";
import { TemplatePreview, CreateTemplateComponent } from "./template-preview";
import { MtfDiamanteVariavel } from "@/app/lib/variable-converter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Demo component to test the enhanced template preview functionality
export function TemplatePreviewDemo() {
  const [previewMode, setPreviewMode] = useState<'template' | 'interactive'>('template');

  // Mock variables for testing
  const mockVariables: MtfDiamanteVariavel[] = [
    { chave: 'nome', valor: 'João Silva' },
    { chave: 'protocolo', valor: 'ABC123' },
    { chave: 'chave_pix', valor: '12345678901' },
    { chave: 'nome_do_escritorio_rodape', valor: 'Escritório Legal LTDA' }
  ];

  // Mock template components with variables
  const mockTemplateComponents: CreateTemplateComponent[] = [
    {
      type: 'header',
      text: 'Olá {{nome}}, seu protocolo é {{protocolo}}'
    },
    {
      type: 'body',
      text: 'Sua chave PIX é {{chave_pix}}. Use o código {{protocolo}} para referência.\n\nEste é um exemplo de template com múltiplas variáveis para demonstrar o sistema de renderização aprimorado.'
    },
    {
      type: 'footer',
      text: 'Atenciosamente, {{nome_do_escritorio_rodape}}'
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
          type: 'COPY_CODE',
          text: 'Copiar PIX',
          example: ['12345678901']
        }
      ]
    }
  ];

  // Template with media
  const mockTemplateWithMedia: CreateTemplateComponent[] = [
    {
      type: 'header',
      format: 'image',
      url: '/smartphone.png'
    },
    {
      type: 'body',
      text: 'Olá {{nome}}! Confira nossa nova promoção. Seu código é {{protocolo}}.'
    },
    {
      type: 'footer',
      text: '{{nome_do_escritorio_rodape}}'
    }
  ];

  // Template without variables
  const mockTemplateWithoutVariables: CreateTemplateComponent[] = [
    {
      type: 'body',
      text: 'Esta é uma mensagem simples sem variáveis para demonstrar que o sistema funciona corretamente mesmo sem substituições.'
    },
    {
      type: 'footer',
      text: 'Mensagem automática'
    }
  ];

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">Template Preview System Demo</h1>
        <p className="text-muted-foreground">
          Demonstração do sistema aprimorado de preview de templates com renderização de variáveis
        </p>
        
        <div className="flex justify-center gap-2">
          <Button
            variant={previewMode === 'template' ? 'default' : 'outline'}
            onClick={() => setPreviewMode('template')}
          >
            Modo Template
          </Button>
          <Button
            variant={previewMode === 'interactive' ? 'default' : 'outline'}
            onClick={() => setPreviewMode('interactive')}
          >
            Modo Interativo
          </Button>
        </div>

        <div className="flex justify-center gap-2">
          <Badge variant="secondary">
            Modo Atual: {previewMode === 'template' ? 'Template (Variáveis Numeradas)' : 'Interativo (Valores Reais)'}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Template com variáveis */}
        <Card>
          <CardHeader>
            <CardTitle>Template com Variáveis</CardTitle>
            <CardDescription>
              Demonstra a renderização de variáveis em diferentes modos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TemplatePreview
              components={mockTemplateComponents}
              title="Template com Variáveis"
              description={`Modo: ${previewMode}`}
              useAlternativeFormat={true}
              variables={mockVariables}
              previewMode={previewMode}
            />
          </CardContent>
        </Card>

        {/* Template com mídia */}
        <Card>
          <CardHeader>
            <CardTitle>Template com Mídia</CardTitle>
            <CardDescription>
              Demonstra suporte a imagens e variáveis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TemplatePreview
              components={mockTemplateWithMedia}
              title="Template com Mídia"
              description={`Modo: ${previewMode}`}
              useAlternativeFormat={true}
              variables={mockVariables}
              previewMode={previewMode}
            />
          </CardContent>
        </Card>

        {/* Template sem variáveis */}
        <Card>
          <CardHeader>
            <CardTitle>Template Simples</CardTitle>
            <CardDescription>
              Template sem variáveis para teste de compatibilidade
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TemplatePreview
              components={mockTemplateWithoutVariables}
              title="Template Simples"
              description="Sem variáveis"
              useAlternativeFormat={true}
              variables={[]}
              previewMode={previewMode}
            />
          </CardContent>
        </Card>

        {/* Informações sobre as variáveis */}
        <Card>
          <CardHeader>
            <CardTitle>Variáveis Disponíveis</CardTitle>
            <CardDescription>
              Lista das variáveis usadas nos exemplos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mockVariables.map((variable, index) => (
                <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                  <code className="text-sm font-mono">
                    {`{{${variable.chave}}}`}
                  </code>
                  <span className="text-sm text-muted-foreground">
                    {variable.valor}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Explicação dos modos */}
      <Card>
        <CardHeader>
          <CardTitle>Explicação dos Modos de Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-green-600">Modo Template</h4>
            <p className="text-sm text-muted-foreground">
              Mostra variáveis no formato numerado (&#123;&#123;1&#125;&#125;, &#123;&#123;2&#125;&#125;) com exemplos entre parênteses.
              Ideal para visualizar como o template será enviado para a API do WhatsApp.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-blue-600">Modo Interativo</h4>
            <p className="text-sm text-muted-foreground">
              Mostra os valores reais das variáveis substituídos no texto.
              Ideal para visualizar como a mensagem aparecerá para o usuário final.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}