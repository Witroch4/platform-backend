"use client";

import { useSession } from "next-auth/react";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  ChevronDown,
  LayoutDashboard,
  Shield,
  Users,
  Bell,
  MessageCircle,
  Instagram,
  Headphones,
  HelpCircle,
  Zap,
  Calendar,
  Activity,
  Brain,
  Bot,
  FileText,
  Settings,
  User2,
  Plus,
  Atom,
  Copy,
  FlaskConical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import LoginBadge from "@/components/auth/login-badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AdicionarCaixaDialog } from "@/app/admin/mtf-diamante/components/DialogflowCaixasAgentes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function AppAdminDashboard() {
  const { data: session } = useSession();
  const { state } = useSidebar();
  const [inboxes, setInboxes] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshInboxes = async () => {
    try {
      const resp = await fetch('/api/admin/mtf-diamante/dialogflow/caixas', { cache: 'no-store' });
      if (resp.ok) {
        const data = await resp.json();
        const caixas = Array.isArray(data?.caixas) ? data.caixas : [];
        setInboxes(caixas);
      }
    } catch {}
  };

  const loadApiKeys = async () => {
    try {
      const r = await fetch('/api/admin/ai-integration/api-keys', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        setApiKeys(Array.isArray(j?.keys) ? j.keys : []);
      }
    } catch {}
  };

  const createApiKey = async () => {
    try {
      setCreating(true);
      const r = await fetch('/api/admin/ai-integration/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel }),
      });
      if (r.ok) {
        const j = await r.json();
        setNewToken(j?.token || null);
        setNewLabel("");
        await loadApiKeys();
      }
    } finally {
      setCreating(false);
    }
  };

  const revokeApiKey = async (id: string) => {
    await fetch(`/api/admin/ai-integration/api-keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadApiKeys();
  };

  const copyNewToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  useEffect(() => {
    refreshInboxes();
    loadApiKeys();
  }, []);

  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN";
  const isSuperAdmin = session?.user?.role === "SUPERADMIN";

  return (
    <Sidebar collapsible="icon" side="left" variant="sidebar" className="bg-background z-50 border-r">
      <SidebarHeader>
        <div className="px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {session?.user?.image ? (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={session.user.image} />
                  <AvatarFallback>
                    <User2 className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              ) : (
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    <User2 className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              {state !== "collapsed" && (
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{session?.user?.name ?? "Usuário"}</span>
                  <span className="text-xs text-muted-foreground">{session?.user?.role ?? ""}</span>
                </div>
              )}
            </div>
            {state !== "collapsed" && (
              <DropdownMenu>
                <DropdownMenuTrigger className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent">
                  <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 p-0">
                  <LoginBadge user={session?.user} />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-background">
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/admin" className="flex items-center">
                      <LayoutDashboard className="mr-2" />
                      {state !== "collapsed" && <span>Dashboard Admin</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Grupo: Caixas de Entrada (Canais) */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/admin/mtf-diamante" className="flex items-center">
                      <Headphones className="mr-2" />
                      {state !== "collapsed" && <span>MTF Diamante Global</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Caixas de Entrada (pai) com lista de caixas dentro e botão de criação) */}
                <Collapsible defaultOpen className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="text-base py-3">
                        <Users className="mr-3 h-5 w-5" />
                        {state !== "collapsed" && <span className="font-semibold">Caixas de Entrada</span>}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="pl-2 py-1 space-y-1">
                        <SidebarMenuSub>
                          {inboxes.map((cx: any) => {
                            const channel = (cx.channelType || '').toLowerCase();
                            const isInstagram = channel.includes('instagram');
                            const Icon = isInstagram ? Instagram : MessageCircle; // WhatsApp/Outros
                            return (
                              <SidebarMenuSubItem key={cx.id}>
                                <SidebarMenuSubButton
                                  href={`/admin/mtf-diamante/inbox/${cx.id}`}
                                  className="text-[0.95rem] py-2"
                                >
                                  <Icon className={isInstagram ? 'text-pink-500' : 'text-green-500'} />
                                  <span className="font-medium">{cx.nome || cx.inboxName || 'Inbox'}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                        <AdicionarCaixaDialog
                          onCaixaAdicionada={refreshInboxes}
                          caixasConfiguradas={inboxes}
                          trigger={
                            <SidebarMenuButton className="mt-2 text-base py-3">
                              <Plus className="mr-3" />
                              {state !== "collapsed" && <span className="font-medium">Nova Caixa</span>}
                            </SidebarMenuButton>
                          }
                        />
                      </div>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>

                {isAdmin && (
                  <>
                    {/* Capitão (pai) com lista de sub-itens */}
                    <Collapsible defaultOpen className="group/collapsible">
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="text-base py-3">
                            <Bot className="mr-3 h-5 w-5" />
                            {state !== "collapsed" && <span className="font-semibold">Capitão</span>}
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="pl-2 py-1 space-y-1">
                            <SidebarMenuSub>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  href="/admin/capitao"
                                  className="text-[0.95rem] py-2"
                                >
                                  <Bot className="text-blue-500" />
                                  <span className="font-medium">Assistentes</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  href="/admin/capitao/documentos"
                                  className="text-[0.95rem] py-2"
                                >
                                  <FileText className="text-gray-600" />
                                  <span className="font-medium">Documentos</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  href="/admin/capitao/faqs"
                                  className="text-[0.95rem] py-2"
                                >
                                  <HelpCircle className="text-gray-600" />
                                  <span className="font-medium">FAQs</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  href="/admin/capitao/intents"
                                  className="text-[0.95rem] py-2"
                                >
                                  <Settings className="text-gray-600" />
                                  <span className="font-medium">Intenções (IA)</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            </SidebarMenuSub>
                          </div>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  </>
                )}

                {isAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" className="w-full justify-start">
                            <Shield className="mr-2" />
                            {state !== "collapsed" && <span>Chaves de API (IA)</span>}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="w-[96vw] sm:max-w-2xl max-h-[85vh] p-0">
                          <DialogHeader className="px-6 pt-6">
                            <DialogTitle>Gerenciar Chaves de API</DialogTitle>
                          </DialogHeader>
                          <div className="px-6 pb-4 space-y-4">
                            <div className="flex gap-2 items-center">
                              <Input placeholder="Rótulo (opcional)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                              <Button disabled={creating} onClick={createApiKey}>Gerar</Button>
                            </div>
                            {newToken && (
                              <div className="rounded-md border p-3 bg-muted">
                                <div className="flex items-center justify-between">
                                  <div className="text-sm font-medium">Nova chave (copie agora, será exibida apenas uma vez):</div>
                                  <Button size="sm" variant="secondary" onClick={copyNewToken}>
                                    <Copy className="mr-1 h-3 w-3" /> {copied ? 'Copiado' : 'Copiar'}
                                  </Button>
                                </div>
                                <div className="mt-1 font-mono text-xs break-all">{newToken}</div>
                              </div>
                            )}
                            <div className="space-y-2">
                              <div className="text-sm text-muted-foreground">Minhas chaves</div>
                              <div className="border rounded-md divide-y">
                                {apiKeys.length === 0 && (
                                  <div className="p-3 text-sm text-muted-foreground">Nenhuma chave criada.</div>
                                )}
                                {apiKeys.map((k) => (
                                  <div key={k.id} className="p-3 flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium truncate">{k.label || 'Sem rótulo'}</div>
                                      <div className="text-xs text-muted-foreground font-mono truncate">
                                        {k.tokenPrefix}…{k.tokenSuffix}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {k.active ? 'Ativa' : 'Revogada'} • {new Date(k.createdAt).toLocaleString()}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {k.active && (
                                        <Button variant="destructive" size="sm" onClick={() => revokeApiKey(k.id)}>Revogar</Button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <DialogFooter className="px-6 pb-6" />
                        </DialogContent>
                      </Dialog>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {isSuperAdmin && (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link href="/admin/notifications" className="flex items-center">
                          <Bell className="mr-2" />
                          {state !== "collapsed" && <span>Notificações</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link href="/admin/users" className="flex items-center">
                          <Users className="mr-2" />
                          {state !== "collapsed" && <span>Usuários</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link href="/admin/monitoring/dashboard" className="flex items-center">
                          <Shield className="mr-2" />
                          {state !== "collapsed" && <span>Monitoramento</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/admin/leads-chatwit" className="flex items-center">
                      <MessageCircle className="mr-2" />
                      {state !== "collapsed" && <span>Leads Chatwit</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* ChatwitIA */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/chatwitia" className="flex items-center">
                      <Atom className="mr-2" />
                      {state !== "collapsed" && <span>ChatwitIA</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/admin/disparo-oab" className="flex items-center">
                      <Users className="mr-2" />
                      {state !== "collapsed" && <span>Disparo OAB</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/admin/templates" className="flex items-center">
                      <HelpCircle className="mr-2" />
                      {state !== "collapsed" && <span>Templates WhatsApp</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/admin/disparo-em-massa" className="flex items-center">
                      <Zap className="mr-2" />
                      {state !== "collapsed" && <span>Disparo em Massa</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Teste de Webhook */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/admin/webhook-test" className="flex items-center">
                      <FlaskConical className="mr-2" />
                      {state !== "collapsed" && <span>Teste de Webhook</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Respostas Rápidas (Flash Intent) */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/admin/resposta-rapida" className="flex items-center">
                      <Zap className="mr-2" />
                      {state !== "collapsed" && <span>Respostas Rápidas</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/admin/queue" className="flex items-center">
                      <Calendar className="mr-2" />
                      {state !== "collapsed" && <span>Fila de Processamento</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {isSuperAdmin && (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link href="/admin/ai-integration" className="flex items-center">
                          <Brain className="mr-2" />
                          {state !== "collapsed" && <span>IA Integration</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link href="/admin/ai-integration/intents" className="flex items-center">
                          <Settings className="mr-2" />
                          {state !== "collapsed" && <span>Gerenciar Intents</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link href="/admin/ai-integration/queues" className="flex items-center">
                          <Activity className="mr-2" />
                          {state !== "collapsed" && <span>Gerenciar Filas</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center w-full px-2 py-1 hover:bg-accent rounded ${
                  session?.user && state === "collapsed" ? "justify-center" : "justify-start pl-2"
                }`}
              >
                {session?.user?.image ? (
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={session.user.image} />
                    <AvatarFallback>
                      <User2 className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <User2 className="h-6 w-6" />
                )}
                {state !== "collapsed" && (
                  <span className="ml-2">{session?.user?.name ?? "Minha Conta"}</span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="w-[--radix-popper-anchor-width]">
              <LoginBadge user={session?.user} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppAdminDashboard;


