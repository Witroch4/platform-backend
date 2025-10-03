'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { InfoIcon, Sparkles, Settings2, Wrench, FileJson } from 'lucide-react';
import type {
  AgentBlueprintDraft,
  AgentTypeDescriptor,
  AgentToolDefinition,
  OutputParserTemplate,
  OutputParserConfig,
  AgentToolConfig,
} from '../../types';

interface AgentNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: AgentBlueprintDraft;
  agentTypes: AgentTypeDescriptor[];
  tools: AgentToolDefinition[];
  modelOptions: Array<{ value: string; label: string }>;
  structuredTemplates: OutputParserTemplate[];
  onSave: (patch: Partial<AgentBlueprintDraft>) => void;
}

export function AgentNodeDialog({
  open,
  onOpenChange,
  draft,
  agentTypes,
  tools,
  modelOptions,
  structuredTemplates,
  onSave,
}: AgentNodeDialogProps) {
  const [localDraft, setLocalDraft] = useState<AgentBlueprintDraft>(draft);

  const currentType = agentTypes.find((t) => t.id === localDraft.agentType);
  const activeTools = new Set((localDraft.toolset || []).map((tool) => tool.key));

  const handleSave = () => {
    onSave(localDraft);
    onOpenChange(false);
  };

  const updateLocal = (patch: Partial<AgentBlueprintDraft>) => {
    setLocalDraft((prev) => ({ ...prev, ...patch }));
  };

  const toggleTool = (tool: AgentToolDefinition, enabled: boolean) => {
    const current = localDraft.toolset || [];
    const exists = current.find((item) => item.key === tool.key);
    let next: AgentToolConfig[];

    if (enabled && !exists) {
      next = [...current, { ...tool, enabled: true }];
    } else if (!enabled && exists) {
      next = current.filter((item) => item.key !== tool.key);
    } else {
      next = current;
    }

    updateLocal({ toolset: next });
  };

  const applyTemplate = (template: OutputParserTemplate) => {
    updateLocal({
      outputParser: {
        schemaType: template.schemaType,
        schema: template.schema,
        name: template.name,
        strict: true,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">
                🤖
              </div>
              <div>
                <DialogTitle className="text-xl">Configuração do Agente</DialogTitle>
                <DialogDescription>
                  Configure todos os parâmetros do agente LangGraph
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="font-mono">
              {currentType?.label || 'Custom'}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="parameters" className="flex-1">
          <div className="px-6 pt-2">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="parameters" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Parâmetros
              </TabsTrigger>
              <TabsTrigger value="model" className="gap-2">
                <Settings2 className="h-4 w-4" />
                Modelo
              </TabsTrigger>
              <TabsTrigger value="tools" className="gap-2">
                <Wrench className="h-4 w-4" />
                Ferramentas
              </TabsTrigger>
              <TabsTrigger value="output" className="gap-2">
                <FileJson className="h-4 w-4" />
                Saída
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="h-[50vh] px-6 py-4">
            {/* PARAMETERS TAB */}
            <TabsContent value="parameters" className="space-y-6 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agent-name" className="text-sm font-medium">
                    Nome do Agente
                  </Label>
                  <Input
                    id="agent-name"
                    value={localDraft.name}
                    onChange={(e) => updateLocal({ name: e.target.value })}
                    placeholder="Ex: Perito em Correção OAB"
                    className="text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Tipo de Agente</Label>
                  <Select
                    value={localDraft.agentType}
                    onValueChange={(value) =>
                      updateLocal({ agentType: value as AgentBlueprintDraft['agentType'] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {agentTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {currentType?.description && (
                    <p className="text-xs text-muted-foreground flex items-start gap-2 mt-2 p-3 bg-muted/50 rounded-md">
                      <InfoIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{currentType.description}</span>
                    </p>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="system-prompt" className="text-sm font-medium">
                    Prompt do Sistema
                  </Label>
                  <Textarea
                    id="system-prompt"
                    value={localDraft.systemPrompt || ''}
                    onChange={(e) => updateLocal({ systemPrompt: e.target.value })}
                    placeholder="Defina o papel, comportamento e diretrizes do agente..."
                    className="min-h-[200px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <InfoIcon className="h-3 w-3" />
                    Instruções fundamentais injetadas no LangGraph antes de cada execução
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instructions" className="text-sm font-medium">
                    Instruções Adicionais (Opcional)
                  </Label>
                  <Textarea
                    id="instructions"
                    value={localDraft.instructions || ''}
                    onChange={(e) => updateLocal({ instructions: e.target.value })}
                    placeholder="Instruções complementares..."
                    className="min-h-[100px] font-mono text-sm"
                  />
                </div>
              </div>
            </TabsContent>

            {/* MODEL TAB */}
            <TabsContent value="model" className="space-y-6 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Modelo LLM</Label>
                  <Select value={localDraft.model} onValueChange={(value) => updateLocal({ model: value })}>
                    <SelectTrigger className="font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="font-mono">
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="temperature" className="text-sm font-medium">
                      Temperature
                    </Label>
                    <Input
                      id="temperature"
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={localDraft.temperature ?? 0.7}
                      onChange={(e) => updateLocal({ temperature: parseFloat(e.target.value) })}
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      0 = mais preciso e determinístico
                      <br />2 = mais criativo e variado
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max-tokens" className="text-sm font-medium">
                      Max Tokens de Saída
                    </Label>
                    <Input
                      id="max-tokens"
                      type="number"
                      min="64"
                      max="16384"
                      value={localDraft.maxOutputTokens ?? 1024}
                      onChange={(e) => updateLocal({ maxOutputTokens: parseInt(e.target.value, 10) })}
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Limite máximo de tokens na resposta
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TOOLS TAB */}
            <TabsContent value="tools" className="space-y-4 mt-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">Ferramentas Disponíveis</h3>
                  <p className="text-xs text-muted-foreground">
                    Selecione as ferramentas que o agente pode usar
                  </p>
                </div>
                <Badge variant="secondary">
                  {activeTools.size} de {tools.length} selecionadas
                </Badge>
              </div>

              <Separator />

              <div className="space-y-3">
                {tools.map((tool) => {
                  const checked = activeTools.has(tool.key);
                  return (
                    <label
                      key={tool.key}
                      className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleTool(tool, Boolean(value))}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="font-medium text-sm">{tool.name}</div>
                        {tool.description && (
                          <div className="text-xs text-muted-foreground">{tool.description}</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </TabsContent>

            {/* OUTPUT TAB */}
            <TabsContent value="output" className="space-y-6 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Tipo de Schema</Label>
                  <Select
                    value={localDraft.outputParser?.schemaType || 'json_schema'}
                    onValueChange={(value) =>
                      updateLocal({
                        outputParser: {
                          ...(localDraft.outputParser ?? { schema: '' }),
                          schemaType: value as OutputParserConfig['schemaType'],
                        },
                      })
                    }
                  >
                    <SelectTrigger className="font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json_schema">JSON Schema</SelectItem>
                      <SelectItem value="zod">Zod Schema</SelectItem>
                      <SelectItem value="structured">Structured Output (OpenAI)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Schema de Saída</Label>
                    {structuredTemplates.length > 0 && (
                      <Select
                        onValueChange={(value) => {
                          const template = structuredTemplates.find((t) => t.id === value);
                          if (template) applyTemplate(template);
                        }}
                      >
                        <SelectTrigger className="h-8 w-[200px] text-xs">
                          <SelectValue placeholder="Templates prontos" />
                        </SelectTrigger>
                        <SelectContent>
                          {structuredTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id} className="text-xs">
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Textarea
                    value={localDraft.outputParser?.schema || ''}
                    onChange={(e) =>
                      updateLocal({
                        outputParser: {
                          ...(localDraft.outputParser ?? {
                            schemaType: 'json_schema' as const,
                          }),
                          schema: e.target.value,
                        },
                      })
                    }
                    placeholder='{"type":"object","properties":{"answer":{"type":"string"}}}'
                    className="min-h-[250px] font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Define a estrutura exata do JSON que o agente deve retornar
                  </p>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Modo Estrito</Label>
                      <p className="text-xs text-muted-foreground">
                        Força validação rigorosa do schema
                      </p>
                    </div>
                    <Switch
                      checked={Boolean(localDraft.outputParser?.strict)}
                      onCheckedChange={(value) =>
                        updateLocal({
                          outputParser: {
                            ...(localDraft.outputParser ?? {
                              schemaType: 'json_schema' as const,
                              schema: '',
                            }),
                            strict: Boolean(value),
                          },
                        })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Auto-correção</Label>
                      <p className="text-xs text-muted-foreground">
                        Tenta corrigir erros de formato automaticamente
                      </p>
                    </div>
                    <Switch
                      checked={Boolean(localDraft.outputParser?.autoFixFormat)}
                      onCheckedChange={(value) =>
                        updateLocal({
                          outputParser: {
                            ...(localDraft.outputParser ?? {
                              schemaType: 'json_schema' as const,
                              schema: '',
                            }),
                            autoFixFormat: Boolean(value),
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar Alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
