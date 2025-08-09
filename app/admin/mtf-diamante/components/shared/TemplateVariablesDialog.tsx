"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Variable, 
  AlertCircle, 
  CheckCircle2,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { VariableContextMenu } from './VariableContextMenu';

interface TemplateVariable {
  index: number;
  placeholder: string;
  exampleValue: string;
  customValue?: string;
}

interface TemplateVariablesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (variables: Record<string, string>) => void;
  templateId: string;
  templateName: string;
  components: any;
  accountId: string;
}

export const TemplateVariablesDialog: React.FC<TemplateVariablesDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  templateId,
  templateName,
  components,
  accountId
}) => {
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [showVariableMenu, setShowVariableMenu] = useState(false);
  const [variableMenuPosition, setVariableMenuPosition] = useState({ x: 0, y: 0 });
  const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);

  // Extrair variáveis do template
  useEffect(() => {
    if (!components || !isOpen) return;

    const extractedVariables: TemplateVariable[] = [];

    // Procurar por variáveis no componente BODY
    const bodyComponent = components.find((comp: any) => comp.type === 'BODY');
    if (bodyComponent && bodyComponent.text) {
      const variableMatches = bodyComponent.text.match(/\{\{(\d+)\}\}/g);
      if (variableMatches) {
        variableMatches.forEach((match: string, index: number) => {
          const variableIndex = parseInt(match.replace(/[{}]/g, ''));
          
          // Buscar valor de exemplo
          let exampleValue = '';
          if (bodyComponent.example && bodyComponent.example.body_text && bodyComponent.example.body_text[0]) {
            exampleValue = bodyComponent.example.body_text[0][index] || '';
          }

          extractedVariables.push({
            index: variableIndex,
            placeholder: match,
            exampleValue,
            customValue: exampleValue // Inicializar com o valor de exemplo
          });
        });
      }
    }

    // Procurar por variáveis no componente HEADER (se for texto)
    const headerComponent = components.find((comp: any) => comp.type === 'HEADER' && comp.format === 'TEXT');
    if (headerComponent && headerComponent.text) {
      const variableMatches = headerComponent.text.match(/\{\{(\d+)\}\}/g);
      if (variableMatches) {
        variableMatches.forEach((match: string, index: number) => {
          const variableIndex = parseInt(match.replace(/[{}]/g, ''));
          
          // Buscar valor de exemplo
          let exampleValue = '';
          if (headerComponent.example && headerComponent.example.header_text && headerComponent.example.header_text[0]) {
            exampleValue = headerComponent.example.header_text[0][index] || '';
          }

          // Verificar se já não existe uma variável com esse índice
          if (!extractedVariables.find(v => v.index === variableIndex)) {
            extractedVariables.push({
              index: variableIndex,
              placeholder: match,
              exampleValue,
              customValue: exampleValue
            });
          }
        });
      }
    }

    // Ordenar por índice
    extractedVariables.sort((a, b) => a.index - b.index);
    setVariables(extractedVariables);
  }, [components, isOpen]);

  const handleVariableChange = (index: number, value: string) => {
    setVariables(prev => prev.map(variable => 
      variable.index === index 
        ? { ...variable, customValue: value }
        : variable
    ));
  };

  const handleSave = () => {
    // Criar objeto com as variáveis customizadas
    const customVariables: Record<string, string> = {};
    
    variables.forEach(variable => {
      if (variable.customValue && variable.customValue !== variable.exampleValue) {
        customVariables[`variavel_${variable.index}`] = variable.customValue;
      }
    });

    onSave(customVariables);
    onClose();
    toast.success('Variáveis do template configuradas com sucesso!');
  };

  const handleVariableMenuOpen = (event: React.MouseEvent, inputIndex: number) => {
    event.preventDefault();
    setVariableMenuPosition({ x: event.clientX, y: event.clientY });
    setActiveInputIndex(inputIndex);
    setShowVariableMenu(true);
  };

  const handleVariableInsert = (text: string) => {
    if (activeInputIndex !== null) {
      const variable = variables.find(v => v.index === activeInputIndex);
      if (variable) {
        const currentValue = variable.customValue || '';
        const newValue = currentValue + text;
        handleVariableChange(activeInputIndex, newValue);
      }
    }
    setShowVariableMenu(false);
    setActiveInputIndex(null);
  };

  const hasChanges = variables.some(v => v.customValue !== v.exampleValue);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Variable className="h-5 w-5" />
              Configurar Variáveis do Template
            </DialogTitle>
            <DialogDescription>
              Configure os valores das variáveis para o template "{templateName}". 
              Os valores de exemplo da Meta serão usados quando não houver valores customizados.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {variables.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p>Este template não possui variáveis configuráveis.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="h-4 w-4" />
                    <span>Clique com o botão direito nos campos para inserir variáveis do sistema</span>
                  </div>

                  {variables.map((variable) => (
                    <Card key={variable.index}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Badge variant="outline">
                            Variável {variable.index + 1}
                          </Badge>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {variable.placeholder}
                          </code>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Valor de Exemplo (Meta)
                          </Label>
                          <div className="mt-1 p-2 bg-muted rounded text-sm font-mono">
                            {variable.exampleValue || 'Sem exemplo definido'}
                          </div>
                        </div>

                        <div>
                          <Label htmlFor={`variable-${variable.index}`} className="text-sm">
                            Valor Customizado
                          </Label>
                          <Textarea
                            id={`variable-${variable.index}`}
                            value={variable.customValue || ''}
                            onChange={(e) => handleVariableChange(variable.index, e.target.value)}
                            onContextMenu={(e) => handleVariableMenuOpen(e, variable.index)}
                            placeholder="Digite o valor customizado ou clique com botão direito para inserir variáveis"
                            className="mt-1 min-h-[60px]"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Se vazio, será usado o valor de exemplo da Meta
                          </p>
                        </div>

                        {variable.customValue !== variable.exampleValue && (
                          <div className="flex items-center gap-2 text-xs text-green-600">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Valor customizado será usado</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSave}
              disabled={variables.length === 0}
            >
              {hasChanges ? 'Salvar Configurações' : 'Usar Valores Padrão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Menu de Variáveis */}
      <VariableContextMenu
        accountId={accountId}
        isOpen={showVariableMenu}
        onClose={() => {
          setShowVariableMenu(false);
          setActiveInputIndex(null);
        }}
        onInsert={handleVariableInsert}
        position={variableMenuPosition}
      />
    </>
  );
};