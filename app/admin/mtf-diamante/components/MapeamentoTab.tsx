"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrashIcon, PencilIcon, Smile, Settings } from "lucide-react";
import { ButtonEmojiMapper } from "./shared/ButtonEmojiMapper";
import { TemplateVariablesDialog } from "./shared/TemplateVariablesDialog";

interface MapeamentoTabProps {
  caixaId: string;
}

interface Mapeamento {
  id: string;
  intentName: string;
  templateId: string;
  template?: { id: string; name: string; type: string };
  // Campos de exibição para compatibilidade (não usados na API)
  mensagemInterativaId?: string | null;
  interactiveMessageId?: string | null;
  mensagemInterativa?: { id: string; nome: string };
  interactiveMessage?: { id: string; name: string };
}

interface Template {
  id: string;
  name: string;
}

interface MensagemInterativa {
  id: string;
  nome: string;
}

const MapeamentoTab = ({ caixaId }: MapeamentoTabProps) => {
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([]);
  const [mensagens, setMensagens] = useState<MensagemInterativa[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingGlobalTemplates, setUsingGlobalTemplates] = useState(false);

  // Form state
  const [id, setId] = useState<string | null>(null);
  const [intentName, setIntentName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedMensagem, setSelectedMensagem] = useState<string | null>(null);
  
  // Button reactions state
  const [showReactionConfig, setShowReactionConfig] = useState<string | null>(null);
  const [selectedTemplateDetails, setSelectedTemplateDetails] = useState<any>(null);
  
  // Template variables dialog state
  const [showVariablesDialog, setShowVariablesDialog] = useState(false);
  const [selectedTemplateForVariables, setSelectedTemplateForVariables] = useState<any>(null);
  const [pendingMappingData, setPendingMappingData] = useState<any>(null);

  const fetchData = async () => {
    if (!caixaId) {
      toast.error(
        "Selecione ou crie uma caixa de entrada para configurar mapeamentos"
      );
      return;
    }
    try {
      setLoading(true);

      // Buscar mapeamentos
      const mapResponse = await fetch(
        `/api/admin/mtf-diamante/mapeamentos/${caixaId}`
      );
      if (!mapResponse.ok) throw new Error("Falha ao buscar mapeamentos.");
      const mapData = await mapResponse.json();
      setMapeamentos(mapData);

      // Mensagens interativas são sempre globais do sistema
      try {
        const msgResponse = await fetch(
          `/api/admin/mtf-diamante/interactive-messages?caixaId=${caixaId}`
        );
        if (msgResponse.ok) {
          const msgData = await msgResponse.json();
          setMensagens(msgData);
        } else {
          throw new Error("Falha ao buscar mensagens interativas");
        }
      } catch (error) {
        console.log("Falha ao buscar mensagens interativas:", error);
        setMensagens([]);
      }

      // Tentar buscar templates específicos da caixa primeiro
      try {
        const templateResponse = await fetch(
          `/api/admin/mtf-diamante/templates/${caixaId}`
        );
        if (templateResponse.ok) {
          const templateData = await templateResponse.json();
          setTemplates(templateData);
          setUsingGlobalTemplates(false);
          return; // Se conseguiu buscar da caixa, não precisa do fallback
        }
      } catch (error) {
        console.log("Falha ao buscar templates da caixa, tentando fallback...");
      }

      // Fallback: buscar templates globais da conta
      try {
        const globalTemplateResponse = await fetch(
          `/api/admin/mtf-diamante/templates`
        );
        if (globalTemplateResponse.ok) {
          const globalTemplateData = await globalTemplateResponse.json();
          const templates = globalTemplateData.success
            ? globalTemplateData.templates
            : globalTemplateData;
          setTemplates(templates);
          setUsingGlobalTemplates(true);

          // Mostrar aviso sobre uso de templates globais
          if (templates.length > 0) {
            toast.info("Usando templates das configurações globais", {
              description:
                "Não foram encontrados templates específicos para esta caixa.",
            });
          }
        } else {
          throw new Error("Falha ao buscar templates globais.");
        }
      } catch (error) {
        throw new Error("Falha ao buscar templates.");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [caixaId]);

  const resetForm = () => {
    setId(null);
    setIntentName("");
    setSelectedTemplate(null);
    setSelectedMensagem(null);
  };

  const handleEdit = (mapeamento: Mapeamento) => {
    setId(mapeamento.id);
    setIntentName(mapeamento.intentName);
    
    // Verificar se é template ou mensagem interativa baseado no tipo
    if (mapeamento.template?.type === 'INTERACTIVE_MESSAGE') {
      setSelectedMensagem(mapeamento.templateId);
      setSelectedTemplate(null);
    } else {
      setSelectedTemplate(mapeamento.templateId);
      setSelectedMensagem(null);
    }
  };

  const handleDelete = async (mappingId: string) => {
    if (!confirm("Tem certeza que deseja excluir este mapeamento?")) return;
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
      fetchData(); // Refresh
    } catch (error) {
      toast.error((error as Error).message);
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    
    // Validar que pelo menos uma opção foi selecionada
    if (!selectedTemplate && !selectedMensagem) {
      toast.error("Selecione um template ou mensagem interativa");
      return;
    }
    
    const templateId = selectedTemplate || selectedMensagem;
    
    // Se for template, verificar se tem variáveis
    if (selectedTemplate) {
      // Garantir mídia pública do HEADER (quando aplicável)
      try {
        const ensureRes = await fetch('/api/admin/mtf-diamante/templates/ensure-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId }),
        });
        if (!ensureRes.ok) {
          const err = await ensureRes.json().catch(() => ({}));
          console.warn('Falha ao garantir mídia pública:', err?.error || ensureRes.statusText);
        }
      } catch (err) {
        console.warn('Erro ao chamar ensure-media:', err);
      }

      const { hasVariables, templateInfo } = await checkTemplateVariables(templateId!);
      
      if (hasVariables) {
        // Mostrar diálogo de configuração de variáveis
        setSelectedTemplateForVariables(templateInfo);
        setPendingMappingData({
          id,
          intentName,
          templateId,
          caixaId,
        });
        setShowVariablesDialog(true);
        return;
      }
    }
    
    // Salvar mapeamento diretamente se não tem variáveis
    await saveMappingData({
      id,
      intentName,
      templateId,
      caixaId,
    });
  };

  const saveMappingData = async (mappingData: any, customVariables?: Record<string, string>) => {
    try {
      const response = await fetch(`/api/admin/mtf-diamante/mapeamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...mappingData,
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
      fetchData();
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

  if (loading) return <div>Carregando...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {id ? "Editar Mapeamento" : "Novo Mapeamento de Intenção"}
        </CardTitle>
        <CardDescription>
          Associe uma intenção do Dialogflow a uma resposta automática (template
          ou mensagem interativa).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          onSubmit={handleSubmit}
          className="space-y-4 p-4 border rounded-lg"
        >
          <Input
            placeholder="Nome da Intenção (ex: Default Welcome Intent)"
            value={intentName}
            onChange={(e) => setIntentName(e.target.value)}
            required
          />
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Label>Responder com Template</Label>
                {usingGlobalTemplates && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    Configurações Globais
                  </span>
                )}
              </div>
              <Select
                onValueChange={(value) => {
                  setSelectedTemplate(value);
                  setSelectedMensagem(null);
                }}
                value={selectedTemplate || ""}
                disabled={!!selectedMensagem}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um Template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-sm font-medium self-end pb-2">OU</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Label>Responder com Mensagem Interativa</Label>
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                  Sistema Global
                </span>
              </div>
              <Select
                onValueChange={(value) => {
                  setSelectedMensagem(value);
                  setSelectedTemplate(null);
                }}
                value={selectedMensagem || ""}
                disabled={!!selectedTemplate}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma Mensagem" />
                </SelectTrigger>
                <SelectContent>
                  {mensagens.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit">
              {id ? "Atualizar" : "Salvar"} Mapeamento
            </Button>
            {id && (
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
            )}
          </div>
        </form>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Intenção</TableHead>
              <TableHead>Resposta Associada</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mapeamentos.map((map) => (
              <TableRow key={map.id}>
                <TableCell className="font-medium">{map.intentName}</TableCell>
                <TableCell>
                  {map.template ? (
                    <span className="text-xs font-semibold bg-blue-100 text-blue-800 p-1 rounded">
                      TEMPLATE: {map.template.name}
                    </span>
                  ) : (
                    ""
                  )}
                  {map.mensagemInterativa ? (
                    <span className="text-xs font-semibold bg-green-100 text-green-800 p-1 rounded">
                      MENSAGEM: {map.mensagemInterativa.nome}
                    </span>
                  ) : (
                    ""
                  )}
                  {map.interactiveMessage ? (
                    <span className="text-xs font-semibold bg-purple-100 text-purple-800 p-1 rounded">
                      INTERATIVA: {map.interactiveMessage.name}
                    </span>
                  ) : (
                    ""
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleConfigureReactions(map)}
                      title="Configurar reações dos botões"
                    >
                      <Smile className="h-4 w-4 text-yellow-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(map)}
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(map.id)}
                    >
                      <TrashIcon className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Modal de Configuração de Reações */}
        {showReactionConfig && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Configurar Reações dos Botões</h2>
                  <Button
                    variant="ghost"
                    size="sm"
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
      </CardContent>
    </Card>
  );
};

export default MapeamentoTab;
