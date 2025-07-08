"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, AlertCircle, CheckCircle, Loader2, EyeIcon, EyeOffIcon, Plus, Trash2, Users, FileUp } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LeadsSelectorDialog } from "@/app/admin/templates/components/leads-selector-dialog";
import { SendProgressDialog } from "@/app/admin/templates/components/send-progress-dialog";
import { DateTimePicker } from "@/app/[accountid]/dashboard/agendamento/components/date-time-picker";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

interface Template {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
}

interface Contact {
  nome: string;
  numero: string;
}

interface MtfDiamanteLote {
  id?: string;
  numero: number;
  nome: string;
  valor: string;
  dataInicio: Date;
  dataFim: Date;
  isActive: boolean;
}

interface MtfDiamanteConfig {
  id?: string;
  valorAnalise: string;
  chavePix: string;
  lotes: MtfDiamanteLote[];
  intentMappings: MtfDiamanteIntentMapping[];
}

interface MtfDiamanteIntentMapping {
  id?: string;
  intentName: string;
  templateName: string;
  parameters?: any;
  isActive: boolean;
}

interface WhatsAppConfig {
  id?: string;
  fbGraphApiBase: string;
  whatsappBusinessAccountId: string;
  whatsappToken: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export default function MtfDiamantePage() {
  
  const [csvData, setCsvData] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [progresso, setProgresso] = useState(0);
  const [loadingMtfConfig, setLoadingMtfConfig] = useState(false);
  const [savingMtfConfig, setSavingMtfConfig] = useState(false);
  
  // Configurações MTF Diamante
  const [config, setConfig] = useState<MtfDiamanteConfig>({
    valorAnalise: "R$ 27,90",
    chavePix: "atendimento@amandasousaprev.adv.br",
    lotes: [{
      numero: 1,
      nome: "Primeiro Lote",
      valor: "R$ 287,90",
      dataInicio: new Date(),
      dataFim: new Date(),
      isActive: true
    }],
    intentMappings: []
  });
  
  // Estado para leads selecionados
  const [selectedLeads, setSelectedLeads] = useState<any[]>([]);
  const [showLeadsSelector, setShowLeadsSelector] = useState(false);
  const [showSendProgress, setShowSendProgress] = useState(false);
  const [sendProgressComplete, setSendProgressComplete] = useState(false);
  
  // Estado para o webhook de teste
  const [webhook, setWebhook] = useState({
    telefone: "5584994072876",
    intencao: "Welcome",
    resposta: "",
    enviando: false
  });
  
  // Estado para configurações do WhatsApp
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfig>({
    fbGraphApiBase: '',
    whatsappBusinessAccountId: '',
    whatsappToken: ''
  });
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [isEnvConfig, setIsEnvConfig] = useState(true);
  const [showToken, setShowToken] = useState(false);
  
  // Carregar configurações do MTF Diamante
  useEffect(() => {
    const fetchMtfConfig = async () => {
      try {
        setLoadingMtfConfig(true);
        const response = await axios.get('/api/admin/mtf-diamante/config');
        if (response.data.success) {
          // Converter strings de data em objetos Date
          const configWithDates = {
            ...response.data.config,
            lotes: response.data.config.lotes.map((lote: any) => ({
              ...lote,
              dataInicio: new Date(lote.dataInicio),
              dataFim: new Date(lote.dataFim)
            })),
            intentMappings: response.data.config.intentMappings || []
          };
          
          setConfig(configWithDates);
        }
      } catch (error) {
        console.error("Erro ao carregar configurações MTF Diamante:", error);
        toast.error("Erro ao carregar configurações", { description: "Usando configurações padrão." });
      } finally {
        setLoadingMtfConfig(false);
      }
    };

    fetchMtfConfig();
  }, []);
  
  // Carregar templates disponíveis
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/admin/mtf-diamante/templates');
        if (response.data.success) {
          setTemplates(response.data.templates);
        }
      } catch (error) {
        toast.error("Erro ao carregar templates", { description: "Não foi possível obter a lista de templates do WhatsApp." });
        console.error("Erro ao buscar templates:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, []);
  
  // Carregar configurações do WhatsApp
  useEffect(() => {
    const fetchWhatsAppConfig = async () => {
      try {
        setLoadingConfig(true);
        const response = await axios.get('/api/admin/mtf-diamante/whatsapp-config');
        if (response.data.success) {
          setWhatsappConfig(response.data.config);
          setIsEnvConfig(response.data.isEnvConfig);
        }
      } catch (error) {
        toast.error("Erro ao carregar configurações", { description: "Não foi possível obter as configurações da API do WhatsApp." });
        console.error("Erro ao buscar configurações do WhatsApp:", error);
      } finally {
        setLoadingConfig(false);
      }
    };

    fetchWhatsAppConfig();
  }, []);

  // Função para adicionar novo lote
  const adicionarLote = () => {
    const novoLote: MtfDiamanteLote = {
      numero: config.lotes.length + 1,
      nome: `Lote ${config.lotes.length + 1}`,
      valor: "R$ 287,90",
      dataInicio: new Date(),
      dataFim: new Date(),
      isActive: true
    };
    
    setConfig({
      ...config,
      lotes: [...config.lotes, novoLote]
    });
  };
  
  // Função para remover lote
  const removerLote = (index: number) => {
    if (config.lotes.length <= 1) {
      toast.error("Deve haver pelo menos um lote");
      return;
    }
    
    const novosLotes = config.lotes.filter((_, i) => i !== index);
    setConfig({
      ...config,
      lotes: novosLotes
    });
  };
  
  // Função para atualizar lote
  const atualizarLote = (index: number, campo: keyof MtfDiamanteLote, valor: any) => {
    const novosLotes = [...config.lotes];
    novosLotes[index] = { ...novosLotes[index], [campo]: valor };
    setConfig({
      ...config,
      lotes: novosLotes
    });
  };

  // Funções para gerenciar mapeamentos de intenções
  const adicionarIntentMapping = () => {
    const novoMapping: MtfDiamanteIntentMapping = {
      intentName: "",
      templateName: "",
      parameters: {},
      isActive: true
    };
    
    setConfig({
      ...config,
      intentMappings: [...config.intentMappings, novoMapping]
    });
  };

  const removerIntentMapping = (index: number) => {
    const novosMappings = config.intentMappings.filter((_, i) => i !== index);
    setConfig({
      ...config,
      intentMappings: novosMappings
    });
  };

  const atualizarIntentMapping = (index: number, campo: keyof MtfDiamanteIntentMapping, valor: any) => {
    const novosMappings = [...config.intentMappings];
    novosMappings[index] = { ...novosMappings[index], [campo]: valor };
    setConfig({
      ...config,
      intentMappings: novosMappings
    });
  };

  // Configurar dropzone para upload de CSV
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const csvContent = reader.result as string;
        setCsvData(csvContent);
        
        // Exibir prévia dos contatos
        const lines = csvContent.split('\n');
        const header = lines[0].split(',');
        
        const parsedContacts: Contact[] = [];
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          
          const values = lines[i].split(',');
          const contact: Contact = {
            nome: values[0]?.trim() || '',
            numero: values[1]?.trim() || ''
          };
          
          if (contact.nome && contact.numero) {
            parsedContacts.push(contact);
          }
        }
        
        setContacts(parsedContacts);
      };
      reader.readAsText(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: {
      'text/csv': ['.csv']
    },
    maxFiles: 1
  });

  // Função para salvar configurações MTF Diamante
  const salvarConfigMtf = async () => {
    try {
      setSavingMtfConfig(true);
      const response = await axios.post('/api/admin/mtf-diamante/config', config);
      if (response.data.success) {
        toast.success("Configurações MTF Diamante salvas com sucesso!");
      }
    } catch (error: any) {
      toast.error("Erro ao salvar configurações", { description: error.response?.data?.error || "Ocorreu um erro ao salvar." });
    } finally {
      setSavingMtfConfig(false);
    }
  };

  // Função para salvar configurações do WhatsApp
  const salvarConfigWhatsApp = async () => {
    try {
      setSavingConfig(true);
      
      if (!whatsappConfig.fbGraphApiBase || !whatsappConfig.whatsappBusinessAccountId || !whatsappConfig.whatsappToken) {
        toast.error("Campos obrigatórios", { description: "Todos os campos de configuração são obrigatórios." });
        return;
      }
      
      const response = await axios.post('/api/admin/mtf-diamante/whatsapp-config', whatsappConfig);
      
      if (response.data.success) {
        toast.success("Configurações da API do WhatsApp salvas com sucesso!");
        setIsEnvConfig(false);
      }
    } catch (error: any) {
      toast.error("Erro ao salvar configurações", { description: error.response?.data?.error || "Ocorreu um erro ao salvar as configurações." });
    } finally {
      setSavingConfig(false);
    }
  };

  // Função para testar o webhook
  const testarWebhook = async () => {
    try {
      setWebhook(prev => ({ ...prev, enviando: true, resposta: "" }));
      
      let payload: any = {
        session: `session/${webhook.telefone}`,
        queryResult: {
          intent: {
            displayName: webhook.intencao
          },
          parameters: {}
        }
      };
      
      if (webhook.intencao === 'identificacao' || webhook.intencao === 'oab') {
        payload.queryResult.parameters = {
          person: {
            name: "João Silva"
          }
        };
      }
      
      const response = await axios.post('/api/admin/mtf-diamante/webhook', payload);
      
      setWebhook(prev => ({ 
        ...prev, 
        resposta: JSON.stringify(response.data, null, 2)
      }));
      
      toast.success(`Webhook testado com sucesso para a intenção ${webhook.intencao}!`);
    } catch (error: any) {
      toast.error("Erro ao testar webhook", { description: error.response?.data?.error || "Ocorreu um erro ao testar o webhook." });
      setWebhook(prev => ({ 
        ...prev, 
        resposta: error.response?.data ? JSON.stringify(error.response.data, null, 2) : "Erro na requisição"
      }));
    } finally {
      setWebhook(prev => ({ ...prev, enviando: false }));
    }
  };

  // Função para enviar mensagens
  const enviarMensagens = async () => {
    if (contacts.length === 0 && selectedLeads.length === 0) {
      toast.error("Nenhum contato selecionado", { description: "Selecione contatos via CSV ou leads do sistema." });
      return;
    }

    if (!selectedTemplate) {
      toast.error("Template não selecionado", { description: "Por favor, selecione um template para enviar as mensagens." });
      return;
    }

    try {
      setShowSendProgress(true);
      setSendProgressComplete(false);
      setEnviando(true);

      // Combinar contatos CSV e leads selecionados
      const todosContatos = [
        ...contacts,
        ...selectedLeads.map(lead => ({
          nome: lead.nomeReal || lead.name || "Lead sem nome",
          numero: lead.phoneNumber || ""
        }))
      ];

      const payload = {
        contatos: todosContatos,
        templateName: selectedTemplate,
        configuracoes: config
      };

      const response = await axios.post('/api/admin/mtf-diamante/disparo', payload);
      
      setSendProgressComplete(true);
      setResultado(response.data);
      
      toast.success(`Mensagens enviadas com sucesso para ${todosContatos.length} contatos!`);
    } catch (error: any) {
      setShowSendProgress(false);
      toast.error("Erro ao enviar mensagens", { description: error.response?.data?.error || "Ocorreu um erro ao enviar as mensagens." });
    } finally {
      setEnviando(false);
    }
  };

  // Função para lidar com seleção de leads
  const handleLeadsSelection = (leads: any[]) => {
    setSelectedLeads(leads);
    toast.success(`${leads.length} leads selecionados da base de dados!`);
  };



  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-6 text-foreground">MTF Diamante - Método Fênix Diamante</h1>

        <Tabs defaultValue="config">
          <TabsList className="mb-6 bg-muted border-border">
            <TabsTrigger value="config">Configurações MTF</TabsTrigger>
            <TabsTrigger value="lotes">Gerenciar Lotes</TabsTrigger>
            <TabsTrigger value="templates">Mapear Templates</TabsTrigger>
            <TabsTrigger value="whatsapp-api">API WhatsApp</TabsTrigger>
            <TabsTrigger value="upload">Upload CSV</TabsTrigger>
            <TabsTrigger value="leads">Leads do Sistema</TabsTrigger>
            <TabsTrigger value="disparo">Disparo de Mensagens</TabsTrigger>
            <TabsTrigger value="webhook">Testar Webhook</TabsTrigger>
            {resultado && <TabsTrigger value="resultado">Resultados</TabsTrigger>}
          </TabsList>

          {/* Aba de Configurações MTF */}
          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle>Configurações do MTF Diamante</CardTitle>
                <CardDescription>Configure os valores e informações base do sistema</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="valorAnalise">Valor da Análise</Label>
                    <Input
                      id="valorAnalise"
                      value={config.valorAnalise}
                      onChange={(e) => setConfig({ ...config, valorAnalise: e.target.value })}
                      placeholder="R$ 27,90"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="chavePix">Chave PIX</Label>
                    <Input
                      id="chavePix"
                      value={config.chavePix}
                      onChange={(e) => setConfig({ ...config, chavePix: e.target.value })}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={salvarConfigMtf} disabled={savingMtfConfig}>
                  {savingMtfConfig ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Configurações"
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Aba de Gerenciar Lotes */}
          <TabsContent value="lotes">
            <Card>
              <CardHeader>
                <CardTitle>Gerenciar Lotes</CardTitle>
                <CardDescription>Configure os lotes do MTF Diamante com datas e valores</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {config.lotes.map((lote, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold">Lote {lote.numero}</h3>
                      {config.lotes.length > 1 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removerLote(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nome do Lote</Label>
                        <Input
                          value={lote.nome}
                          onChange={(e) => atualizarLote(index, 'nome', e.target.value)}
                          placeholder="Nome do lote"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Valor</Label>
                        <Input
                          value={lote.valor}
                          onChange={(e) => atualizarLote(index, 'valor', e.target.value)}
                          placeholder="R$ 287,90"
                        />
                      </div>
                      <div className="space-y-2">
                        <DateTimePicker
                          date={lote.dataInicio instanceof Date ? lote.dataInicio : new Date(lote.dataInicio)}
                          setDate={(date) => date && atualizarLote(index, 'dataInicio', date)}
                        />
                      </div>
                      <div className="space-y-2">
                        <DateTimePicker
                          date={lote.dataFim instanceof Date ? lote.dataFim : new Date(lote.dataFim)}
                          setDate={(date) => date && atualizarLote(index, 'dataFim', date)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex justify-center">
                  <Button onClick={adicionarLote} variant="outline">
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Lote
                  </Button>
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={salvarConfigMtf} disabled={savingMtfConfig}>
                  {savingMtfConfig ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Lotes"
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Aba de Templates */}
          <TabsContent value="templates">
            <Card>
              <CardHeader>
                <CardTitle>Mapear Templates por Intenção</CardTitle>
                <CardDescription>Configure qual template será enviado para cada intenção do Dialogflow</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {loadingMtfConfig ? (
                  <div className="flex justify-center items-center py-12">
                    <div className="flex flex-col items-center space-y-4">
                      <DotLottieReact
                        src="/animations/loading.lottie"
                        autoplay
                        loop={true}
                        style={{ width: 150, height: 150 }}
                        aria-label="Carregando mapeamentos de templates"
                      />
                      <p className="text-muted-foreground">Carregando mapeamentos de templates...</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {config.intentMappings.map((mapping, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold">Mapeamento {index + 1}</h3>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removerIntentMapping(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Intenção do Dialogflow</Label>
                        <div className="space-y-2">
                          <Select
                            value={mapping.intentName}
                            onValueChange={(value) => atualizarIntentMapping(index, 'intentName', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione uma intenção" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Welcome">Welcome (Boas-vindas)</SelectItem>
                              <SelectItem value="identificacao">Identificação</SelectItem>
                              <SelectItem value="oab">OAB</SelectItem>
                              <SelectItem value="atendimentohumano">Atendimento Humano</SelectItem>
                              <SelectItem value="oab - pix">OAB - PIX</SelectItem>
                              <SelectItem value="maternidade">Maternidade</SelectItem>
                              <SelectItem value="invalidez">Invalidez</SelectItem>
                              <SelectItem value="auxilio">Auxílio</SelectItem>
                              <SelectItem value="consulta.juridica">Consulta Jurídica</SelectItem>
                              <SelectItem value="BPC-LOAS">BPC-LOAS</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="text-xs text-muted-foreground">
                            Ou digite uma intenção personalizada:
                          </div>
                          <Input
                            placeholder="Digite o nome da intenção"
                            value={mapping.intentName}
                            onChange={(e) => atualizarIntentMapping(index, 'intentName', e.target.value)}
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Template de Mensagem</Label>
                        <Select
                          value={mapping.templateName}
                          onValueChange={(value) => atualizarIntentMapping(index, 'templateName', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um template" />
                          </SelectTrigger>
                          <SelectContent>
                            {loading ? (
                              <div className="flex items-center justify-center p-2">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                <span>Carregando templates...</span>
                              </div>
                            ) : templates.length > 0 ? (
                              templates.map((template) => (
                                <SelectItem key={template.id} value={template.name}>
                                  {template.name}
                                </SelectItem>
                              ))
                            ) : (
                              <div className="p-2 text-muted-foreground">
                                Nenhum template disponível
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`active-${index}`}
                        checked={mapping.isActive}
                        onChange={(e) => atualizarIntentMapping(index, 'isActive', e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor={`active-${index}`} className="text-sm font-medium">
                        Ativar mapeamento
                      </Label>
                    </div>
                  </div>
                ))}
                
                    <div className="flex justify-center">
                      <Button onClick={adicionarIntentMapping} variant="outline">
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar Mapeamento
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
              <CardFooter>
                {!loadingMtfConfig && (
                  <Button onClick={salvarConfigMtf} disabled={savingMtfConfig}>
                    {savingMtfConfig ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar Mapeamentos"
                    )}
                  </Button>
                )}
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Aba de API WhatsApp */}
          <TabsContent value="whatsapp-api">
            <Card>
              <CardHeader>
                <CardTitle>Configurações da API do WhatsApp</CardTitle>
                <CardDescription>Configure as credenciais para acesso à API do WhatsApp Business</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fbGraphApiBase">URL Base da API do Facebook</Label>
                    <Input
                      id="fbGraphApiBase"
                      value={whatsappConfig.fbGraphApiBase}
                      onChange={(e) => setWhatsappConfig({...whatsappConfig, fbGraphApiBase: e.target.value})}
                      placeholder="https://graph.facebook.com/v22.0"
                      disabled={loadingConfig}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="whatsappBusinessAccountId">ID da Conta Business do WhatsApp</Label>
                    <Input
                      id="whatsappBusinessAccountId"
                      value={whatsappConfig.whatsappBusinessAccountId}
                      onChange={(e) => setWhatsappConfig({...whatsappConfig, whatsappBusinessAccountId: e.target.value})}
                      placeholder="123456789012345"
                      disabled={loadingConfig}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="whatsappToken">Token de Acesso</Label>
                    <div className="flex">
                      <Input
                        id="whatsappToken"
                        type={showToken ? "text" : "password"}
                        value={whatsappConfig.whatsappToken}
                        onChange={(e) => setWhatsappConfig({...whatsappConfig, whatsappToken: e.target.value})}
                        placeholder="EAA..."
                        disabled={loadingConfig}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="ml-2"
                      >
                        {showToken ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={salvarConfigWhatsApp} 
                  disabled={loadingConfig || savingConfig}
                >
                  {savingConfig ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Configurações"
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Aba de Upload CSV */}
          <TabsContent value="upload">
            <Card>
              <CardHeader>
                <CardTitle>Upload de Lista de Contatos</CardTitle>
                <CardDescription>Envie um arquivo CSV com a lista de contatos</CardDescription>
              </CardHeader>
              <CardContent>
                <div 
                  {...getRootProps()} 
                  className={cn(
                    "border-2 border-dashed rounded-md p-10 text-center cursor-pointer transition-colors",
                    isDragActive ? "border-primary bg-primary/10" : "border-border hover:bg-accent/10"
                  )}
                >
                  <input {...getInputProps()} />
                  <FileUp className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  {isDragActive ? (
                    <p>Solte o arquivo aqui...</p>
                  ) : (
                    <div>
                      <p>Arraste e solte um arquivo CSV aqui, ou clique para selecionar</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Formato: "Nome,Numero" (uma entrada por linha)
                      </p>
                    </div>
                  )}
                </div>

                {contacts.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-medium mb-2">Contatos Carregados ({contacts.length})</h3>
                    <div className="border rounded-md overflow-hidden max-h-60 overflow-y-auto">
                      <div className="grid grid-cols-2 font-medium bg-accent p-2 sticky top-0">
                        <div>Nome</div>
                        <div>Número</div>
                      </div>
                      {contacts.map((contact, index) => (
                        <div key={index} className="grid grid-cols-2 p-2 border-t">
                          <div>{contact.nome}</div>
                          <div>{contact.numero}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCsvData(null);
                    setContacts([]);
                  }}
                  disabled={!csvData}
                >
                  Limpar Lista
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Aba de Leads do Sistema */}
          <TabsContent value="leads">
            <Card>
              <CardHeader>
                <CardTitle>Selecionar Leads do Sistema</CardTitle>
                <CardDescription>Selecione leads diretamente da base de dados do Chatwit</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Leads Selecionados</h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedLeads.length} leads selecionados
                      </p>
                    </div>
                    <Button onClick={() => setShowLeadsSelector(true)}>
                      <Users className="mr-2 h-4 w-4" />
                      Selecionar Leads
                    </Button>
                  </div>
                  
                  {selectedLeads.length > 0 && (
                    <div className="border rounded-md overflow-hidden max-h-60 overflow-y-auto">
                      <div className="grid grid-cols-3 font-medium bg-accent p-2 sticky top-0">
                        <div>Nome</div>
                        <div>Telefone</div>
                        <div>Email</div>
                      </div>
                      {selectedLeads.map((lead, index) => (
                        <div key={index} className="grid grid-cols-3 p-2 border-t">
                          <div>{lead.nomeReal || lead.name || "Sem nome"}</div>
                          <div>{lead.phoneNumber || "Sem telefone"}</div>
                          <div>{lead.email || "Sem email"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  onClick={() => setSelectedLeads([])}
                  disabled={selectedLeads.length === 0}
                >
                  Limpar Seleção
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Aba de Disparo */}
          <TabsContent value="disparo">
            <Card>
              <CardHeader>
                <CardTitle>Disparo de Mensagens</CardTitle>
                <CardDescription>Envie mensagens para os contatos selecionados</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="template">Template de Mensagem</Label>
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um template" />
                    </SelectTrigger>
                    <SelectContent>
                      {loading ? (
                        <div className="flex items-center justify-center p-2">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          <span>Carregando templates...</span>
                        </div>
                      ) : templates.length > 0 ? (
                        templates.map((template) => (
                          <SelectItem key={template.id} value={template.name}>
                            {template.name}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-2 text-muted-foreground">
                          Nenhum template disponível
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Resumo do Disparo</AlertTitle>
                  <AlertDescription>
                    Serão enviadas mensagens para {contacts.length + selectedLeads.length} contatos
                    ({contacts.length} do CSV + {selectedLeads.length} leads selecionados).
                  </AlertDescription>
                </Alert>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={enviarMensagens} 
                  disabled={!selectedTemplate || (contacts.length === 0 && selectedLeads.length === 0) || enviando}
                  className="w-full"
                >
                  {enviando ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    "Iniciar Disparo de Mensagens"
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          {/* Aba de Teste de Webhook */}
          <TabsContent value="webhook">
            <Card>
              <CardHeader>
                <CardTitle>Teste de Webhook Dialogflow</CardTitle>
                <CardDescription>Simule uma requisição do Dialogflow para testar o webhook</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="telefone">Número de Telefone</Label>
                    <Input
                      id="telefone"
                      value={webhook.telefone}
                      onChange={(e) => setWebhook({ ...webhook, telefone: e.target.value })}
                      placeholder="5584999999999"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="intencao">Intenção</Label>
                    <Select
                      value={webhook.intencao}
                      onValueChange={(value) => setWebhook({ ...webhook, intencao: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma intenção" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Welcome">Welcome (Boas-vindas)</SelectItem>
                        <SelectItem value="identificacao">Identificação</SelectItem>
                        <SelectItem value="oab">OAB</SelectItem>
                        <SelectItem value="atendimentohumano">Atendimento Humano</SelectItem>
                        <SelectItem value="oab - pix">OAB - PIX</SelectItem>
                        <SelectItem value="maternidade">Maternidade</SelectItem>
                        <SelectItem value="invalidez">Invalidez</SelectItem>
                        <SelectItem value="auxilio">Auxílio</SelectItem>
                        <SelectItem value="consulta.juridica">Consulta Jurídica</SelectItem>
                        <SelectItem value="BPC-LOAS">BPC-LOAS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {webhook.resposta && (
                  <div className="space-y-2">
                    <Label>Resposta do Webhook</Label>
                    <div className="bg-muted p-4 rounded-md overflow-x-auto">
                      <pre className="text-xs">{webhook.resposta}</pre>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={testarWebhook} 
                  disabled={webhook.enviando}
                  className="w-full"
                >
                  {webhook.enviando ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    "Testar Webhook"
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Aba de Resultados */}
          {resultado && (
            <TabsContent value="resultado">
              <Card>
                <CardHeader>
                  <CardTitle>Resultados do Disparo</CardTitle>
                  <CardDescription>Resumo e detalhes do último disparo realizado</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-muted p-4 rounded-md text-center">
                      <p className="text-sm font-medium">Total</p>
                      <p className="text-2xl font-bold">{resultado.results?.total || 0}</p>
                    </div>
                    <div className="bg-green-100 p-4 rounded-md text-center">
                      <p className="text-sm font-medium text-green-800">Enviados</p>
                      <p className="text-2xl font-bold text-green-800">{resultado.results?.enviados || 0}</p>
                    </div>
                    <div className="bg-red-100 p-4 rounded-md text-center">
                      <p className="text-sm font-medium text-red-800">Falhas</p>
                      <p className="text-2xl font-bold text-red-800">{resultado.results?.falhas || 0}</p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    onClick={() => setResultado(null)} 
                    variant="outline"
                  >
                    Limpar Resultados
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
      
      {/* Diálogos */}
      <LeadsSelectorDialog
        isOpen={showLeadsSelector}
        onClose={() => setShowLeadsSelector(false)}
        onConfirm={handleLeadsSelection}
        title="Selecionar Leads para MTF Diamante"
        description="Selecione os leads que receberão as mensagens do MTF Diamante"
      />
      
              <SendProgressDialog
          isOpen={showSendProgress}
          onClose={() => setShowSendProgress(false)}
          isComplete={sendProgressComplete}
          numContacts={contacts.length + selectedLeads.length}
          templateName={selectedTemplate}
        />
    </div>
  );
} 