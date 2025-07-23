import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, MousePointer } from 'lucide-react';
import type { InteractiveMessage, QuickReplyButton } from '../types';
import { isButtonAction } from '@/types/interactive-messages';

interface ButtonConfigProps {
  message: InteractiveMessage;
  updateAction: (updates: Partial<InteractiveMessage["action"]>) => void;
}

export const ButtonConfig: React.FC<ButtonConfigProps> = ({ message, updateAction }) => {
  const generateButtonId = (title: string, index: number): string => {
    const baseId = title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    
    const timestamp = Date.now().toString().slice(-6);
    return baseId ? `btn_${baseId}_${timestamp}` : `btn_${index + 1}_${timestamp}`;
  };

  const addButton = () => {
    if (!message.action || !isButtonAction(message.action)) return;
    const currentButtons = message.action.buttons || [];
    if (currentButtons.length < 3) {
      const newButtonIndex = currentButtons.length;
      const newButtonId = generateButtonId("", newButtonIndex);
      
      updateAction({
        buttons: [...currentButtons, { id: newButtonId, title: "" }],
      });
    }
  };

  const updateButton = (index: number, updates: Partial<QuickReplyButton>) => {
    if (!message.action || !isButtonAction(message.action)) return;
    const buttons = [...(message.action.buttons || [])];
    
    buttons[index] = { ...buttons[index], ...updates };
    
    updateAction({ buttons });
  };

  const removeButton = (index: number) => {
    if (!message.action || !isButtonAction(message.action)) return;
    const buttons = message.action.buttons.filter((_, i: number) => i !== index) || [];
    updateAction({ buttons });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MousePointer className="h-4 w-4" />
          Configuração dos Botões de Resposta
        </CardTitle>
        <CardDescription>Máximo de 3 botões de resposta rápida</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Botões {(message.action && isButtonAction(message.action) ? message.action.buttons.length : 0)}/3</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={addButton}
            disabled={!(message.action && isButtonAction(message.action) && message.action.buttons.length < 3)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar Botão
          </Button>
        </div>

        {message.action && isButtonAction(message.action) && message.action.buttons.map((button, index) => (
          <div key={index} className="border rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="outline">Botão {index + 1}</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeButton(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Texto do Botão</Label>
                <Input
                  placeholder="Texto do botão"
                  value={button.title}
                  onChange={(e) =>
                    updateButton(index, { title: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">ID Gerado Automaticamente</Label>
                <div className="text-xs font-mono bg-gray-50 p-2 rounded border">
                  {button.id || 'ID será gerado quando você digitar o texto'}
                </div>
              </div>
            </div>
          </div>
        ))}

        {(!message.action || !isButtonAction(message.action) || message.action.buttons.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            <MousePointer className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum botão adicionado ainda</p>
            <p className="text-xs">
              Clique em "Adicionar Botão" para criar seu primeiro botão
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
