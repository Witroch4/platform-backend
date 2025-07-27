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
  TestTube
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface WhatsAppGlobalConfig {
  id: string;
  usuarioChatwitId: string;
  whatsappApiKey: string;
  phoneNumberId: string;
  whatsappBusinessAccountId: string;
  graphApiBaseUrl: string;
  updatedAt: string;
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
}

interface CredentialsTestResult {
  success: boolean;
  message: string;
  details?: {
    phoneNumberId?: string;
    businessAccountId?: string;
    templatesCount?: number;
  };
}

export function CredentialsManager() {
  const [globalConfig, setGlobalConfig] = useState<WhatsAppGlobalConfig | null>(null);
  const [inboxes, setInboxes] = useState<ChatwitInbox[]>([]);
  const [selectedInbox, setSelectedInbox] = useState<ChatwitInbox | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<CredentialsTestResult | null>(null);
  const [showFallbackChain, setShowFallbackChain] = useState(false);

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
        fetch('/api/admin/credentials/inboxes')
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
        setInboxes(inboxesData.inboxes || []);
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
      const response = await fetch('/api/admin/credentials/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(globalForm),
      });

      if (response.ok) {
        const data = await response.json();
        setGlobalConfig(data);
        toast.success("Configuração global salva com sucesso!");
      } else {
        const error = await response.json();
        throw new Error(error.message || "Erro ao salvar configuração global");
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
      const response = await fetch(`/api/admin/credentials/inboxes/${selectedInbox.id}`, {
        method: 'POST',
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
        throw new Error(error.message || "Erro ao salvar configuração do inbox");
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
        ? '/api/admin/credentials/test/global'
        : `/api/admin/credentials/test/inbox/${selectedInbox?.id}`;

      const response = await fetch(endpoint, { method: 'POST' });
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

  const renderFallbackChain = (inbox: ChatwitInbox, visited: Set<string> = new Set()): JSX.Element[] => {
    if (visited.has(inbox.id)) {
      return [
        <div key={`loop-${inbox.id}`} className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">Loop detectado!</span>
        </div>
      ];
    }

    visited.add(inbox.id);
    const elements: JSX.Element[] = [];

    // Inbox atual
    elements.push(
      <div key={inbox.id} className="flex items-center gap-2">
        <Badge variant={inbox.whatsappApiKey ? "default" : "outline"}>
          {inbox.nome}
        </Badge>
        {inbox.whatsappApiKey ? (
          <CheckCircle className="h-4 w-4 text-green-600" />
        ) : (
          <XCircle className="h-4 w-4 text-red-600" />
        )}
      </div>
    );

    // Se tem fallback, adiciona seta e próximo inbox
    if (inbox.fallbackParaInbox && !visited.has(inbox.fallbackParaInbox.id)) {
      elements.push(
        <ArrowRight key={`arrow-${inbox.id}`} className="h-4 w-4 text-muted-foreground" />
      );
      elements.push(...renderFallbackChain(inbox.fallbackParaInbox, visited));
    } else if (inbox.fallbackParaInboxId && !inbox.fallbackParaInbox) {
      // Fallback configurado mas não carregado
      elements.push(
        <ArrowRight key={`arrow-${inbox.id}`} className="h-4 w-4 text-muted-foreground" />
      );
      elements.push(
        <Badge key={`missing-${inbox.id}`} variant="destructive">
          Inbox não encontrado
        </Badge>
      );
    } else if (!inbox.fallbackParaInboxId) {
      // Sem fallback, vai para global
      elements.push(
        <ArrowRight key={`arrow-global-${inbox.id}`} className="h-4 w-4 text-muted-foreground" />
      );
      elements.push(
        <Badge key={`global-${inbox.id}`} variant="secondary" className="flex items-center gap-1">
          <Globe className="h-3 w-3" />
          Global Config
        </Badge>
      );
    }

    return elements;
  };

  const hasCredentials = (inbox: ChatwitInbox) => {
    return !!(inbox.whatsappApiKey && inbox.phoneNumberId && inbox.whatsappBusinessAccountId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Gerenciamento de Credenciais
          </h1>
          <p className="text-muted-foreground">
            Configure as credenciais do WhatsApp para inboxes específicos e configuração global
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={fetchCredentials}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Global Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Configuração Global (Fallback)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Credenciais padrão usadas quando um inbox não possui configuração específica
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="global-api-key">WhatsApp API Key</Label>
              <Textarea
                id="global-api-key"
                placeholder="Insira a API Key do WhatsApp..."
                value={globalForm.whatsappApiKey}
                onChange={(e) => setGlobalForm(prev => ({ ...prev, whatsappApiKey: e.target.value }))}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="global-phone-id">Phone Number ID</Label>
                <Input
                  id="global-phone-id"
                  placeholder="123456789012345"
                  value={globalForm.phoneNumberId}
                  onChange={(e) => setGlobalForm(prev => ({ ...prev, phoneNumberId: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="global-business-id">Business Account ID</Label>
                <Input
                  id="global-business-id"
                  placeholder="123456789012345"
                  value={globalForm.whatsappBusinessAccountId}
                  onChange={(e) => setGlobalForm(prev => ({ ...prev, whatsappBusinessAccountId: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="global-api-url">Graph API Base URL</Label>
            <Input
              id="global-api-url"
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

      {/* Inboxes Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inbox List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5" />
              Inboxes
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
                      : 'border-border hover:bg-muted/50'
                  }`}
                  onClick={() => selectInbox(inbox)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{inbox.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        ID: {inbox.inboxId} • {inbox.channelType}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {hasCredentials(inbox) ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      {inbox.fallbackParaInboxId && (
                        <Link className="h-3 w-3 text-muted-foreground" />
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
            {selectedInbox && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={showFallbackChain}
                  onCheckedChange={setShowFallbackChain}
                />
                <Label>Mostrar cadeia de fallback</Label>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {selectedInbox ? (
              <div className="space-y-4">
                {showFallbackChain && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-medium mb-2">Cadeia de Fallback:</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {renderFallbackChain(selectedInbox)}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="inbox-api-key">WhatsApp API Key (Específica)</Label>
                    <Textarea
                      id="inbox-api-key"
                      placeholder="Deixe vazio para usar configuração global..."
                      value={inboxForm.whatsappApiKey}
                      onChange={(e) => setInboxForm(prev => ({ ...prev, whatsappApiKey: e.target.value }))}
                      className="min-h-[80px]"
                    />
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="inbox-phone-id">Phone Number ID</Label>
                      <Input
                        id="inbox-phone-id"
                        placeholder="Deixe vazio para usar global..."
                        value={inboxForm.phoneNumberId}
                        onChange={(e) => setInboxForm(prev => ({ ...prev, phoneNumberId: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inbox-business-id">Business Account ID</Label>
                      <Input
                        id="inbox-business-id"
                        placeholder="Deixe vazio para usar global..."
                        value={inboxForm.whatsappBusinessAccountId}
                        onChange={(e) => setInboxForm(prev => ({ ...prev, whatsappBusinessAccountId: e.target.value }))}
                      />
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
                            {inbox.nome} ({inbox.inboxId})
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
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Selecione um inbox na lista ao lado para configurar suas credenciais específicas.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}