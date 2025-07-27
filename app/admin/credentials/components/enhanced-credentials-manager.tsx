"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Settings, 
  Key, 
  Globe, 
  Inbox, 
  Save, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRight,
  Link,
  Unlink,
  TestTube,
  Eye,
  EyeOff,
  Copy,
  Plus,
  Trash2,
  Network,
  Shield
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface WhatsAppGlobalConfig {
  id?: string;
  whatsappApiKey: string | null;
  phoneNumberId: string;
  whatsappBusinessAccountId: string;
  graphApiBaseUrl: string;
  updatedAt: string;
  hasCredentials: boolean;
  exists: boolean;
}

interface ChatwitInbox {
  id: string;
  nome: string;
  inboxId: string;
  channelType: string;
  whatsappApiKey: string | null;
  phoneNumberId: string | null;
  whatsappBusinessAccountId: string | null;
  fallbackParaInboxId: string | null;
  fallbackParaInbox: ChatwitInbox | null;
  fallbackDeInboxes: ChatwitInbox[];
  createdAt: string;
  updatedAt: string;
  hasCredentials: boolean;
  hasFallback: boolean;
  isUsedAsFallback: boolean;
  agentes?: { id: string; nome: string; ativo: boolean }[];
  templates?: { id: string; name: string; type: string; isActive: boolean }[];
  stats?: {
    agentesCount: number;
    templatesCount: number;
    mapeamentosIntencaoCount: number;
    mapeamentosBotoesCount: number;
  };
}

interface CredentialsTestResult {
  success: boolean;
  message: string;
  details?: {
    phoneNumberId?: string;
    businessAccountId?: string;
    templatesCount?: number;
    error?: string;
  };
}

interface FallbackChainVisualizationProps {
  inbox: ChatwitInbox;
  allInboxes: ChatwitInbox[];
  globalConfig: WhatsAppGlobalConfig | null;
}

function FallbackChainVisualization({ inbox, allInboxes, globalConfig }: FallbackChainVisualizationProps) {
  const [chain, setChain] = useState<(ChatwitInbox | { type: 'global' })[]>([]);
  const [hasLoop, setHasLoop] = useState(false);

  useEffect(() => {
    const buildChain = () => {
      const visited = new Set<string>();
      const chainItems: (ChatwitInbox | { type: 'global' })[] = [];
      let current: ChatwitInbox | null = inbox;
      let loopDetected = false;

      while (current) {
        if (visited.has(current.id)) {
          loopDetected = true;
          break;
        }

        visited.add(current.id);
        chainItems.push(current);

        if (current.fallbackParaInboxId) {
          current = allInboxes.find(i => i.id === current!.fallbackParaInboxId) || null;
        } else {
          // Sem fallback específico, vai para global
          chainItems.push({ type: 'global' });
          break;
        }
      }

      setChain(chainItems);
      setHasLoop(loopDetected);
    };

    buildChain();
  }, [inbox, allInboxes]);

  const getCredentialStatus = (item: ChatwitInbox | { type: 'global' }) => {
    if ('type' in item) {
      return globalConfig?.hasCredentials ? 'complete' : 'missing';
    }
    return item.hasCredentials ? 'complete' : 'partial';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'partial':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'missing':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <XCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'missing':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4" />
        <h4 className="font-medium">Cadeia de Fallback</h4>
      </div>

      {hasLoop && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Loop detectado na cadeia de fallback! Isso pode causar problemas na resolução de credenciais.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {chain.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="flex items-center gap-2 p-2 border rounded-lg">
              {'type' in item ? (
                <>
                  <Globe className="h-4 w-4" />
                  <span className="text-sm font-medium">Global Config</span>
                  {getStatusIcon(getCredentialStatus(item))}
                </>
              ) : (
                <>
                  <Inbox className="h-4 w-4" />
                  <div>
                    <div className="text-sm font-medium">{item.nome}</div>
                    <div className="text-xs text-muted-foreground">ID: {item.inboxId}</div>
                  </div>
                  {getStatusIcon(getCredentialStatus(item))}
                </>
              )}
            </div>
            {index < chain.length - 1 && (
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>

      <div className="text-sm text-muted-foreground">
        <div className="font-medium mb-2">Legenda:</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3 text-green-600" />
            <span>Credenciais completas</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3 w-3 text-yellow-600" />
            <span>Credenciais parciais</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-3 w-3 text-red-600" />
            <span>Credenciais ausentes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EnhancedCredentialsManager() {
  const [globalConfig, setGlobalConfig] = useState<WhatsAppGlobalConfig | null>(null);
  const [inboxes, setInboxes] = useState<ChatwitInbox[]>([]);
  const [selectedInbox, setSelectedInbox] = useState<ChatwitInbox | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<CredentialsTestResult | null>(null);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [showFallbackDialog, setShowFallbackDialog] = useState(false);

  // Form states
  const [globalForm, setGlobalForm] = useState({
    whatsappApiKey: "",
    phoneNumberId: "",
    whatsappBusinessAccountId: "",
    graphApiBaseUrl: "https://graph.facebook.com/v22.0",
  });

  const [inboxForm, setInboxForm] = useState({
    whatsappApiKey: "",
    phoneNumberId: "",
    whatsappBusinessAccountId: "",
    fallbackParaInboxId: "",
  });

  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    setIsLoading(true);
    try {
      const [globalResponse, inboxesResponse] = await Promise.all([
        fetch('/api/admin/credentials/global'),
        fetch('/api/admin/credentials/inbox')
      ]);

      if (globalResponse.ok) {
        const globalData = await globalResponse.json();
        setGlobalConfig(globalData);
        if (globalData) {
          setGlobalForm({
            whatsappApiKey: globalData.whatsappApiKey || "",
            phoneNumberId: globalData.phoneNumberId || "",
            whatsappBusinessAccountId: globalData.whatsappBusinessAccountId || "",
            graphApiBaseUrl: globalData.graphApiBaseUrl || "https://graph.facebook.com/v22.0",
          });
        }
      }

      if (inboxesResponse.ok) {
        const inboxesData = await inboxesResponse.json();
        setInboxes(inboxesData.inboxConfigs || []);
      }
    } catch (error) {
      console.error("Erro ao carregar credenciais:", error);
      toast.error("Erro", { 
        description: "Não foi possível carregar as credenciais." 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveGlobalConfig = async () => {
    setIsSaving(true);
    try {
      const method = globalConfig?.exists ? 'PUT' : 'POST';
      const response = await fetch('/api/admin/credentials/global', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(globalForm),
      });

      if (response.ok) {
        const data = await response.json();
        setGlobalConfig({ ...data, exists: true });
        toast.success("Configuração global salva com sucesso!");
      } else {
        const error = await response.json();
        throw new Error(error.error || "Erro ao salvar configuração global");
      }
    } catch (error: any) {
      console.error("Erro ao salvar configuração global:", error);
      toast.error("Erro", { 
        description: error.message || "Não foi possível salvar a configuração global." 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const saveInboxConfig = async () => {
    if (!selectedInbox) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/credentials/inbox/${selectedInbox.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inboxForm),
      });

      if (response.ok) {
        const data = await response.json();
        setInboxes(prev => prev.map(inbox => 
          inbox.id === selectedInbox.id ? data : inbox
        ));
        setSelectedInbox(data);
        toast.success("Configuração do inbox salva com sucesso!");
      } else {
        const error = await response.json();
        throw new Error(error.error || "Erro ao salvar configuração do inbox");
      }
    } catch (error: any) {
      console.error("Erro ao salvar configuração do inbox:", error);
      toast.error("Erro", { 
        description: error.message || "Não foi possível salvar a configuração do inbox." 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const testCredentials = async (type: 'global' | 'inbox') => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const endpoint = type === 'global' 
        ? '/api/admin/credentials/test'
        : `/api/admin/credentials/test`;

      const body = type === 'global' 
        ? globalForm 
        : { ...inboxForm, inboxId: selectedInbox?.id };

      const response = await fetch(endpoint, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const result = await response.json();
      setTestResult(result);
      
      if (result.success) {
        toast.success("Teste realizado com sucesso!", {
          description: result.message
        });
      } else {
        toast.error("Falha no teste", {
          description: result.message
        });
      }
    } catch (error: any) {
      console.error("Erro ao testar credenciais:", error);
      setTestResult({
        success: false,
        message: "Erro de conexão durante o teste"
      });
      toast.error("Erro", { 
        description: "Não foi possível realizar o teste." 
      });
    } finally {
      setIsTesting(false);
    }
  };

  const selectInbox = (inbox: ChatwitInbox) => {
    setSelectedInbox(inbox);
    setInboxForm({
      whatsappApiKey: inbox.whatsappApiKey || "",
      phoneNumberId: inbox.phoneNumberId || "",
      whatsappBusinessAccountId: inbox.whatsappBusinessAccountId || "",
      fallbackParaInboxId: inbox.fallbackParaInboxId || "",
    });
    setTestResult(null);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado para a área de transferência!`);
  };

  const getInboxStatusColor = (inbox: ChatwitInbox) => {
    if (inbox.hasCredentials) {
      return "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950";
    } else if (inbox.hasFallback) {
      return "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950";
    } else {
      return "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Gerenciamento Avançado de Credenciais
          </h1>
          <p className="text-muted-foreground">
            Configure credenciais do WhatsApp com sistema inteligente de fallback
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={fetchCredentials}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Dialog open={showFallbackDialog} onOpenChange={setShowFallbackDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Network className="h-4 w-4 mr-2" />
                Visualizar Cadeias
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Visualização das Cadeias de Fallback</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 max-h-[60vh] overflow-y-auto">
                {inboxes.map((inbox) => (
                  <Card key={inbox.id}>
                    <CardHeader>
                      <CardTitle className="text-lg">{inbox.nome}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FallbackChainVisualization 
                        inbox={inbox} 
                        allInboxes={inboxes} 
                        globalConfig={globalConfig} 
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="global" className="space-y-6">
        <TabsList>
          <TabsTrigger value="global" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Configuração Global
          </TabsTrigger>
          <TabsTrigger value="inboxes" className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Inboxes ({inboxes.length})
          </TabsTrigger>
        </TabsList>

        {/* Global Configuration Tab */}
        <TabsContent value="global">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Configuração Global (Fallback Final)
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Credenciais padrão usadas quando um inbox não possui configuração específica
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={showApiKeys}
                    onCheckedChange={setShowApiKeys}
                  />
                  <Label>Mostrar API Keys</Label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="global-api-key">WhatsApp API Key</Label>
                  <div className="relative">
                                         <Textarea
                       id="global-api-key"
                       placeholder="Insira a API Key do WhatsApp..."
                       value={showApiKeys ? globalForm.whatsappApiKey : globalForm.whatsappApiKey.replace(/./g, '*')}
                       onChange={(e) => setGlobalForm(prev => ({ ...prev, whatsappApiKey: e.target.value }))}
                       className="min-h-[80px] pr-10"
                       type={showApiKeys ? "text" : "password"}
                       autoComplete="off"
                     />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2"
                      onClick={() => copyToClipboard(globalForm.whatsappApiKey, "API Key")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="global-phone-id">Phone Number ID</Label>
                    <div className="relative">
                                             <Input
                         id="global-phone-id"
                         type="text"
                         placeholder="123456789012345"
                         value={globalForm.phoneNumberId}
                         onChange={(e) => setGlobalForm(prev => ({ ...prev, phoneNumberId: e.target.value }))}
                         className="pr-10"
                       />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2"
                        onClick={() => copyToClipboard(globalForm.phoneNumberId, "Phone Number ID")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="global-business-id">Business Account ID</Label>
                    <div className="relative">
                                             <Input
                         id="global-business-id"
                         type="text"
                         placeholder="123456789012345"
                         value={globalForm.whatsappBusinessAccountId}
                         onChange={(e) => setGlobalForm(prev => ({ ...prev, whatsappBusinessAccountId: e.target.value }))}
                         className="pr-10"
                       />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2"
                        onClick={() => copyToClipboard(globalForm.whatsappBusinessAccountId, "Business Account ID")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="global-api-url">Graph API Base URL</Label>
                                 <Input
                   id="global-api-url"
                   type="url"
                   placeholder="https://graph.facebook.com/v22.0"
                   value={globalForm.graphApiBaseUrl}
                   onChange={(e) => setGlobalForm(prev => ({ ...prev, graphApiBaseUrl: e.target.value }))}
                 />
              </div>
              
              {testResult && (
                <Alert className={testResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <AlertDescription>
                      {testResult.message}
                      {testResult.details && (
                        <div className="mt-2 text-xs">
                          {testResult.details.templatesCount && (
                            <div>Templates encontrados: {testResult.details.templatesCount}</div>
                          )}
                          {testResult.details.error && (
                            <div className="text-red-600">Erro: {testResult.details.error}</div>
                          )}
                        </div>
                      )}
                    </AlertDescription>
                  </div>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button 
                  onClick={saveGlobalConfig}
                  disabled={isSaving}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Salvando..." : "Salvar Configuração Global"}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => testCredentials('global')}
                  disabled={isTesting || !globalForm.whatsappApiKey}
                  className="flex items-center gap-2"
                >
                  <TestTube className="h-4 w-4" />
                  {isTesting ? "Testando..." : "Testar Credenciais"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inboxes Configuration Tab */}
        <TabsContent value="inboxes">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Inbox List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Inbox className="h-5 w-5" />
                  Inboxes ({inboxes.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {inboxes.map((inbox) => (
                    <div
                      key={inbox.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedInbox?.id === inbox.id 
                          ? 'border-primary bg-primary/5' 
                          : `border-border hover:bg-muted/50 ${getInboxStatusColor(inbox)}`
                      }`}
                      onClick={() => selectInbox(inbox)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{inbox.nome}</div>
                          <div className="text-xs text-muted-foreground">
                            ID: {inbox.inboxId} • {inbox.channelType}
                          </div>
                          {inbox.stats && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {inbox.stats.agentesCount} agentes • {inbox.stats.templatesCount} templates
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {inbox.hasCredentials ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Completo
                            </Badge>
                          ) : inbox.hasFallback ? (
                            <Badge className="bg-yellow-100 text-yellow-800">
                              <Link className="h-3 w-3 mr-1" />
                              Fallback
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800">
                              <XCircle className="h-3 w-3 mr-1" />
                              Incompleto
                            </Badge>
                          )}
                          {inbox.isUsedAsFallback && (
                            <Badge variant="outline" className="text-xs">
                              <Shield className="h-2 w-2 mr-1" />
                              Usado como fallback
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Inbox Configuration */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  {selectedInbox ? `Configuração: ${selectedInbox.nome}` : "Selecione um Inbox"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedInbox ? (
                  <div className="space-y-6">
                    {/* Fallback Chain Visualization */}
                    <FallbackChainVisualization 
                      inbox={selectedInbox} 
                      allInboxes={inboxes} 
                      globalConfig={globalConfig} 
                    />

                    {/* Configuration Form */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="inbox-api-key">WhatsApp API Key (Específica)</Label>
                          <div className="relative">
                                                         <Textarea
                               id="inbox-api-key"
                               placeholder="Deixe vazio para usar configuração global..."
                               value={showApiKeys ? inboxForm.whatsappApiKey : inboxForm.whatsappApiKey.replace(/./g, '*')}
                               onChange={(e) => setInboxForm(prev => ({ ...prev, whatsappApiKey: e.target.value }))}
                               className="min-h-[80px] pr-10"
                               autoComplete="off"
                             />
                            {inboxForm.whatsappApiKey && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-2 top-2"
                                onClick={() => copyToClipboard(inboxForm.whatsappApiKey, "API Key")}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="inbox-phone-id">Phone Number ID</Label>
                            <div className="relative">
                                                             <Input
                                 id="inbox-phone-id"
                                 type="text"
                                 autoComplete="off"
                                 placeholder="Deixe vazio para usar global..."
                                 value={inboxForm.phoneNumberId}
                                 onChange={(e) => setInboxForm(prev => ({ ...prev, phoneNumberId: e.target.value }))}
                                 className="pr-10"
                               />
                              {inboxForm.phoneNumberId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-2 top-1/2 transform -translate-y-1/2"
                                  onClick={() => copyToClipboard(inboxForm.phoneNumberId, "Phone Number ID")}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="inbox-business-id">Business Account ID</Label>
                            <div className="relative">
                                                             <Input
                                 id="inbox-business-id"
                                 type="text"
                                 autoComplete="off"
                                 placeholder="Deixe vazio para usar global..."
                                 value={inboxForm.whatsappBusinessAccountId}
                                 onChange={(e) => setInboxForm(prev => ({ ...prev, whatsappBusinessAccountId: e.target.value }))}
                                 className="pr-10"
                               />
                              {inboxForm.whatsappBusinessAccountId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-2 top-1/2 transform -translate-y-1/2"
                                  onClick={() => copyToClipboard(inboxForm.whatsappBusinessAccountId, "Business Account ID")}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="fallback-inbox">Fallback para Inbox</Label>
                        <Select 
                          value={inboxForm.fallbackParaInboxId} 
                          onValueChange={(value) => setInboxForm(prev => ({ ...prev, fallbackParaInboxId: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um inbox para fallback (opcional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Sem fallback (usar global)</SelectItem>
                            {inboxes
                              .filter(inbox => inbox.id !== selectedInbox.id)
                              .map((inbox) => (
                                <SelectItem key={inbox.id} value={inbox.id}>
                                  <div className="flex items-center gap-2">
                                    {inbox.hasCredentials ? (
                                      <CheckCircle className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <XCircle className="h-3 w-3 text-red-600" />
                                    )}
                                    {inbox.nome} ({inbox.inboxId})
                                  </div>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          onClick={saveInboxConfig}
                          disabled={isSaving}
                          className="flex items-center gap-2"
                        >
                          <Save className="h-4 w-4" />
                          {isSaving ? "Salvando..." : "Salvar Configuração"}
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => testCredentials('inbox')}
                          disabled={isTesting}
                          className="flex items-center gap-2"
                        >
                          <TestTube className="h-4 w-4" />
                          {isTesting ? "Testando..." : "Testar Credenciais"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">Selecione um Inbox</h3>
                    <p className="text-sm">
                      Escolha um inbox na lista ao lado para configurar suas credenciais específicas.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}