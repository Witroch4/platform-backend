import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, List } from 'lucide-react';
import type { InteractiveMessage, ListSection } from '../types';
import { isListAction } from '@/types/interactive-messages';

interface ListConfigProps {
  message: InteractiveMessage;
  updateAction: (updates: Partial<InteractiveMessage["action"]>) => void;
}

export const ListConfig: React.FC<ListConfigProps> = ({ message, updateAction }) => {
  const generateListItemId = (title: string, sectionIndex: number, rowIndex: number): string => {
    const baseId = title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    
    const timestamp = Date.now().toString().slice(-6);
    return baseId ? `list_${baseId}_${timestamp}` : `list_s${sectionIndex}_r${rowIndex}_${timestamp}`;
  };

  const getSections = () => (message.action && isListAction(message.action) ? message.action.sections : []);

  const addSection = () => {
    const currentSections = getSections();
    const newSectionIndex = currentSections.length;
    const newRowId = generateListItemId("", newSectionIndex, 0);
    
    updateAction({
      sections: [
        ...currentSections,
        { title: "", rows: [{ id: newRowId, title: "", description: "" }] },
      ],
      type: "list"
    });
  };

  const updateSection = (index: number, updates: Partial<ListSection>) => {
    const sections = [...getSections()];
    sections[index] = { ...sections[index], ...updates };
    updateAction({ sections, type: "list" });
  };

  const removeSection = (index: number) => {
    const sections = getSections().filter((_, i: number) => i !== index);
    updateAction({ sections, type: "list" });
  };

  const addRow = (sectionIndex: number) => {
    const sections = [...getSections()];
    const newRowIndex = sections[sectionIndex].rows.length;
    const newRowId = generateListItemId("", sectionIndex, newRowIndex);
    
    sections[sectionIndex].rows.push({ id: newRowId, title: "", description: "" });
    updateAction({ sections, type: "list" });
  };

  const updateRow = (
    sectionIndex: number,
    rowIndex: number,
    updates: Partial<ListSection["rows"][0]>
  ) => {
    const sections = [...getSections()];
    sections[sectionIndex].rows[rowIndex] = {
      ...sections[sectionIndex].rows[rowIndex],
      ...updates,
    };
    updateAction({ sections, type: "list" });
  };

  const removeRow = (sectionIndex: number, rowIndex: number) => {
    const sections = [...getSections()];
    sections[sectionIndex].rows = sections[sectionIndex].rows.filter(
      (_: any, i: number) => i !== rowIndex
    );
    updateAction({ sections, type: "list" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <List className="h-4 w-4" />
          Configuração da Lista
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Texto do Botão da Lista</Label>
          <Input
            placeholder="Ex: Ver Opções, Escolher..."
            value={message.action && isListAction(message.action) ? message.action.buttonText : ""}
            onChange={(e) => updateAction({ buttonText: e.target.value, type: "list" })}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Seções da Lista</Label>
            <Button variant="outline" size="sm" onClick={addSection}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Seção
            </Button>
          </div>

          {message.action && isListAction(message.action) && message.action.sections.map((section, sectionIndex) => (
            <Card key={sectionIndex} className="border-dashed">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">Seção {sectionIndex + 1}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSection(sectionIndex)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Título da Seção</Label>
                  <Input
                    placeholder="Ex: Opções Rápidas"
                    value={section.title}
                    onChange={(e) =>
                      updateSection(sectionIndex, { title: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Itens da Seção</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addRow(sectionIndex)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Adicionar Item
                    </Button>
                  </div>

                  {section.rows.map((row, rowIndex) => (
                    <div
                      key={rowIndex}
                      className="border rounded p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs">
                          Item {rowIndex + 1}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(sectionIndex, rowIndex)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Título</Label>
                            <Input
                              placeholder="Título do item"
                              value={row.title}
                              onChange={(e) =>
                                updateRow(sectionIndex, rowIndex, {
                                  title: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Descrição</Label>
                            <Input
                              placeholder="Descrição opcional"
                              value={row.description || ""}
                              onChange={(e) =>
                                updateRow(sectionIndex, rowIndex, {
                                  description: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">ID Gerado Automaticamente</Label>
                          <div className="text-xs font-mono bg-gray-50 p-2 rounded border">
                            {row.id || 'ID será gerado quando você digitar o título'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
