"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
// ...existing code... (removed unused Textarea / Select imports)
import {
  TrashIcon,
  PencilIcon,
  Upload,
    Download,
  Plus,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import InteractiveMessageCreator from "./InteractiveMessageCreator";
import type { InteractiveMessageType } from "./interactive-message-creator/types";
import { useMtfData } from "@/app/admin/mtf-diamante/context/MtfDataProvider";
import { useInteractiveMessages } from "@/app/admin/mtf-diamante/hooks/useInteractiveMessages";
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from "@/components/ui/dialog";
  import { ScrollArea } from "@/components/ui/scroll-area";
  import { Label } from "@/components/ui/label";
  import { Checkbox } from "@/components/ui/checkbox";
  import { GlowEffect } from "@/components/ui/glow-effect";

interface MensagensInterativasTabProps {
  caixaId: string;
}

interface Botao {
  id?: string;
  titulo: string;
}

interface Mensagem {
  id: string;
  nome: string;
  texto: string;
  headerTipo?: string | null;
  headerConteudo?: string | null;
  rodape?: string | null;
  botoes: Botao[];
  type?: InteractiveMessageType;
}

type AnyMsg = any;

const pick = (...vals: any[]) =>
  vals.find(v => typeof v === "string" && v.trim().length > 0);

// 🛠️ Versão mais agressiva que cobre todos os caminhos possíveis
const normalizeMessage = (m: AnyMsg): Mensagem & { type?: InteractiveMessageType } => {
  // header/footer/action em múltiplos caminhos
  const header =
    m.header ??
    m.content?.header ??
    m.interactiveContent?.header ??
    null;

  const footer =
    m.footer ??
    m.content?.footer ??
    m.interactiveContent?.footer ??
    null;

  const action =
    m.action ??
    m.content?.action ??
    m.interactiveContent?.action ??
    null;

  // coleciona possíveis fontes de botões
  const candidates: any[] = [];
  if (Array.isArray(action?.buttons)) candidates.push(...action.buttons);
  // ✅ Considerar também quick_replies (Instagram/Facebook)
  if (Array.isArray((action as any)?.quick_replies)) candidates.push(...(action as any).quick_replies);
  if (Array.isArray(m.botoes)) candidates.push(...m.botoes);
  if (Array.isArray(m.content?.action?.buttons))
    candidates.push(...m.content.action.buttons);
  if (Array.isArray(m.content?.action?.quick_replies))
    candidates.push(...m.content.action.quick_replies);
  if (Array.isArray(m.actionReplyButton?.buttons))
    candidates.push(...m.actionReplyButton.buttons);
  if (Array.isArray(m.interactiveContent?.actionReplyButton?.buttons))
    candidates.push(...m.interactiveContent.actionReplyButton.buttons);
  if (Array.isArray(m.content?.interactiveContent?.actionReplyButton?.buttons))
    candidates.push(...m.content.interactiveContent.actionReplyButton.buttons);

  // remove duplicados por id
  const seen = new Map<string, any>();
  for (const b of candidates) {
    const key = b?.id || b?.reply?.id || b?.payload || JSON.stringify(b);
    if (!seen.has(key)) seen.set(key, b);
  }
  const botoes: Botao[] = Array.from(seen.values()).map((b: any) => ({
    // Para quick_replies, usar payload como id
    id: b?.id || b?.reply?.id || b?.payload,
    titulo: b?.title || b?.reply?.title || b?.text || b?.titulo || "",
  }));

  // nome e texto vindos de vários lugares
  const nome =
    pick(
      m.name,
      m.nome,
      m.title,
      m.titulo,
      m.displayName,
      m.content?.name,
      m.content?.titulo
    ) || "";

  const texto =
    pick(
      m.body?.text,
      m.texto,
      m.content?.body?.text,
      m.interactiveContent?.body?.text,
      m.message,
      m.description
    ) || "";

  const headerTipo =
    header?.type ?? m.headerTipo ?? null;

  const headerConteudo =
    pick(
      header?.content,
      (header as any)?.text,
      (header as any)?.media_url,
      m.headerConteudo
    ) ?? null;

  const rodape = pick(footer?.text, m.rodape) ?? null;

  return {
    id: m.id,
    nome,
    texto,
    headerTipo,
    headerConteudo,
    rodape,
    botoes,
    // ✅ Preservar/deduzir o tipo para edição correta
    type: (m.type as InteractiveMessageType) || (m.content?.type as InteractiveMessageType) || (() => {
      // Deduzir pelo formato dos botões quando possível
      if (Array.isArray((action as any)?.quick_replies) || Array.isArray(m.content?.action?.quick_replies)) {
        return 'quick_replies' as InteractiveMessageType;
      }
      // Se algum botão tem shape de Template de Botões do Instagram
      const list = Array.from(seen.values());
      const hasButtonTemplate = list.some((btn: any) => btn?.type === 'postback' || btn?.type === 'url');
      if (hasButtonTemplate) return 'button_template' as InteractiveMessageType;
      // Caso contrário, manter como 'button' (WhatsApp) por compatibilidade
      return 'button' as InteractiveMessageType;
    })(),
  };
};

const MensagensInterativasTab = ({ caixaId }: MensagensInterativasTabProps) => {
  // ✅ CORRIGIDO: Usando hooks dedicados ao invés dos deprecated
  const { 
    interactiveMessages, 
    caixas, 
    refreshCaixas, 
    buttonReactions, 
    refreshButtonReactions, 
    deleteMessage, 
    isLoadingMessages,
    addButtonReaction,
    updateButtonReaction 
  } = useMtfData();
  const { addMessage, updateMessage } = useInteractiveMessages(caixaId);
  
  const [currentView, setCurrentView] = useState<"list" | "create" | "edit">(
    "list"
  );
  const [editingMessage, setEditingMessage] = useState<any>(null);
  
  // ✅ FIX: Proteção contra múltiplas operações simultâneas
  const isProcessingRef = useRef<boolean>(false);
  
  const mensagens = useMemo<Mensagem[]>(
    () => (interactiveMessages ?? []).map(normalizeMessage),
    [interactiveMessages]
  );

  // Debug temporário para verificar o shape dos dados
  useEffect(() => {
    console.log('[MensagensInterativasTab] interactiveMessages atualizado:', {
      count: interactiveMessages?.length || 0,
      sample: interactiveMessages?.[0] ? {
        id: interactiveMessages[0].id,
        name: interactiveMessages[0].name,
        texto: interactiveMessages[0].body?.text || '',
        full: interactiveMessages[0]
      } : null
    });
    
    if (mensagens.length > 0) {
      console.log('[MensagensInterativasTab] mensagens normalizadas:', {
        count: mensagens.length,
        sample: {
          id: mensagens[0].id,
          nome: mensagens[0].nome,
          texto: mensagens[0].texto
        }
      });
    }
  }, [interactiveMessages, mensagens]);
  
  // ✅ CORRIGIDO: Usar o estado de loading correto do SWR
  const loading = isLoadingMessages;

  // Import/Export state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [parsedMessages, setParsedMessages] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectAll, setSelectAll] = useState(false);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const channelType = useMemo(
    () => caixas?.find((c: any) => c.id === caixaId)?.channelType ?? null,
    [caixas, caixaId]
  );

  // local state to render glow only on hovered item and respect reduced-motion
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [prefersReduced, setPrefersReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handle = () => setPrefersReduced(Boolean(mq.matches));
    handle();
    try { mq.addEventListener?.("change", handle); } catch { mq.addListener?.(handle); }
    return () => { try { mq.removeEventListener?.("change", handle); } catch { mq.removeListener?.(handle); } };
  }, []);

  // Dados já vêm do contexto via useMemo - não precisa espelhar estado

  const handleEdit = (msg: any) => {
    // Detect type from normalized msg (agora preserva type)
    const detectedType = (msg?.type || 'button') as InteractiveMessageType;

    // Base fields
    const base: any = {
      id: msg.id,
      name: msg.nome,
      type: detectedType,
      body: { text: msg.texto },
      header: msg.headerTipo
        ? {
            type: msg.headerTipo === 'text' ? 'text' : msg.headerTipo,
            // Para header de texto, usamos 'content' (padrão do editor)
            content: msg.headerTipo === 'text' ? (msg.headerConteudo || '') : undefined,
            // Para header de mídia, mantemos media_url
            media_url: msg.headerTipo !== 'text' ? (msg.headerConteudo || '') : undefined,
          }
        : undefined,
      footer: msg.rodape ? { text: msg.rodape } : undefined,
    };

    // Map action depending on type
    if (detectedType === 'cta_url') {
      const actionData = msg?.content?.action || {};
      base.action = {
        type: 'cta_url',
        action: {
          displayText: actionData.displayText || actionData.display_text || actionData.cta_text || '',
          url: actionData.url || actionData.cta_url || '',
        },
        displayText: actionData.displayText || actionData.display_text || actionData.cta_text || '',
        url: actionData.url || actionData.cta_url || '',
      };
    } else if ((msg.botoes?.length || 0) > 0) {
      const buttonsSrc = msg.botoes || [];
      base.action = {
        type: 'button' as const,
        buttons: (buttonsSrc || []).map((b: any) => ({
          id: b.id || b?.reply?.id || `btn_${Date.now()}`,
          title: b.title || b?.reply?.title || b.titulo || '',
          type: (b.type as any) || 'reply',
          reply:
            b.reply || (b.title || b.titulo ? { id: b.id || `btn_${Date.now()}`, title: b.title || b.titulo } : undefined),
          // Para quick_replies, payload é essencial. Usar id como fallback.
          payload: b.payload || (b.id || b?.reply?.id),
          url: b.url,
        })),
      };
    }

    const convertedMessage = base;

    setEditingMessage(convertedMessage);
    setCurrentView("edit");
  };

  const handleDelete = async (mensagemId: string) => {
    try {
      console.log('🗑️ [MensagensInterativasTab] Iniciando deleção:', { mensagemId });
      
      // 1. Chama a API para deletar (já atualiza o cache automaticamente)
      await deleteMessage(mensagemId);
      
      console.log('✅ [MensagensInterativasTab] Mensagem excluída e cache atualizado');
      toast.success("Mensagem excluída com sucesso!");
    } catch (error) {
      console.error('❌ [MensagensInterativasTab] Erro na deleção:', error);
      toast.error((error as Error).message);
    }
  };

  const openDeleteDialog = (mensagemId: string) => {
    setPendingDeleteId(mensagemId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    await handleDelete(pendingDeleteId);
    setDeleteDialogOpen(false);
    setPendingDeleteId(null);
  };

  // -------- Export / Import --------
  const mapMensagemToPayload = (msg: Mensagem) => {
    const header = msg.headerTipo
      ? {
          type: msg.headerTipo === "text" ? "text" : msg.headerTipo,
          content:
            msg.headerTipo === "text" ? (msg.headerConteudo || "") : (msg.headerConteudo || ""),
          media_url:
            msg.headerTipo !== "text" ? (msg.headerConteudo || "") : undefined,
        }
      : undefined;

          const hasButtons = (msg.botoes?.length || 0) > 0;
          const action = hasButtons
            ? { buttons: msg.botoes?.map((b, i) => ({ id: b.id || `btn_${Date.now()}_${i}`, title: (b as any).title || b.titulo || "" })) }
            : undefined;

    return {
      name: msg.nome,
      type: hasButtons ? "button" : "text",
      header,
      body: { text: msg.texto || "" },
      footer: msg.rodape ? { text: msg.rodape } : undefined,
      action,
      originalId: msg.id,
    };
  };

  const handleExportAll = () => {
    try {
      const payload = mensagens.map(mapMensagemToPayload);
      const data = { inboxId: caixaId, messages: payload };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.download = `interactive-messages_${caixaId}_${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Exportação concluída.");
    } catch (e) {
      toast.error("Falha ao exportar mensagens.");
    }
  };

  const handleImportFileChange = async (file: File | null) => {
    setImportError(null);
    setParsedMessages([]);
    setSelectedIndexes(new Set());
    setSelectAll(false);
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const messages = Array.isArray(json)
        ? json
        : Array.isArray(json.messages)
          ? json.messages
          : [];
      if (!Array.isArray(messages) || messages.length === 0) {
        setImportError("Arquivo não contém mensagens válidas.");
        return;
      }
      // validações mínimas
      const valid = messages.filter((m: any) => m && typeof m.name === "string" && m.body && typeof m.body.text === "string");
      if (valid.length === 0) {
        setImportError("Nenhuma mensagem válida encontrada no arquivo.");
        return;
      }
      setParsedMessages(valid);
      setSelectedIndexes(new Set(valid.map((_, i) => i)));
      setSelectAll(true);
    } catch (err: any) {
      setImportError("Falha ao ler/parsear o arquivo JSON.");
    }
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedIndexes(new Set(parsedMessages.map((_, i) => i)));
    } else {
      setSelectedIndexes(new Set());
    }
  };

  const handleToggleIndex = (index: number, checked: boolean) => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(index);
      else next.delete(index);
      setSelectAll(next.size === parsedMessages.length && parsedMessages.length > 0);
      return next;
    });
  };

  const normalizeImportedMessage = (m: any) => {
    // Garante compatibilidade com o POST /interactive-messages
    const header = m.header || m.content?.header;
    const body = m.body || m.content?.body;
    const footer = m.footer || m.content?.footer;
    const action = m.action || m.content?.action;
  const type = m.type || m.content?.type || (action?.buttons ? "button" : "text");
    return {
      name: m.name || m.nome || "",
      type,
      header: header
        ? {
            type: header.type,
            content: header.text || header.content || header.media_url || "",
            media_url: header.media_url,
          }
        : undefined,
      body: { text: body?.text || "" },
      footer: footer ? { text: footer.text || "" } : undefined,
      action: action ? { 
        ...action, 
        type: type === "button" ? "button" : action.type || type 
      } : undefined,
    };
  };

  const regenerateButtonIds = (action: any, prefix: string) => {
    if (!action || !Array.isArray(action.buttons)) return action;
    const now = Date.now();
    const newButtons = action.buttons.map((btn: any, idx: number) => {
      const base = `${prefix}btn_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
      const newId = base;
      return {
        ...btn,
        id: newId,
        reply: btn.reply ? { ...btn.reply, id: newId, title: btn.reply.title || btn.title || btn.titulo || "" } : undefined,
        payload: newId,
      };
    });
    return { ...action, buttons: newButtons };
  };

  // channelType já vem do contexto via useMemo - não precisa fetch separado

  const handleImportNow = async () => {
    if (!caixaId) {
      toast.error("Caixa inválida para importação.");
      return;
    }
    if (parsedMessages.length === 0) {
      toast.error("Selecione um arquivo com mensagens válidas.");
      return;
    }
    const selected = parsedMessages.filter((_, idx) => selectedIndexes.has(idx));
    if (selected.length === 0) {
      toast.error("Nenhuma mensagem selecionada para importação.");
      return;
    }
    setImporting(true);
    try {
      // Usa o channelType do contexto
      const prefix = channelType === 'Channel::Instagram' ? 'ig_' : channelType === 'Channel::FacebookPage' ? 'fb_' : '';

      const results = await Promise.allSettled(
        selected.map(async (m) => {
          const message = normalizeImportedMessage(m);
          // Regenerar IDs dos botões quando tipo for button
          if (message.type === 'button' && message.action?.buttons?.length) {
            message.action = regenerateButtonIds(message.action, prefix);
          }
          const resp = await fetch(`/api/admin/mtf-diamante/messages-with-reactions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inboxId: caixaId, message, reactions: [] }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `Falha ao importar: ${message.name}`);
          }
          return resp.json();
        })
      );

      const successes = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter((r) => r.status === "rejected").length;
      if (failures === 0) {
        toast.success(`Importação concluída (${successes}).`);
      } else {
        toast.error(`Importação parcial: ${successes} sucesso(s), ${failures} falha(s).`);
      }
      setImportDialogOpen(false);
      setParsedMessages([]);
      await refreshCaixas();
    } catch (e: any) {
      toast.error(e.message || "Erro na importação.");
    } finally {
      setImporting(false);
    }
  };

  // PONTO-CHAVE 2: Esta função agora aguarda até que a mensagem esteja visível na UI
  // antes de redirecionar para garantir que o usuário veja a mensagem criada.
  
  // Função para criar payload da API
  const createApiPayload = useCallback((messageData: any, isEdit = false) => {
    // ✅ FIX: Estruturar corretamente o payload para a API
    const apiMessage = {
      name: messageData.name,
      type: messageData.type || 'button',
      body: messageData.body || { text: messageData.texto || '' },
      header: messageData.header,
      footer: messageData.footer,
      action: messageData.action,
      isActive: messageData.isActive !== undefined ? messageData.isActive : true
    };

    const payload: any = {
      inboxId: caixaId,  // ✅ Usar "inboxId" conforme esperado pela API
      message: apiMessage,
      reactions: messageData.reactions || []  // ✅ FIX: Usar reações do messageData recebido
    };

    // ✅ FIX: Só adiciona messageId para edições REAIS (não IDs temporários)
    if (isEdit && messageData.id && !messageData.id.toString().startsWith('temp-')) {
      payload.messageId = messageData.id;
      console.log('📝 [createApiPayload] Payload para edição REAL:', {
        messageId: messageData.id,
        messageName: messageData.name,
        apiMessage
      });
    } else {
      console.log('➕ [createApiPayload] Payload para criação:', {
        messageName: messageData.name,
        hadTempId: messageData.id?.toString().startsWith('temp-') ? messageData.id : null,
        apiMessage
      });
    }

    return payload;
  }, [caixaId]);

  const handleSaveMessage = useCallback(async (optimisticUIData: any) => {
    // ✅ FIX: Proteção contra múltiplas chamadas simultâneas
    if (isProcessingRef.current) {
      console.log('🚫 [MensagensInterativasTab] Tentativa de salvar bloqueada - já processando');
      return;
    }

    // Marca como processando IMEDIATAMENTE para evitar race conditions
    isProcessingRef.current = true;

    console.log('💾 [MensagensInterativasTab] handleSaveMessage iniciado:', {
      optimisticId: optimisticUIData.id,
      name: optimisticUIData.name,
      texto: optimisticUIData.texto,
      reactions: optimisticUIData.reactions
    });

    try {
      // 1. ✅ FIX: Detecta edição corretamente - ID real vs temporário
      const isEditMode = !!(optimisticUIData.id && !optimisticUIData.id.toString().startsWith('temp-'));
      const apiPayload = createApiPayload(optimisticUIData, isEditMode);

      console.log('🔍 [MensagensInterativasTab] Detectando modo de operação:', {
        messageId: optimisticUIData.id,
        isTemporary: optimisticUIData.id?.toString().startsWith('temp-'),
        isEditMode,
        action: isEditMode ? 'PUT (edição)' : 'POST (criação)'
      });

      // 2. ✅ CORRIGIDO: Usar hooks dedicados ao invés dos deprecated
      let savedMessage: any;
      if (isEditMode) {
        savedMessage = await updateMessage(optimisticUIData, apiPayload);
        console.log('✅ [MensagensInterativasTab] Mensagem atualizada via hook dedicado');
      } else {
        savedMessage = await addMessage(optimisticUIData, apiPayload);
        console.log('✅ [MensagensInterativasTab] Mensagem criada via hook dedicado');
      }

      // 3. ✅ As reações já são processadas automaticamente pela API de interactive-messages
      // Mas vamos forçar refresh das reações para garantir que a UI esteja sincronizada
      console.log('🔄 [MensagensInterativasTab] Revalidando reações após salvar...');
      await refreshButtonReactions();
      console.log('ℹ️ [MensagensInterativasTab] Mensagem e reações salvas com sucesso via API unificada');

      // 4. Redireciona IMEDIATAMENTE - o hook já atualizou o cache
      setCurrentView("list");
      console.log('🎯 [MensagensInterativasTab] Redirecionamento concluído - experiência instantânea!');

      toast.success(isEditMode ? "Mensagem atualizada com sucesso!" : "Mensagem criada com sucesso!");

    } catch (error) {
      console.error('❌ [MensagensInterativasTab] Erro no handleSaveMessage:', error);
      toast.error('Erro ao salvar mensagem: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      // ✅ FIX: Sempre liberar o lock, mesmo em caso de erro
      isProcessingRef.current = false;
    }
  }, [addMessage, updateMessage, createApiPayload, addButtonReaction, refreshButtonReactions, caixaId]);

  const handleBackToList = () => {
    setCurrentView("list");
    setEditingMessage(null);
  };

  // Render create/edit view
  if (currentView === "create" || currentView === "edit") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackToList}
              className="hover:bg-accent hover:text-accent-foreground"
            >
              ←
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {currentView === "edit" ? "Editar" : "Criar"} Mensagem
                Interativa
              </h2>
              <p className="text-muted-foreground">
                Crie mensagens interativas avançadas com todos os tipos
                suportados pelo WhatsApp Business
              </p>
            </div>
          </div>
        </div>

        {/* PONTO-CHAVE 3: Passe a função simplificada. */}
        <InteractiveMessageCreator
          inboxId={caixaId}
          onSave={handleSaveMessage}
          editingMessage={editingMessage}
        />
      </div>
    );
  }

  // Render main list view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              Mensagens Interativas
            </h2>
            <p className="text-muted-foreground">
              Gerencie mensagens interativas com botões, listas, localização e
              mais funcionalidades avançadas.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExportAll}
            variant="outline"
            className="gap-2"
          >
            <Download className="h-4 w-4" /> Exportar JSON
          </Button>
          <Button
            onClick={() => setImportDialogOpen(true)}
            variant="outline"
            className="gap-2"
          >
            <Upload className="h-4 w-4" /> Importar JSON
          </Button>
          <Button
            onClick={() => setCurrentView("create")}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-2" /> Nova Mensagem Interativa
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mensagens Salvas</CardTitle>
          <CardDescription>
            Gerencie suas mensagens interativas salvas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border border-border p-4 rounded-lg flex justify-between items-start">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-full max-w-md" />
                    <div className="flex gap-1 flex-wrap">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  </div>
                  <div className="flex gap-1 ml-4">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {(mensagens ?? []).map((msg) => {
              if (!msg) return null;
              return (
                <div
                  key={msg.id}
                  onMouseEnter={() => setHoveredId(msg.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="relative h-auto"
                >
                  {/* Glow atrás do card — renderiza só quando hover e quando não há preferência por reduzir animação */}
                  {!prefersReduced && hoveredId === msg.id && (
                    <div
                      className="pointer-events-none absolute inset-0 z-0 opacity-25 transition-opacity duration-300"
                      aria-hidden
                      role="presentation"
                    >
                      <GlowEffect
                        colors={["#0894FF", "#C959DD", "#FF2E54", "#FF9004"]}
                        mode="colorShift"
                        blur="stronger"
                        duration={4}
                      />
                    </div>
                  )}

                  {/* Card com conteúdo na frente */}
                  <div className="relative z-10 border border-border p-4 rounded-lg flex justify-between items-start hover:bg-accent/20 transition-all duration-300 bg-background dark:bg-background">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-foreground">
                      {(msg.nome || "").trim() || "(sem nome)"}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {msg.headerTipo
                        ? `${msg.headerTipo.toUpperCase()} + `
                        : ""}
                      {((msg.botoes ?? []).length || 0) > 0
                        ? `${(msg.botoes ?? []).length || 0} BOTÕES`
                        : "TEXTO"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2 max-w-[80ch] break-words whitespace-normal">
                    {(msg.texto || "").trim() || "—"}
                  </p>
                  {((msg.botoes ?? []).length || 0) > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {(msg.botoes ?? []).map((botao, idx) => {
                        // Verificar se este botão tem ação de handoff
                        const botaoReaction = buttonReactions.find(reaction => 
                          reaction.buttonId === botao.id && reaction.action === 'handoff'
                        );
                        
                        
                        return (
                          <div key={idx} className="flex items-center gap-1">
                            <Badge
                              variant="secondary"
                              className="text-xs"
                            >
                              {botao.titulo}
                            </Badge>
                            {botaoReaction && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                              >
                                👤 Atendimento Humano
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(msg)}
                    title="Editar mensagem"
                    className="hover:bg-accent"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openDeleteDialog(msg.id)}
                    title="Excluir mensagem"
                    className="hover:bg-destructive/10 hover:text-destructive"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
                </div>
            );
            })}

            {!loading && ((mensagens ?? []).length || 0) === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">
                  Nenhuma mensagem interativa ainda
                </p>
                <p className="text-sm mb-4">
                  Crie sua primeira mensagem interativa com botões, listas e
                  mais funcionalidades
                </p>
                <Button
                  onClick={() => setCurrentView("create")}
                  variant="outline"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeira Mensagem
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="w-[96vw] sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Importar mensagens interativas</DialogTitle>
            <DialogDescription>
              Selecione um arquivo JSON exportado anteriormente para importar as mensagens neste inbox.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="jsonFile">Arquivo JSON</Label>
              <Input
                id="jsonFile"
                type="file"
                accept="application/json"
                onChange={(e) => handleImportFileChange(e.target.files?.[0] || null)}
                disabled={importing}
              />
            </div>
            {importError && (
              <div className="text-sm text-destructive">{importError}</div>
            )}
            {parsedMessages.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-muted-foreground">
                    {selectedIndexes.size}/{parsedMessages.length} selecionada(s)
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="selectAll"
                      checked={selectAll}
                      onCheckedChange={(c) => handleToggleSelectAll(Boolean(c))}
                    />
                    <Label htmlFor="selectAll" className="text-sm">Selecionar todas</Label>
                  </div>
                </div>
                <ScrollArea className="h-[58vh] sm:h-[62vh] border rounded-md p-3">
                  <div className="space-y-2">
                    {parsedMessages.map((m, idx) => {
                      const checked = selectedIndexes.has(idx);
                      return (
                        <div key={idx} className="border border-border rounded p-2 flex gap-3">
                          <div className="pt-1">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => handleToggleIndex(idx, Boolean(c))}
                              aria-label={`Selecionar mensagem ${idx + 1}`}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{m.name || m.nome || `Mensagem ${idx + 1}`}</div>
                            <div className="text-xs text-muted-foreground line-clamp-2">
                              {(m.body?.text || m.content?.body?.text || "").slice(0, 220)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportDialogOpen(false)} disabled={importing}>Cancelar</Button>
            <Button onClick={handleImportNow} disabled={importing || parsedMessages.length === 0 || selectedIndexes.size === 0} className="gap-2">
              <Upload className="h-4 w-4" /> {importing ? "Importando..." : "Importar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Tem certeza que deseja excluir a mensagem selecionada?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MensagensInterativasTab;
