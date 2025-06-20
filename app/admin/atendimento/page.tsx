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
import { CalendarIcon, AlertCircle, CheckCircle, Loader2, EyeIcon, EyeOffIcon } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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

interface DisparoConfig {
  dataInicio: Date | undefined;
  dataFim: Date | undefined;
  valorLote1: string;
  valorLote2: string;
  valorAnalise: string;
  chavePix: string;
}

interface WhatsAppConfig {
  id?: string;
  fbGraphApiBase: string;
  whatsappBusinessAccountId: string;
  whatsappToken: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export default function AtendimentoPage() {
  
  const [csvData, setCsvData] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [progresso, setProgresso] = useState(0);
  
  // Configurações
  const [config, setConfig] = useState<DisparoConfig>({
    dataInicio: undefined,
    dataFim: undefined,
    valorLote1: "R$ 287,90",
    valorLote2: "R$ 287,90",
    valorAnalise: "R$ 27,90",
    chavePix: "atendimento@amandasousaprev.adv.br"
  });
  
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
  
  // Carregar templates disponíveis
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/admin/atendimento/templates');
        if (response.data.success) {
          setTemplates(response.data.templates);
        }
      } catch (error) {
        toast.error("Erro ao carregar templates", { description: "Não foi possível obter a lista de templates do WhatsApp."
         });
        console.error("Erro ao buscar templates:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, [toast]);
  
  // Carregar configurações do WhatsApp
  useEffect(() => {
    const fetchWhatsAppConfig = async () => {
      try {
        setLoadingConfig(true);
        const response = await axios.get('/api/admin/atendimento/config');
        if (response.data.success) {
          setWhatsappConfig(response.data.config);
          setIsEnvConfig(response.data.isEnvConfig);
        }
      } catch (error) {
        toast.error("Erro ao carregar configurações", { description: "Não foi possível obter as configurações da API do WhatsApp."
         });
        console.error("Erro ao buscar configurações do WhatsApp:", error);
      } finally {
        setLoadingConfig(false);
      }
    };

    fetchWhatsAppConfig();
  }, [toast]);

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

  // Função para enviar mensagens
  const enviarMensagens = async () => {
    if (!csvData) {
      toast.error("Arquivo CSV não carregado", { description: "Por favor, faça upload de um arquivo CSV com os contatos."
       });
      return;
    }

    if (!selectedTemplate) {
      toast.error("Template não selecionado", { description: "Por favor, selecione um template para enviar as mensagens."
       });
      return;
    }

    try {
      setEnviando(true);
      setProgresso(10);

      const payload = {
        csvData,
        templateName: selectedTemplate,
        configuracoes: config
      };

      setProgresso(30);
      
      const response = await axios.post('/api/admin/atendimento/disparo', payload);
      
      setProgresso(100);
      setResultado(response.data);
      
      toast("Disparo concluído", {
        
        description: `${response.data.results.enviados} mensagens enviadas de ${response.data.results.total}.`
      });
    } catch (error: any) {
      toast.error("Erro ao enviar mensagens", { description: error.response?.data?.error || "Ocorreu um erro ao enviar as mensagens."
       });
    } finally {
      setEnviando(false);
    }
  };
  
  // Função para testar o webhook
  const testarWebhook = async () => {
    try {
      setWebhook(prev => ({ ...prev, enviando: true, resposta: "" }));
      
      // Cria o payload do Dialogflow adequado à intenção selecionada
      let payload: any = {
        session: `session/${webhook.telefone}`,
        queryResult: {
          intent: {
            displayName: webhook.intencao
          },
          parameters: {}
        }
      };
      
      // Adiciona parâmetros específicos para a intenção, se necessário
      if (webhook.intencao === 'identificacao' || webhook.intencao === 'oab') {
        payload.queryResult.parameters = {
          person: {
            name: "João Silva"
          }
        };
      }
      
      const response = await axios.post('/api/admin/atendimento/webhook', payload);
      
      setWebhook(prev => ({ 
        ...prev, 
        resposta: JSON.stringify(response.data, null, 2)
      }));
      
      toast("Webhook testado", {
        description: `Intenção ${webhook.intencao} processada com sucesso.`
      });
    } catch (error: any) {
      toast.error("Erro ao testar webhook", { description: error.response?.data?.error || "Ocorreu um erro ao testar o webhook."
       });
      setWebhook(prev => ({ 
        ...prev, 
        resposta: error.response?.data ? JSON.stringify(error.response.data, null, 2) : "Erro na requisição"
      }));
    } finally {
      setWebhook(prev => ({ ...prev, enviando: false }));
    }
  };

  // Função para salvar configurações do WhatsApp
  const salvarConfigWhatsApp = async () => {
    try {
      setSavingConfig(true);
      
      // Validação básica
      if (!whatsappConfig.fbGraphApiBase || !whatsappConfig.whatsappBusinessAccountId || !whatsappConfig.whatsappToken) {
        toast.error("Campos obrigatórios", { description: "Todos os campos de configuração são obrigatórios."
         });
        return;
      }
      
      const response = await axios.post('/api/admin/atendimento/config', whatsappConfig);
      
      if (response.data.success) {
        toast("Configurações salvas", { description: "As configurações da API do WhatsApp foram salvas com sucesso."
          });
        setIsEnvConfig(false);
      }
    } catch (error: any) {
      toast.error("Erro ao salvar configurações", { description: error.response?.data?.error || "Ocorreu um erro ao salvar as configurações."
       });
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-6 text-foreground">Sistema de Atendimento WhatsApp</h1>

              <Tabs defaultValue="config">
          <TabsList className="mb-6 bg-muted border-border">
            <TabsTrigger value="config" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Configurações</TabsTrigger>
            <TabsTrigger value="whatsapp-api" className="data-[state=active]:bg-background data-[state=active]:text-foreground">API WhatsApp</TabsTrigger>
            <TabsTrigger value="upload" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Upload de Contatos</TabsTrigger>
            <TabsTrigger value="disparo" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Disparo de Mensagens</TabsTrigger>
            <TabsTrigger value="webhook" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Testar Webhook</TabsTrigger>
            {resultado && <TabsTrigger value="resultado" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Resultados</TabsTrigger>}
          </TabsList>

        {/* Aba de Configurações */}
        <TabsContent value="config">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-card-foreground">Configurações do Sistema</CardTitle>
              <CardDescription className="text-muted-foreground">
                Configure os valores e datas que serão utilizados nas mensagens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Data de Início */}
                <div className="space-y-2">
                  <Label htmlFor="dataInicio">Data de Início do Lote 1</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !config.dataInicio && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {config.dataInicio ? (
                          format(config.dataInicio, "PPP 'às' HH:mm", { locale: ptBR })
                        ) : (
                          <span>Selecione uma data</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={config.dataInicio}
                        onSelect={(date) => setConfig({ ...config, dataInicio: date })}
                        locale={ptBR}
                      />
                      <div className="p-3 border-t border-border">
                        <Label htmlFor="hora">Horário</Label>
                        <Input
                          id="hora"
                          type="time"
                          className="mt-2"
                          value={config.dataInicio ? format(config.dataInicio, "HH:mm") : ""}
                          onChange={(e) => {
                            if (config.dataInicio) {
                              const [hours, minutes] = e.target.value.split(':').map(Number);
                              const newDate = new Date(config.dataInicio);
                              newDate.setHours(hours);
                              newDate.setMinutes(minutes);
                              setConfig({ ...config, dataInicio: newDate });
                            }
                          }}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Data de Fim */}
                <div className="space-y-2">
                  <Label htmlFor="dataFim">Data de Fim da Promoção</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !config.dataFim && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {config.dataFim ? (
                          format(config.dataFim, "PPP 'às' HH:mm", { locale: ptBR })
                        ) : (
                          <span>Selecione uma data</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={config.dataFim}
                        onSelect={(date) => setConfig({ ...config, dataFim: date })}
                        locale={ptBR}
                      />
                      <div className="p-3 border-t border-border">
                        <Label htmlFor="horaFim">Horário</Label>
                        <Input
                          id="horaFim"
                          type="time"
                          className="mt-2"
                          value={config.dataFim ? format(config.dataFim, "HH:mm") : ""}
                          onChange={(e) => {
                            if (config.dataFim) {
                              const [hours, minutes] = e.target.value.split(':').map(Number);
                              const newDate = new Date(config.dataFim);
                              newDate.setHours(hours);
                              newDate.setMinutes(minutes);
                              setConfig({ ...config, dataFim: newDate });
                            }
                          }}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Valor do Lote 1 */}
                <div className="space-y-2">
                  <Label htmlFor="valorLote1">Valor do Lote 1</Label>
                  <Input
                    id="valorLote1"
                    value={config.valorLote1}
                    onChange={(e) => setConfig({ ...config, valorLote1: e.target.value })}
                    placeholder="R$ 0,00"
                  />
                </div>

                {/* Valor do Lote 2 */}
                <div className="space-y-2">
                  <Label htmlFor="valorLote2">Valor do Lote 2</Label>
                  <Input
                    id="valorLote2"
                    value={config.valorLote2}
                    onChange={(e) => setConfig({ ...config, valorLote2: e.target.value })}
                    placeholder="R$ 0,00"
                  />
                </div>

                {/* Valor da Análise */}
                <div className="space-y-2">
                  <Label htmlFor="valorAnalise">Valor da Análise</Label>
                  <Input
                    id="valorAnalise"
                    value={config.valorAnalise}
                    onChange={(e) => setConfig({ ...config, valorAnalise: e.target.value })}
                    placeholder="R$ 0,00"
                  />
                </div>

                {/* Chave PIX */}
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
              <Button
                onClick={() => {
                  setConfig({
                    dataInicio: undefined,
                    dataFim: undefined,
                    valorLote1: "R$ 287,90",
                    valorLote2: "R$ 287,90",
                    valorAnalise: "R$ 27,90",
                    chavePix: "atendimento@amandasousaprev.adv.br"
                  });
                  toast("Configurações redefinidas", { description: "As configurações foram redefinidas para os valores padrão."
                    });
                }}
                variant="outline"
                className="mr-2"
              >
                Redefinir
              </Button>
              <Button onClick={() => {
                toast("Configurações salvas", { description: "As configurações foram salvas com sucesso."
                  });
              }}>
                Salvar Configurações
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Nova aba de configurações da API do WhatsApp */}
        <TabsContent value="whatsapp-api">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-card-foreground">Configurações da API do WhatsApp</CardTitle>
              <CardDescription className="text-muted-foreground">
                Configure as credenciais para acesso à API do WhatsApp Business. Estas configurações serão utilizadas para envio de mensagens e obtenção de templates.
                {isEnvConfig && (
                  <Alert variant="default" className="mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                    <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    <AlertTitle className="text-yellow-800 dark:text-yellow-200">Usando configurações padrão</AlertTitle>
                    <AlertDescription className="text-yellow-700 dark:text-yellow-300">
                      As configurações atuais estão utilizando os valores definidos no ambiente. Para personalizar, preencha os campos abaixo e salve.
                    </AlertDescription>
                  </Alert>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fbGraphApiBase">URL Base da API do Facebook</Label>
                  <Input
                    id="fbGraphApiBase"
                    value={whatsappConfig.fbGraphApiBase}
                    onChange={(e) => setWhatsappConfig({...whatsappConfig, fbGraphApiBase: e.target.value})}
                    placeholder="https://graph.facebook.com/v18.0"
                    disabled={loadingConfig}
                  />
                  <p className="text-sm text-muted-foreground">
                    URL base da Graph API do Facebook, incluindo a versão (ex: https://graph.facebook.com/v18.0)
                  </p>
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
                  <p className="text-sm text-muted-foreground">
                    ID numérico da sua conta business do WhatsApp
                  </p>
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
                  <p className="text-sm text-muted-foreground">
                    Token de autenticação da API do WhatsApp. Este token é sensível, mantenha-o seguro.
                  </p>
                </div>
              </div>
              
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Informação Importante</AlertTitle>
                <AlertDescription>
                  A URL final para chamadas de API será construída combinando a URL Base com o ID da Conta.
                  Exemplo: <span className="font-mono text-xs">{whatsappConfig.fbGraphApiBase}/{whatsappConfig.whatsappBusinessAccountId}/messages</span>
                </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                className="mr-2"
                onClick={() => {
                  setWhatsappConfig({
                    fbGraphApiBase: process.env.FB_GRAPH_API_BASE || 'https://graph.facebook.com/v18.0',
                    whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ID || '',
                    whatsappToken: process.env.WHATSAPP_TOKEN || ''
                  });
                  toast("Configurações redefinidas", { description: "As configurações foram redefinidas para os valores padrão."
                    });
                }}
                disabled={loadingConfig || savingConfig}
              >
                Redefinir
              </Button>
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

        {/* Aba de Upload de Contatos */}
        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Upload de Lista de Contatos</CardTitle>
              <CardDescription>
                Envie um arquivo CSV com a lista de contatos para envio. O arquivo deve ter as colunas "Nome" e "Numero".
              </CardDescription>
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
                  <div className="border rounded-md overflow-hidden">
                    <div className="grid grid-cols-2 font-medium bg-accent p-2">
                      <div>Nome</div>
                      <div>Número</div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {contacts.map((contact, index) => (
                        <div key={index} className="grid grid-cols-2 p-2 border-t">
                          <div>{contact.nome}</div>
                          <div>{contact.numero}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                className="mr-2"
                onClick={() => {
                  setCsvData(null);
                  setContacts([]);
                }}
                disabled={!csvData}
              >
                Limpar Lista
              </Button>
              <Button
                disabled={!csvData}
                onClick={() => {
                  toast("Lista salva", {
                    description: `${contacts.length} contatos foram salvos para disparo.`
                  });
                }}
              >
                Salvar Lista
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Aba de Disparo de Mensagens */}
        <TabsContent value="disparo">
          <Card>
            <CardHeader>
              <CardTitle>Disparo de Mensagens</CardTitle>
              <CardDescription>
                Selecione o template e envie mensagens para os contatos da lista.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="template">Template de Mensagem</Label>
                <Select
                  value={selectedTemplate}
                  onValueChange={setSelectedTemplate}
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
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({template.category} - {template.language})
                          </span>
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

              <Alert variant="default" className="bg-muted">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Atenção</AlertTitle>
                <AlertDescription>
                  Serão enviadas mensagens para {contacts.length} contatos.
                  Certifique-se de que todas as configurações estão corretas antes de iniciar o disparo.
                </AlertDescription>
              </Alert>

              {enviando && (
                <div className="space-y-2">
                  <Label>Progresso do Disparo</Label>
                  <Progress value={progresso} className="h-2" />
                  <p className="text-sm text-muted-foreground text-center">
                    {progresso < 100 ? "Enviando mensagens..." : "Disparo concluído!"}
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={enviarMensagens} 
                disabled={!csvData || !selectedTemplate || enviando}
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
              <CardDescription>
                Simule uma requisição do Dialogflow para testar o webhook de atendimento.
              </CardDescription>
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
                      <SelectItem value="confirmação.nome.menu">Confirmação de Nome</SelectItem>
                      <SelectItem value="maternidade">Maternidade</SelectItem>
                      <SelectItem value="invalidez">Invalidez</SelectItem>
                      <SelectItem value="auxilio">Auxílio</SelectItem>
                      <SelectItem value="consulta.juridica">Consulta Jurídica</SelectItem>
                      <SelectItem value="BPC-LOAS">BPC-LOAS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <Alert variant="default" className="bg-muted">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Informação</AlertTitle>
                <AlertDescription>
                  Esta simulação envia uma requisição ao webhook como se fosse o Dialogflow.
                  Isso permite testar o processamento de diferentes intenções sem precisar de uma conta real no Dialogflow.
                </AlertDescription>
              </Alert>
              
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
                <CardDescription>
                  Resumo e detalhes do último disparo de mensagens realizado.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-muted p-4 rounded-md text-center">
                    <p className="text-sm font-medium">Total</p>
                    <p className="text-2xl font-bold">{resultado.results.total}</p>
                  </div>
                  <div className="bg-green-100 p-4 rounded-md text-center">
                    <p className="text-sm font-medium text-green-800">Enviados</p>
                    <p className="text-2xl font-bold text-green-800">{resultado.results.enviados}</p>
                  </div>
                  <div className="bg-red-100 p-4 rounded-md text-center">
                    <p className="text-sm font-medium text-red-800">Falhas</p>
                    <p className="text-2xl font-bold text-red-800">{resultado.results.falhas}</p>
                  </div>
                </div>

                <h3 className="text-lg font-medium mb-2">Detalhes por Contato</h3>
                <div className="border rounded-md overflow-hidden">
                  <div className="grid grid-cols-3 font-medium bg-accent p-2">
                    <div>Nome</div>
                    <div>Número</div>
                    <div>Status</div>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {resultado.results.detalhes.map((detalhe: any, index: number) => (
                      <div 
                        key={index} 
                        className={cn(
                          "grid grid-cols-3 p-2 border-t",
                          detalhe.status === 'enviado' ? "bg-green-50" : "bg-red-50"
                        )}
                      >
                        <div>{detalhe.nome}</div>
                        <div>{detalhe.numero}</div>
                        <div className="flex items-center">
                          {detalhe.status === 'enviado' ? (
                            <>
                              <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
                              <span className="text-green-600">Enviado</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-4 w-4 text-red-600 mr-1" />
                              <span className="text-red-600">Falha</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
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
    </div>
  );
} 