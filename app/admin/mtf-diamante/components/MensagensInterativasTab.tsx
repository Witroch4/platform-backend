"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrashIcon,
  PencilIcon,
  Upload,
    Download,
  Eye,
  Save,
  Plus,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import InteractiveMessageCreator from "./InteractiveMessageCreator";
import type { InteractiveMessageType } from "./interactive-message-creator/types";
import { useMtfData } from "@/app/admin/mtf-diamante/context/MtfDataProvider";
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
}

type AnyMsg = any;

const pick = (...vals: any[]) =>
  vals.find(v => typeof v === "string" && v.trim().length > 0);

// 🛠️ Versão mais agressiva que cobre todos os caminhos possíveis
const normalizeMessage = (m: AnyMsg): Mensagem => {
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
  if (Array.isArray(m.botoes)) candidates.push(...m.botoes);
  if (Array.isArray(m.content?.action?.buttons))
    candidates.push(...m.content.action.buttons);
  if (Array.isArray(m.actionReplyButton?.buttons))
    candidates.push(...m.actionReplyButton.buttons);
  if (Array.isArray(m.interactiveContent?.actionReplyButton?.buttons))
    candidates.push(...m.interactiveContent.actionReplyButton.buttons);
  if (Array.isArray(m.content?.interactiveContent?.actionReplyButton?.buttons))
    candidates.push(...m.content.interactiveContent.actionReplyButton.buttons);

  // remove duplicados por id
  const seen = new Map<string, any>();
  for (const b of candidates) {
    const key = b?.id || b?.reply?.id || JSON.stringify(b);
    if (!seen.has(key)) seen.set(key, b);
  }
  const botoes: Botao[] = Array.from(seen.values()).map((b: any) => ({
    id: b?.id || b?.reply?.id,
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
  };
};

const MensagensInterativasTab = ({ caixaId }: MensagensInterativasTabProps) => {
  const { interactiveMessages, caixas, refreshCaixas } = useMtfData();
  const [currentView, setCurrentView] = useState<"list" | "create" | "edit">(
    "list"
  );
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const mensagens = useMemo<Mensagem[]>(
    () => (interactiveMessages ?? []).map(normalizeMessage),
    [interactiveMessages]
  );

  // Debug temporário para verificar o shape dos dados
  useEffect(() => {
    if (interactiveMessages) {
      console.log("[DEBUG] interactiveMessages sample:", interactiveMessages[0]);
      console.log("[DEBUG] mensagens normalizadas:", mensagens[0]);
    }
  }, [interactiveMessages, mensagens]);
  const loading = !interactiveMessages; // opcional; ou use um Skeleton quando vazio

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

  // Dados já vêm do contexto via useMemo - não precisa espelhar estado

  const handleEdit = (msg: any) => {
    // Detect type from msg (API provides msg.type and msg.content?.type)
    const detectedType = (msg?.type || msg?.content?.type || 'button') as InteractiveMessageType;

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
    } else if ((msg.botoes?.length || 0) > 0 || Array.isArray(msg?.content?.action?.buttons)) {
      const buttonsSrc = Array.isArray(msg?.content?.action?.buttons) ? msg.content.action.buttons : msg.botoes || [];
      base.action = {
        type: 'button' as const,
        buttons: (buttonsSrc || []).map((b: any) => ({
          id: b.id || b?.reply?.id || `btn_${Date.now()}`,
          title: b.title || b?.reply?.title || b.titulo || '',
          type: (b.type as any) || 'reply',
          reply:
            b.reply || (b.title || b.titulo ? { id: b.id || `btn_${Date.now()}`, title: b.title || b.titulo } : undefined),
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
      const response = await fetch(
        `/api/admin/mtf-diamante/interactive-messages/${mensagemId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Falha ao excluir mensagem.");
      }
      toast.success("Mensagem excluída com sucesso!");
      await refreshCaixas(); // força revalidação imediata
    } catch (error) {
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
        ? { buttons: msg.botoes?.map((b) => ({ id: b.id || `btn_${Date.now()}`, title: (b as any).title || b.titulo || "" })) }
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
    const type = m.type || m.content?.type || (action?.buttons ? "button" : "button");
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
      action: action ? { ...action } : undefined,
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
      const prefix = channelType === 'Channel::Instagram' ? 'ig_' : '';

      const results = await Promise.allSettled(
        selected.map(async (m) => {
          const message = normalizeImportedMessage(m);
          // Regenerar IDs dos botões quando tipo for button
          if (message.type === 'button' && message.action?.buttons?.length) {
            message.action = regenerateButtonIds(message.action, prefix);
          }
          const resp = await fetch(`/api/admin/mtf-diamante/interactive-messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ caixaId, message }),
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

  const handleSaveMessage = (message: any) => {
    toast.success("Mensagem salva com sucesso!");
    setCurrentView("list");
    setEditingMessage(null);
    // Dados serão atualizados automaticamente via SWR
  };

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
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}

          <div className="space-y-3">
            {(mensagens ?? []).map((msg) => {
              if (!msg) return null;
              return (
                <div
                  key={msg.id}
                  className="border border-border p-4 rounded-lg flex justify-between items-start hover:bg-accent/50 transition-colors"
                >
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
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                    {(msg.texto || "").trim() || "—"}
                  </p>
                  {((msg.botoes ?? []).length || 0) > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {(msg.botoes ?? []).map((botao, idx) => (
                        <Badge
                          key={idx}
                          variant="secondary"
                          className="text-xs"
                        >
                          {botao.titulo}
                        </Badge>
                      ))}
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
