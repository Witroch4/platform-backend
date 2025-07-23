import type React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { InteractiveMessage } from './types';
import { MESSAGE_TYPES } from './constants';
import { Eye, MessageSquare, Save, Loader2 } from 'lucide-react';
import { TemplatePreview } from '../TemplatesTab/components/template-preview';
import { SaveToLibraryButton } from '../shared/SaveToLibraryButton';

interface PreviewStepProps {
  message: InteractiveMessage;
  setCurrentStep: (step: "type-selection" | "configuration" | "preview") => void;
  handleSave: () => void;
  saving: boolean;
  editingMessage?: InteractiveMessage;
  variables: any[];
}

export const PreviewStep: React.FC<PreviewStepProps> = ({ 
  message, 
  setCurrentStep, 
  handleSave, 
  saving, 
  editingMessage, 
  variables 
}) => {

  const generatePreviewComponents = () => {
    const components = [];

    if (message.header) {
      if (message.header.type === "text" && message.header.text) {
        components.push({ type: "header", text: message.header.text });
      } else if (message.header.media_url) {
        components.push({ type: "header", format: message.header.type, url: message.header.media_url, filename: message.header.filename });
      }
    }

    components.push({ type: "body", text: message.body.text });

    if (message.footer?.text) {
      components.push({ type: "footer", text: message.footer.text });
    }

    if (message.type === "button" && message.action?.buttons) {
      components.push({ type: "buttons", buttons: message.action.buttons.map((btn) => ({ type: "QUICK_REPLY", text: btn.title })) });
    } else if (message.type === "cta_url" && message.action?.parameters) {
      components.push({ type: "buttons", buttons: [{ type: "URL", text: message.action.parameters.display_text, url: message.action.parameters.url }] });
    } else if (message.type === "list" && message.action?.sections) {
      components.push({ type: "buttons", buttons: [{ type: "LIST", text: message.action.button || "Ver opções" }] });
    }

    return components;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Visualizar e Salvar Mensagem
          <Badge variant="outline" className="ml-2">
            {MESSAGE_TYPES[message.type].label}
          </Badge>
        </CardTitle>
        <CardDescription>
          Revise sua mensagem interativa antes de salvar
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Visualização da Mensagem</h3>
          {message.name || message.body.text ? (
            <TemplatePreview
              components={generatePreviewComponents()}
              title={message.name || "Mensagem Interativa"}
              description={`Tipo: ${MESSAGE_TYPES[message.type].label}`}
              useAlternativeFormat={true}
              variables={variables}
              previewMode="interactive"
            />
          ) : (
            <div className="text-center text-muted-foreground py-12 border-2 border-dashed rounded-lg">
              <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Nenhuma mensagem para visualizar</p>
              <p className="text-sm">Configure sua mensagem para ver a visualização</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Resumo da Configuração</h3>
          {/* Resumo da configuração */}
        </div>

        <div className="flex justify-between items-center pt-6 border-t">
          <Button
            variant="outline"
            onClick={() => setCurrentStep("configuration")}
          >
            ← Voltar para Configuração
          </Button>

          <div className="flex gap-2">

            <SaveToLibraryButton
              templateData={{
                name: message.name,
                category: "interactive_messages",
                language: "pt_BR",
                headerType: message.header?.type || "NONE",
                headerText: message.header?.text || "",
                bodyText: message.body.text,
                footerText: message.footer?.text || "",
                buttons: message.action?.buttons || [],
                headerMetaMedia: message.header?.media_url
                  ? [{ url: message.header.media_url }]
                  : [],
              }}
              messageType="interactive_message"
              disabled={!message.name || !message.body.text || saving}
            />

            <Button
              onClick={handleSave}
              disabled={saving || !message.name || !message.body.text}
              className="min-w-[120px]"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {editingMessage ? "Atualizar" : "Salvar"} Mensagem
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
