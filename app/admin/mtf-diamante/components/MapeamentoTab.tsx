"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useMtfData } from "../context/SwrProvider";
import useSWR from 'swr';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { TrashIcon, PencilIcon, Brain } from "lucide-react";
import { ButtonEmojiMapper } from "./shared/ButtonEmojiMapper";
import { TemplateVariablesDialog } from "./shared/TemplateVariablesDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MapeamentoTabProps {
  caixaId: string;
}

interface Mapeamento {
  id: string;
  intentName: string;
  templateId: string | null;
  flowId?: string | null;
  template?: { id: string; name: string; type: string } | null;
  flow?: { id: string; name: string } | null;
  // Campos de exibição para compatibilidade (não usados na API)
  mensagemInterativaId?: string | null;
  interactiveMessageId?: string | null;
  mensagemInterativa?: { id: string; nome: string };
  interactiveMessage?: { id: string; name: string };
}

interface Flow {
  id: string;
  name: string;
  isActive: boolean;
}

interface Template {
  id: string;
  name: string;
}

const MapeamentoTab = ({ caixaId }: MapeamentoTabProps) => {
  // Usar o provider SWR para obter as mensagens interativas
  const { interactiveMessages, isLoadingMessages } = useMtfData();

  // Usar SWR para mapeamentos
  const { data: mapeamentos = [], error: mapeamentosError, mutate: mutateMapeamentos } = useSWR(
    caixaId ? `/api/admin/mtf-diamante/mapeamentos/${caixaId}` : null,
    async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Falha ao buscar mapeamentos');
      return response.json();
    }
  );

  // Usar SWR para templates (primeiro tentar específicos da caixa, depois globais)
  const { data: templates = [], error: templatesError, mutate: mutateTemplates } = useSWR(
    caixaId ? [`templates`, caixaId] : null,
    async () => {
      try {
        // Tentar buscar templates específicos da caixa primeiro
        const templateResponse = await fetch(`/api/admin/mtf-diamante/templates/${caixaId}`);
        if (templateResponse.ok) {
          const templateData = await templateResponse.json();
          setUsingGlobalTemplates(false);
          return templateData;
        }
      } catch (error) {
        console.log("Falha ao buscar templates da caixa, tentando fallback...");
      }

      // Fallback: buscar templates globais da conta
      const globalTemplateResponse = await fetch(`/api/admin/mtf-diamante/templates`);
      if (globalTemplateResponse.ok) {
        const globalTemplateData = await globalTemplateResponse.json();
        const templates = globalTemplateData.success
          ? globalTemplateData.templates
          : globalTemplateData;
        setUsingGlobalTemplates(true);
        return templates;
      }

      throw new Error("Falha ao buscar templates.");
    }
  );

  const [loading, setLoading] = useState(false);
  const [usingGlobalTemplates, setUsingGlobalTemplates] = useState(false);

  // Usar SWR para flows da inbox
  // Nota: o fetcher global do SWRConfig retorna JSON cru { success, data }
  const { data: rawFlows, error: flowsError } = useSWR<any>(
    caixaId ? `/api/admin/mtf-diamante/flows?inboxId=${caixaId}` : null
  );

  // Normalizar: o fetcher global retorna { success, data: Flow[] }, não o array direto
  const flows: Flow[] = useMemo(() => {
    if (!rawFlows) return [];
    if (Array.isArray(rawFlows)) return rawFlows;
    if (Array.isArray(rawFlows?.data)) return rawFlows.data;
    if (Array.isArray(rawFlows?.flows)) return rawFlows.flows;
    return [];
  }, [rawFlows]);

  // Form state
  const [id, setId] = useState<string | null>(null);
  const [aiName, setAiName] = useState("");
  const [aiSelectedTemplate, setAiSelectedTemplate] = useState<string | null>(null);
  const [aiSelectedMensagem, setAiSelectedMensagem] = useState<string | null>(null);
  const [aiSelectedFlow, setAiSelectedFlow] = useState<string | null>(null);

  // Button reactions state
  const [showReactionConfig, setShowReactionConfig] = useState<string | null>(null);
  const [selectedTemplateDetails, setSelectedTemplateDetails] = useState<any>(null);

  // Template variables dialog state
  const [showVariablesDialog, setShowVariablesDialog] = useState(false);
  const [selectedTemplateForVariables, setSelectedTemplateForVariables] = useState<any>(null);
  const [pendingMappingData, setPendingMappingData] = useState<any>(null);

  // Delete confirmation dialog state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Ações para lista IA: usaremos os mesmos handlers de mapeamento (editar/excluir)

  // Usar SWR para AI intents
  const { data: aiIntents = [] } = useSWR(
    caixaId ? '/api/admin/ai-integration/intents' : null,
    async (url) => {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data?.intents) ? data.intents : [];
    }
  );

  const resetForm = () => {
    setId(null);
    setAiName("");
    setAiSelectedTemplate(null);
    setAiSelectedMensagem(null);
    setAiSelectedFlow(null);
  };

  const handleEdit = (mapeamento: Mapeamento) => {
    setId(mapeamento.id);
    setAiName(mapeamento.intentName);

    // Reset all selections first
    setAiSelectedTemplate(null);
    setAiSelectedMensagem(null);
    setAiSelectedFlow(null);

    // Verificar se é flow, template ou mensagem interativa
    if (mapeamento.flowId) {
      setAiSelectedFlow(mapeamento.flowId);
    } else if (mapeamento.template?.type === 'INTERACTIVE_MESSAGE') {
      setAiSelectedMensagem(mapeamento.templateId);
    } else if (mapeamento.templateId) {
      setAiSelectedTemplate(mapeamento.templateId);
    }
  };

  const handleDelete = async (mappingId: string) => {
    try {
      const response = await fetch(
        `/api/admin/mtf-diamante/mapeamentos?id=${mappingId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Falha ao excluir mapeamento.");
      }
      toast.success("Mapeamento excluído com sucesso!");
      // Refresh dos dados SWR
      mutateTemplates();
      mutateMapeamentos();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const requestDelete = (mappingId: string) => {
    setDeleteTargetId(mappingId);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    await handleDelete(deleteTargetId);
    setIsDeleteOpen(false);
    setDeleteTargetId(null);
  };

  // Função para verificar se template tem variáveis (BODY/HEADER) ou botões COPY_CODE
  const checkTemplateVariables = async (templateId: string) => {
    try {
      const response = await fetch(`/api/admin/mtf-diamante/template-info?templateId=${templateId}`);
      if (response.ok) {
        const templateInfo = await response.json();

        // Verificar se é template oficial do WhatsApp e tem variáveis
        if (templateInfo.type === 'WHATSAPP_OFFICIAL' && templateInfo.whatsappOfficialInfo) {
          const rawComponents = templateInfo.whatsappOfficialInfo.components;
          const components: any[] = Array.isArray(rawComponents)
            ? rawComponents
            : (rawComponents && typeof rawComponents === 'object')
              ? Object.keys(rawComponents)
                .filter((k) => /^\d+$/.test(k))
                .sort((a, b) => Number(a) - Number(b))
                .map((k) => rawComponents[k])
              : [];

          // Verificar se há variáveis nos componentes
          const hasVariablesInTexts = components.some((comp: any) => {
            // Detectar placeholders numéricos ou nomeados: {{...}}
            const pattern = /\{\{[^}]+\}\}/;
            if (comp.type === 'BODY' && comp.text) {
              return pattern.test(comp.text);
            }
            if (comp.type === 'HEADER' && comp.format === 'TEXT' && comp.text) {
              return pattern.test(comp.text);
            }
            // Alternativamente, considerar presence de *_named_params
            if (comp.type === 'BODY' && comp.example?.body_text_named_params) {
              return Array.isArray(comp.example.body_text_named_params) && comp.example.body_text_named_params.length > 0;
            }
            if (comp.type === 'HEADER' && comp.example?.header_text_named_params) {
              return Array.isArray(comp.example.header_text_named_params) && comp.example.header_text_named_params.length > 0;
            }
            return false;
          });

          // Verificar se há botões COPY_CODE configuráveis
          const hasCopyCodeButton = components.some((comp: any) => {
            if (comp.type === 'BUTTONS' && Array.isArray(comp.buttons)) {
              return comp.buttons.some((b: any) => String(b?.type || '').toUpperCase() === 'COPY_CODE');
            }
            return false;
          });

          if (hasVariablesInTexts || hasCopyCodeButton) {
            return {
              hasVariables: true, // abre diálogo
              templateInfo
            };
          }
        }
      }
    } catch (error) {
      console.error('Erro ao verificar variáveis do template:', error);
    }

    return { hasVariables: false, templateInfo: null };
  };

  // Salvar mapeamento de intenção
  const handleAiIntentSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiName.trim()) { toast.error('Selecione uma intenção'); return; }
    if (!aiSelectedTemplate && !aiSelectedMensagem && !aiSelectedFlow) {
      toast.error('Selecione um template, mensagem interativa ou flow');
      return;
    }

    // Se for flow, salvar diretamente sem verificar variáveis
    if (aiSelectedFlow) {
      await saveMappingData({ id: null, intentName: aiName.trim(), flowId: aiSelectedFlow, caixaId });
      resetForm();
      mutateTemplates();
      mutateMapeamentos();
      return;
    }

    const templateId = aiSelectedTemplate || aiSelectedMensagem;

    // Se for template oficial, garantir mídia e checar variáveis como no Dialogflow
    if (aiSelectedTemplate) {
      try {
        const ensureRes = await fetch('/api/admin/mtf-diamante/templates/ensure-media', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId })
        });
        if (!ensureRes.ok) { await ensureRes.json().catch(() => ({})); }
      } catch { }

      const { hasVariables, templateInfo } = await checkTemplateVariables(templateId!);
      if (hasVariables) {
        setSelectedTemplateForVariables(templateInfo);
        setPendingMappingData({ id: null, intentName: aiName.trim(), templateId, caixaId });
        setShowVariablesDialog(true);
        return;
      }
    }

    await saveMappingData({ id: null, intentName: aiName.trim(), templateId, caixaId });
    resetForm();
    // Refresh dos dados SWR
    mutateTemplates();
    mutateMapeamentos();
  };

  const saveMappingData = async (mappingData: any, customVariables?: Record<string, string>) => {
    try {
      const response = await fetch(`/api/admin/mtf-diamante/mapeamentos/${encodeURIComponent(mappingData.caixaId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mappingData.id,
          intentName: mappingData.intentName,
          templateId: mappingData.templateId || null,
          flowId: mappingData.flowId || null,
          customVariables, // Adicionar variáveis customizadas se existirem
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Falha ao salvar mapeamento.`);
      }
      const saved = await response.json();

      toast.success("Mapeamento salvo com sucesso!");
      resetForm();
      // Refresh dos dados SWR
      mutateTemplates();
      mutateMapeamentos();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleVariablesSave = (customVariables: Record<string, string>) => {

    if (pendingMappingData) {
      saveMappingData(pendingMappingData, customVariables);
      setPendingMappingData(null);
      setSelectedTemplateForVariables(null);
    }
  };

  // Função para buscar detalhes do template
  const fetchTemplateDetails = async (templateId: string) => {
    try {
      const response = await fetch(`/api/admin/mtf-diamante/templates/details/${templateId}`);
      if (response.ok) {
        const templateData = await response.json();
        setSelectedTemplateDetails(templateData);
        setShowReactionConfig(templateId);
      } else {
        toast.error("Erro ao buscar detalhes do template");
      }
    } catch (error) {
      console.error("Erro ao buscar template:", error);
      toast.error("Erro ao buscar detalhes do template");
    }
  };

  // Função para configurar reações de botões
  const handleConfigureReactions = (mapping: Mapeamento) => {
    if (mapping.templateId) {
      fetchTemplateDetails(mapping.templateId);
    }
  };

  if (!caixaId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mapeamento de Intenções</CardTitle>
          <CardDescription>
            Selecione uma caixa de entrada para configurar mapeamentos de
            intenções.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>Nenhuma caixa de entrada selecionada</p>
            <p className="text-sm">
              Selecione ou crie uma caixa de entrada para começar
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Skeleton className="h-6 w-72 mb-2" />
              <Skeleton className="h-4 w-96" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="text-sm text-muted-foreground">
            <Skeleton className="h-3 w-1/2" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 p-4 border rounded-lg">
            <Skeleton className="h-10 w-full mb-3" />
            <div className="flex gap-4">
              <Skeleton className="h-10 w-1/2" />
              <Skeleton className="h-10 w-1/2" />
            </div>
            <Skeleton className="h-40 w-full mt-4" />
          </div>

          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-border p-4 rounded-lg flex justify-between items-start">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-80" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="h-5 w-5" />
            <CardTitle>
              {id ? "Editar Mapeamento" : "Mapeamento de Intenções Socialwise"}
            </CardTitle>
          </div>
        </div>
        <CardDescription>
          Associe uma intenção da IA a uma resposta automática (template, mensagem interativa ou flow).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleAiIntentSave} className="space-y-4 p-4 border rounded-lg">
          <div>
            <Label>Intenção</Label>
            <Select onValueChange={(val) => { setAiName(val); }} value={aiName}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma intenção" />
              </SelectTrigger>
              <SelectContent>
                {aiIntents?.map?.((g: any) => (
                  <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-4 flex-wrap gap-y-4">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 mb-2">
                <Label>Responder com Template</Label>
              </div>
              <Select
                onValueChange={(value) => { setAiSelectedTemplate(value); setAiSelectedMensagem(null); setAiSelectedFlow(null); }}
                value={aiSelectedTemplate || ""}
                disabled={!!aiSelectedMensagem || !!aiSelectedFlow}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um Template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t: Template) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-sm font-medium self-end pb-2">OU</span>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 mb-2">
                <Label>Responder com Mensagem Interativa</Label>
              </div>
              <Select
                onValueChange={(value) => { setAiSelectedMensagem(value); setAiSelectedTemplate(null); setAiSelectedFlow(null); }}
                value={aiSelectedMensagem || ""}
                disabled={!!aiSelectedTemplate}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma Mensagem" />
                </SelectTrigger>
                <SelectContent>
                  {interactiveMessages?.map((m) => (
                    <SelectItem key={m.id} value={m.id || ''}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-sm font-medium self-end pb-2">OU</span>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 mb-2">
                <Label>Executar Flow</Label>
              </div>
              <Select
                onValueChange={(value) => { setAiSelectedFlow(value); setAiSelectedTemplate(null); setAiSelectedMensagem(null); }}
                value={aiSelectedFlow || ""}
                disabled={!!aiSelectedTemplate || !!aiSelectedMensagem || flows.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={flows.length === 0 ? "Nenhum flow salvo" : "Selecione um Flow"} />
                </SelectTrigger>
                <SelectContent>
                  {flows.map((f: Flow) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit">Salvar Mapeamento</Button>
            {id && (
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
            )}
          </div>
        </form>

        {/* Lista de intenções mapeadas */}
        <div>
          <div className="text-sm text-muted-foreground mb-2">Intenções mapeadas desta caixa</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Intenção</TableHead>
                <TableHead>Resposta</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapeamentos.map((map: Mapeamento) => (
                <TableRow key={map.id}>
                  <TableCell className="font-medium">{map.intentName}</TableCell>
                  <TableCell>
                    {map.flow ? (
                      <span className="text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 p-1 rounded">FLOW: {map.flow.name}</span>
                    ) : map.template ? (
                      <span className="text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 p-1 rounded">TEMPLATE: {map.template.name}</span>
                    ) : map.mensagemInterativa ? (
                      <span className="text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 p-1 rounded">MENSAGEM: {map.mensagemInterativa.nome}</span>
                    ) : map.interactiveMessage ? (
                      <span className="text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 p-1 rounded">INTERATIVA: {map.interactiveMessage.name}</span>
                    ) : ''}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(map)}>
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => requestDelete(map.id)}>
                        <TrashIcon className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {mapeamentos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground">Nenhuma intenção mapeada nesta caixa.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Modal de Configuração de Reações */}
        {showReactionConfig && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Configurar Reações dos Botões</h2>
                  <Button
                    variant="ghost"

                    onClick={() => {
                      setShowReactionConfig(null);
                      setSelectedTemplateDetails(null);
                    }}
                  >
                    ✕
                  </Button>
                </div>

                {selectedTemplateDetails ? (
                  // Configuração para Templates
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <h3 className="font-medium text-blue-900 dark:text-blue-100">
                        Template: {selectedTemplateDetails.name}
                      </h3>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Configure reações para os botões deste template
                      </p>
                    </div>

                    <ButtonEmojiMapper
                      messageId={showReactionConfig}
                      inboxId={caixaId}
                      buttons={
                        selectedTemplateDetails.components
                          ?.find((c: any) => c.type === 'BUTTONS')
                          ?.buttons?.map((btn: any, index: number) => ({
                            id: `template_${showReactionConfig}_btn_${index}`,
                            text: btn.text,
                            type: btn.type
                          })) || []
                      }
                      showSaveButton={true}
                    />
                  </div>
                ) : (
                  // Configuração para Mensagens Interativas
                  <div className="space-y-4">
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <h3 className="font-medium text-green-900 dark:text-green-100">
                        Mensagem Interativa
                      </h3>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        Configure reações para os botões desta mensagem interativa
                      </p>
                    </div>

                    <ButtonEmojiMapper
                      messageId={showReactionConfig}
                      inboxId={caixaId}
                      buttons={[]} // Será carregado pelo componente baseado no messageId
                      showSaveButton={true}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Diálogo de Configuração de Variáveis */}
        {showVariablesDialog && selectedTemplateForVariables && (
          <TemplateVariablesDialog
            isOpen={showVariablesDialog}
            onClose={() => {
              setShowVariablesDialog(false);
              setSelectedTemplateForVariables(null);
              setPendingMappingData(null);
            }}
            onSave={handleVariablesSave}
            templateId={selectedTemplateForVariables.id}
            templateName={selectedTemplateForVariables.name}
            components={selectedTemplateForVariables.whatsappOfficialInfo?.components || []}
            accountId={caixaId} // Usando caixaId como accountId por enquanto

          />
        )}

        {/* Diálogo de confirmação de exclusão */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir mapeamento</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir este mapeamento? Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default MapeamentoTab;
