'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTheme } from 'next-themes';
import type { Node } from '@xyflow/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  Check,
  Clock,
  XCircle,
  FileEdit,
  Plus,
  Trash2,
  Smartphone,
  Search,
  Loader2,
  Link,
  Phone,
  Copy,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  TemplateNodeData,
  TemplateButton,
  TemplateCategory,
  TemplateButtonType,
  FlowNodeData,
} from '@/types/flow-builder';
import {
  generateTemplateButtonId,
  validateTemplateNodeData,
  extractVariables,
  TEMPLATE_LIMITS,
  createTemplateButton,
} from '@/lib/flow-builder/templateElements';

// =============================================================================
// TYPES
// =============================================================================

interface TemplateConfigDialogProps {
  node: Node | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateNodeData: (nodeId: string, data: Partial<FlowNodeData>) => void;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  category: string;
  language: string;
  components?: Array<{
    type: string;
    text?: string;
    format?: string;
    buttons?: Array<{ type: string; text: string }>;
  }>;
}

// =============================================================================
// STATUS HELPERS
// =============================================================================

function getStatusIcon(status: TemplateNodeData['status']) {
  switch (status) {
    case 'APPROVED':
      return <Check className="h-3 w-3" />;
    case 'PENDING':
      return <Clock className="h-3 w-3" />;
    case 'REJECTED':
      return <XCircle className="h-3 w-3" />;
    case 'DRAFT':
    default:
      return <FileEdit className="h-3 w-3" />;
  }
}

function getStatusColors(status: TemplateNodeData['status']) {
  switch (status) {
    case 'APPROVED':
      return 'bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-400 dark:border-green-800';
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800';
    case 'REJECTED':
      return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-800';
    case 'DRAFT':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700';
  }
}

function getStatusLabel(status: TemplateNodeData['status']) {
  switch (status) {
    case 'APPROVED':
      return 'Aprovado';
    case 'PENDING':
      return 'Pendente';
    case 'REJECTED':
      return 'Rejeitado';
    case 'DRAFT':
    default:
      return 'Rascunho';
  }
}

// =============================================================================
// WHATSAPP PREVIEW
// =============================================================================

interface TemplatePreviewProps {
  header?: { type: string; content?: string; mediaUrl?: string };
  body?: string;
  footer?: string;
  buttons?: Array<{ text: string; type: string }>;
}

function TemplatePreview({ header, body, footer, buttons }: TemplatePreviewProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const hasContent = header?.content || header?.mediaUrl || body || footer || (buttons && buttons.length > 0);

  // Parse variables in text
  const renderText = (text: string) => {
    return text.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
      return `[${varName}]`;
    });
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 mb-3 text-muted-foreground">
        <Smartphone className="h-4 w-4" />
        <span className="text-xs font-medium">Preview WhatsApp</span>
      </div>

      <div
        className={cn(
          'w-[260px] rounded-2xl overflow-hidden shadow-lg border',
          isDark ? 'bg-[#0b141a]' : 'bg-[#efeae2]'
        )}
      >
        {/* WhatsApp header bar */}
        <div
          className={cn(
            'px-3 py-2 flex items-center gap-2',
            isDark ? 'bg-[#202c33]' : 'bg-[#075e54]'
          )}
        >
          <div className="w-7 h-7 rounded-full bg-gray-400 flex items-center justify-center">
            <span className="text-white text-xs font-bold">C</span>
          </div>
          <div className="flex-1">
            <p className="text-white text-sm font-medium">Chatwit</p>
            <p className="text-white/70 text-[10px]">online</p>
          </div>
        </div>

        {/* Message area */}
        <div className="p-3 min-h-[280px] max-h-[350px] overflow-y-auto">
          {!hasContent ? (
            <div className="flex items-center justify-center h-[250px]">
              <p
                className={cn(
                  'text-xs text-center px-4',
                  isDark ? 'text-gray-500' : 'text-gray-400'
                )}
              >
                Configure o template para ver o preview
              </p>
            </div>
          ) : (
            <div className="flex justify-start">
              <div
                className={cn(
                  'max-w-[220px] rounded-lg overflow-hidden shadow-sm',
                  isDark ? 'bg-[#202c33]' : 'bg-white'
                )}
              >
                {/* Header */}
                {header?.type === 'TEXT' && header.content && (
                  <div className="px-2.5 pt-2.5">
                    <p
                      className={cn(
                        'text-sm font-bold',
                        isDark ? 'text-white' : 'text-gray-900'
                      )}
                    >
                      {renderText(header.content)}
                    </p>
                  </div>
                )}
                {['IMAGE', 'VIDEO'].includes(header?.type || '') && (
                  <div className="w-full h-28 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <span className="text-xs text-gray-400">
                      {header?.type === 'IMAGE' ? '🖼️ Imagem' : '🎬 Vídeo'}
                    </span>
                  </div>
                )}
                {header?.type === 'DOCUMENT' && (
                  <div className="w-full h-14 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <span className="text-xs text-gray-400">📄 Documento</span>
                  </div>
                )}

                {/* Body */}
                <div className="p-2.5 space-y-1">
                  {body && (
                    <p
                      className={cn(
                        'text-sm break-words whitespace-pre-wrap',
                        isDark ? 'text-gray-200' : 'text-gray-800'
                      )}
                    >
                      {renderText(body)}
                    </p>
                  )}

                  {/* Footer */}
                  {footer && (
                    <p
                      className={cn(
                        'text-[11px] mt-1',
                        isDark ? 'text-gray-400' : 'text-gray-500'
                      )}
                    >
                      {footer}
                    </p>
                  )}

                  {/* Timestamp */}
                  <div className="flex justify-end">
                    <span
                      className={cn(
                        'text-[10px]',
                        isDark ? 'text-gray-500' : 'text-gray-400'
                      )}
                    >
                      {new Date().toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {/* Buttons */}
                {buttons && buttons.length > 0 && (
                  <div
                    className={cn(
                      'border-t',
                      isDark ? 'border-gray-700' : 'border-gray-100'
                    )}
                  >
                    {buttons.map((btn, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'w-full px-3 py-2 text-center text-sm font-medium flex items-center justify-center gap-1.5',
                          isDark
                            ? 'text-[#00a884] border-gray-700'
                            : 'text-[#00a884] border-gray-100',
                          idx < buttons.length - 1 && 'border-b'
                        )}
                      >
                        {btn.type === 'URL' && <Link className="h-3 w-3" />}
                        {btn.type === 'PHONE_NUMBER' && <Phone className="h-3 w-3" />}
                        {btn.type === 'COPY_CODE' && <Copy className="h-3 w-3" />}
                        {btn.type === 'QUICK_REPLY' && <ChevronRight className="h-3 w-3" />}
                        {btn.text || 'Botão'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TEMPLATE CONFIG DIALOG
// =============================================================================

export function TemplateConfigDialog({
  node,
  open,
  onOpenChange,
  onUpdateNodeData,
}: TemplateConfigDialogProps) {
  const [mode, setMode] = useState<'import' | 'create'>('create');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [templateName, setTemplateName] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('MARKETING');
  const [language, setLanguage] = useState('pt_BR');
  const [headerType, setHeaderType] = useState<'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'>('NONE');
  const [headerContent, setHeaderContent] = useState('');
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [buttons, setButtons] = useState<TemplateButton[]>([]);

  // Extract current node data
  const nodeData = useMemo(() => {
    if (!node) return null;
    return node.data as unknown as TemplateNodeData;
  }, [node]);

  // Initialize form from node data
  useEffect(() => {
    if (!nodeData) return;

    if (nodeData.templateId) {
      setMode('import');
    } else {
      setMode(nodeData.mode === 'import' ? 'import' : 'create');
    }

    setTemplateName(nodeData.templateName || '');
    setCategory(nodeData.category || 'MARKETING');
    setLanguage(nodeData.language || 'pt_BR');
    setHeaderType(nodeData.header?.type || 'NONE');
    setHeaderContent(nodeData.header?.content || '');
    setHeaderMediaUrl(nodeData.header?.mediaUrl || '');
    setBodyText(nodeData.body?.text || '');
    setFooterText(nodeData.footer?.text || '');
    setButtons(nodeData.buttons || []);
  }, [nodeData]);

  // Fetch approved templates when switching to import mode
  useEffect(() => {
    if (mode === 'import' && open) {
      fetchTemplates();
    }
  }, [mode, open]);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/mtf-diamante/templates');
      if (response.ok) {
        const data = await response.json();
        // Filter to show only approved templates
        const approvedTemplates = (data.templates || data || []).filter(
          (t: WhatsAppTemplate) => t.status === 'APPROVED'
        );
        setTemplates(approvedTemplates);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Erro ao carregar templates');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter templates by search
  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return templates;
    const q = searchQuery.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }, [templates, searchQuery]);

  // Extract body variables
  const bodyVariables = useMemo(() => extractVariables(bodyText), [bodyText]);
  const headerVariables = useMemo(
    () => (headerType === 'TEXT' ? extractVariables(headerContent) : []),
    [headerType, headerContent]
  );

  // Validation
  const validation = useMemo(() => {
    const data: TemplateNodeData = {
      label: templateName,
      isConfigured: false,
      mode: 'create',
      status: 'DRAFT',
      templateName,
      category,
      language,
      header: headerType !== 'NONE' ? { type: headerType, content: headerContent, mediaUrl: headerMediaUrl } : undefined,
      body: { text: bodyText, variables: bodyVariables },
      footer: footerText ? { text: footerText } : undefined,
      buttons,
    };
    return validateTemplateNodeData(data);
  }, [templateName, category, language, headerType, headerContent, headerMediaUrl, bodyText, bodyVariables, footerText, buttons]);

  // Handle import template
  const handleImportTemplate = useCallback(
    (template: WhatsAppTemplate) => {
      if (!node) return;

      // Extract components
      const headerComp = template.components?.find((c) => c.type === 'HEADER');
      const bodyComp = template.components?.find((c) => c.type === 'BODY');
      const footerComp = template.components?.find((c) => c.type === 'FOOTER');
      const buttonsComp = template.components?.find((c) => c.type === 'BUTTONS');

      // Build buttons with flow IDs
      const importedButtons: TemplateButton[] =
        buttonsComp?.buttons?.map((btn) => ({
          id: generateTemplateButtonId(),
          type: (btn.type as TemplateButtonType) || 'QUICK_REPLY',
          text: btn.text,
        })) || [];

      onUpdateNodeData(node.id, {
        label: template.name,
        isConfigured: true,
        mode: 'import',
        status: template.status as TemplateNodeData['status'],
        templateId: template.id,
        templateName: template.name,
        category: template.category as TemplateCategory,
        language: template.language,
        header:
          headerComp?.format === 'TEXT'
            ? { type: 'TEXT', content: headerComp.text }
            : headerComp?.format
              ? { type: headerComp.format as 'IMAGE' | 'VIDEO' | 'DOCUMENT' }
              : undefined,
        body: bodyComp?.text ? { text: bodyComp.text, variables: extractVariables(bodyComp.text) } : undefined,
        footer: footerComp?.text ? { text: footerComp.text } : undefined,
        buttons: importedButtons,
        importedComponents: template.components,
      } as Partial<TemplateNodeData>);

      toast.success(`Template "${template.name}" importado`);
      onOpenChange(false);
    },
    [node, onUpdateNodeData, onOpenChange]
  );

  // Handle create/save template
  const handleSaveTemplate = useCallback(async () => {
    if (!node) return;

    // Validate
    if (!validation.valid) {
      toast.error(validation.errors[0]);
      return;
    }

    // Build template data
    const templateData: Partial<TemplateNodeData> = {
      label: templateName || 'Template',
      isConfigured: true,
      mode: 'create',
      status: 'DRAFT',
      templateName,
      category,
      language,
      header:
        headerType !== 'NONE'
          ? {
              type: headerType,
              content: headerType === 'TEXT' ? headerContent : undefined,
              mediaUrl: ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)
                ? headerMediaUrl
                : undefined,
              variables: headerVariables,
            }
          : undefined,
      body: {
        text: bodyText,
        variables: bodyVariables,
        namedParams: bodyVariables.map((v) => ({ name: v, example: `exemplo_${v}` })),
      },
      footer: footerText ? { text: footerText } : undefined,
      buttons,
    };

    onUpdateNodeData(node.id, templateData);
    toast.success('Template salvo no fluxo');
    onOpenChange(false);
  }, [
    node,
    validation,
    templateName,
    category,
    language,
    headerType,
    headerContent,
    headerMediaUrl,
    headerVariables,
    bodyText,
    bodyVariables,
    footerText,
    buttons,
    onUpdateNodeData,
    onOpenChange,
  ]);

  // Handle submit to Meta
  const handleSubmitToMeta = useCallback(async () => {
    if (!node) return;

    // Validate
    if (!validation.valid) {
      toast.error(validation.errors[0]);
      return;
    }

    if (!templateName) {
      toast.error('Nome do template é obrigatório para enviar à Meta');
      return;
    }

    setIsSubmitting(true);

    try {
      // Build payload for Meta API
      const payload = {
        name: templateName,
        category,
        language,
        components: [] as Array<Record<string, unknown>>,
        parameter_format: 'NAMED',
      };

      // Add header component
      if (headerType !== 'NONE') {
        const headerComp: Record<string, unknown> = { type: 'HEADER' };
        if (headerType === 'TEXT') {
          headerComp.format = 'TEXT';
          headerComp.text = headerContent;
          if (headerVariables.length > 0) {
            headerComp.example = { header_text: headerVariables.map((v) => `exemplo_${v}`) };
          }
        } else {
          headerComp.format = headerType;
        }
        payload.components.push(headerComp);
      }

      // Add body component
      payload.components.push({
        type: 'BODY',
        text: bodyText,
        ...(bodyVariables.length > 0 && {
          example: { body_text: [bodyVariables.map((v) => `exemplo_${v}`)] },
        }),
      });

      // Add footer component
      if (footerText) {
        payload.components.push({
          type: 'FOOTER',
          text: footerText,
        });
      }

      // Add buttons component
      if (buttons.length > 0) {
        payload.components.push({
          type: 'BUTTONS',
          buttons: buttons.map((btn) => {
            const metaBtn: Record<string, unknown> = {
              type: btn.type,
              text: btn.text,
            };
            if (btn.type === 'URL' && btn.url) metaBtn.url = btn.url;
            if (btn.type === 'PHONE_NUMBER' && btn.phoneNumber) metaBtn.phone_number = btn.phoneNumber;
            if (btn.type === 'COPY_CODE' && btn.exampleCode) metaBtn.example = [btn.exampleCode];
            return metaBtn;
          }),
        });
      }

      // Submit to API
      const response = await fetch('/api/admin/mtf-diamante/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao criar template');
      }

      const result = await response.json();

      // Update node with pending status and template ID
      onUpdateNodeData(node.id, {
        label: templateName,
        isConfigured: true,
        mode: 'create',
        status: 'PENDING',
        templateId: result.templateId || result.id,
        metaTemplateId: result.metaTemplateId,
        templateName,
        category,
        language,
        header:
          headerType !== 'NONE'
            ? { type: headerType, content: headerContent, mediaUrl: headerMediaUrl, variables: headerVariables }
            : undefined,
        body: { text: bodyText, variables: bodyVariables },
        footer: footerText ? { text: footerText } : undefined,
        buttons,
      } as Partial<TemplateNodeData>);

      toast.success('Template enviado para aprovação da Meta');
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting template:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar template');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    node,
    validation,
    templateName,
    category,
    language,
    headerType,
    headerContent,
    headerMediaUrl,
    headerVariables,
    bodyText,
    bodyVariables,
    footerText,
    buttons,
    onUpdateNodeData,
    onOpenChange,
  ]);

  // Add button
  const handleAddButton = useCallback(
    (type: TemplateButtonType) => {
      if (buttons.length >= TEMPLATE_LIMITS.maxButtons) {
        toast.error(`Máximo de ${TEMPLATE_LIMITS.maxButtons} botões`);
        return;
      }
      setButtons([...buttons, createTemplateButton(type, 'Novo botão')]);
    },
    [buttons]
  );

  // Remove button
  const handleRemoveButton = useCallback(
    (index: number) => {
      setButtons(buttons.filter((_, i) => i !== index));
    },
    [buttons]
  );

  // Update button
  const handleUpdateButton = useCallback(
    (index: number, updates: Partial<TemplateButton>) => {
      setButtons(
        buttons.map((btn, i) => (i === index ? { ...btn, ...updates } : btn))
      );
    },
    [buttons]
  );

  if (!node) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center gap-3 space-y-0">
          <FileText className="h-5 w-5 text-emerald-500" />
          <div className="flex-1">
            <DialogTitle className="text-base">
              {nodeData?.templateName || 'Template Oficial WhatsApp'}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure um template oficial para envio via WhatsApp
            </p>
          </div>
          {nodeData?.status && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-2 py-0.5 font-medium gap-1 border',
                getStatusColors(nodeData.status)
              )}
            >
              {getStatusIcon(nodeData.status)}
              {getStatusLabel(nodeData.status)}
            </Badge>
          )}
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex gap-2 p-1 bg-muted/50 rounded-lg">
          <button
            type="button"
            onClick={() => setMode('import')}
            className={cn(
              'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              mode === 'import'
                ? 'bg-background shadow text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Importar template aprovado
          </button>
          <button
            type="button"
            onClick={() => setMode('create')}
            className={cn(
              'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              mode === 'create'
                ? 'bg-background shadow text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Criar novo template
          </button>
        </div>

        <div className="flex gap-6 flex-1 min-h-0">
          {/* Left: Form */}
          <ScrollArea className="flex-1 min-w-0 pr-4">
            <div className="py-2 space-y-4">
              {mode === 'import' ? (
                /* IMPORT MODE */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Buscar template</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por nome..."
                        className="pl-9 text-sm"
                      />
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredTemplates.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">
                        Nenhum template aprovado encontrado
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setMode('create')}
                      >
                        Criar novo template
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[350px] overflow-y-auto">
                      {filteredTemplates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleImportTemplate(template)}
                          className="w-full text-left rounded-lg border p-3 hover:bg-accent transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm truncate">
                              {template.name}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] shrink-0',
                                getStatusColors(template.status)
                              )}
                            >
                              {getStatusLabel(template.status)}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {template.category}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {template.language}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* CREATE MODE */
                <div className="space-y-5">
                  {/* Basic info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Nome do template</Label>
                      <Input
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                        placeholder="meu_template"
                        className="text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Apenas letras minúsculas, números e underscore
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Categoria</Label>
                      <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
                        <SelectTrigger className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MARKETING">Marketing</SelectItem>
                          <SelectItem value="UTILITY">Utilitário</SelectItem>
                          <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Header */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Header (opcional)</Label>
                    <Select value={headerType} onValueChange={(v) => setHeaderType(v as typeof headerType)}>
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Nenhum</SelectItem>
                        <SelectItem value="TEXT">Texto</SelectItem>
                        <SelectItem value="IMAGE">Imagem</SelectItem>
                        <SelectItem value="VIDEO">Vídeo</SelectItem>
                        <SelectItem value="DOCUMENT">Documento</SelectItem>
                      </SelectContent>
                    </Select>
                    {headerType === 'TEXT' && (
                      <Input
                        value={headerContent}
                        onChange={(e) => setHeaderContent(e.target.value)}
                        placeholder="Título do template (até 60 caracteres)"
                        maxLength={60}
                        className="text-sm mt-2"
                      />
                    )}
                    {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && (
                      <Input
                        value={headerMediaUrl}
                        onChange={(e) => setHeaderMediaUrl(e.target.value)}
                        placeholder="URL da mídia"
                        className="text-sm mt-2"
                      />
                    )}
                  </div>

                  {/* Body */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Corpo da mensagem</Label>
                      <span
                        className={cn(
                          'text-[10px]',
                          bodyText.length > TEMPLATE_LIMITS.bodyMaxLength
                            ? 'text-red-500'
                            : 'text-muted-foreground'
                        )}
                      >
                        {bodyText.length}/{TEMPLATE_LIMITS.bodyMaxLength}
                      </span>
                    </div>
                    <Textarea
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                      placeholder="Digite o texto da mensagem. Use {{variavel}} para parâmetros."
                      rows={4}
                      className="text-sm resize-y"
                    />
                    {bodyVariables.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {bodyVariables.map((v) => (
                          <Badge key={v} variant="secondary" className="text-[10px]">
                            {`{{${v}}}`}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Rodapé (opcional)</Label>
                      <span
                        className={cn(
                          'text-[10px]',
                          footerText.length > TEMPLATE_LIMITS.footerMaxLength
                            ? 'text-red-500'
                            : 'text-muted-foreground'
                        )}
                      >
                        {footerText.length}/{TEMPLATE_LIMITS.footerMaxLength}
                      </span>
                    </div>
                    <Input
                      value={footerText}
                      onChange={(e) => setFooterText(e.target.value)}
                      placeholder="Texto do rodapé"
                      maxLength={60}
                      className="text-sm"
                    />
                  </div>

                  {/* Buttons */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Botões</Label>
                      <span className="text-[10px] text-muted-foreground">
                        {buttons.length}/{TEMPLATE_LIMITS.maxButtons}
                      </span>
                    </div>

                    {buttons.map((btn, idx) => (
                      <div key={btn.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {btn.type.replace('_', ' ')}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => handleRemoveButton(idx)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <Input
                          value={btn.text}
                          onChange={(e) => handleUpdateButton(idx, { text: e.target.value })}
                          placeholder="Texto do botão"
                          maxLength={25}
                          className="text-sm"
                        />
                        {btn.type === 'URL' && (
                          <Input
                            value={btn.url || ''}
                            onChange={(e) => handleUpdateButton(idx, { url: e.target.value })}
                            placeholder="https://..."
                            className="text-sm"
                          />
                        )}
                        {btn.type === 'PHONE_NUMBER' && (
                          <Input
                            value={btn.phoneNumber || ''}
                            onChange={(e) => handleUpdateButton(idx, { phoneNumber: e.target.value })}
                            placeholder="+5511999999999"
                            className="text-sm"
                          />
                        )}
                        {btn.type === 'COPY_CODE' && (
                          <Input
                            value={btn.exampleCode || ''}
                            onChange={(e) => handleUpdateButton(idx, { exampleCode: e.target.value })}
                            placeholder="Código (até 15 caracteres)"
                            maxLength={15}
                            className="text-sm"
                          />
                        )}
                      </div>
                    ))}

                    {buttons.length < TEMPLATE_LIMITS.maxButtons && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddButton('QUICK_REPLY')}
                          className="text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Resposta rápida
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddButton('URL')}
                          className="text-xs"
                        >
                          <Link className="h-3 w-3 mr-1" />
                          URL
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddButton('PHONE_NUMBER')}
                          className="text-xs"
                        >
                          <Phone className="h-3 w-3 mr-1" />
                          Telefone
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddButton('COPY_CODE')}
                          className="text-xs"
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copiar código
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Validation warnings */}
                  {validation.warnings.length > 0 && (
                    <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-3">
                      {validation.warnings.map((w, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-400">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {w}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Right: Preview */}
          <div className="hidden sm:block w-[280px] shrink-0 border-l pl-6">
            <TemplatePreview
              header={
                headerType !== 'NONE'
                  ? { type: headerType, content: headerContent, mediaUrl: headerMediaUrl }
                  : undefined
              }
              body={bodyText}
              footer={footerText}
              buttons={buttons.map((b) => ({ text: b.text, type: b.type }))}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {mode === 'create' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSaveTemplate}
                disabled={!validation.valid}
              >
                Salvar rascunho
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitToMeta}
                disabled={!validation.valid || !templateName || isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar para Meta'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TemplateConfigDialog;
