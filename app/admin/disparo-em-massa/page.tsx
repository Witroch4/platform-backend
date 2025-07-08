"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle, Loader2, ImageIcon, Send, ArrowRight, ListIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Contact {
  nome: string;
  numero: string;
}

interface TemplateInfo {
  nome: string;
  categoria: string;
  idioma?: string;
  componentes: Array<{
    tipo: string;
    texto?: string;
    formato?: string;
    variaveis?: Array<{
      nome: string;
      descricao: string;
      exemplo: string;
    }> | false;
  }>;
}

interface Template {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
}

export default function DisparoEmMassaPage() {
  
  const [csvData, setCsvData] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [progresso, setProgresso] = useState(0);
  
  // Gerenciamento de templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingTemplateInfo, setLoadingTemplateInfo] = useState(false);
  
  // Variáveis para personalização
  const [templateVariables, setTemplateVariables] = useState<string[]>([]);
  
  // Carregar lista de templates
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoadingTemplates(true);
        const response = await axios.get('/api/admin/mtf-diamante/templates');
        if (response.data.success) {
          // Ordenar por nome
          const sortedTemplates = response.data.templates.sort((a: Template, b: Template) => 
            a.name.localeCompare(b.name)
          );
          setTemplates(sortedTemplates);
        }
      } catch (error) {
        console.error("Erro ao buscar templates:", error);
        toast.error("Erro ao carregar templates", { description: "Não foi possível obter a lista de templates disponíveis."
         });
      } finally {
        setLoadingTemplates(false);
      }
    };

    fetchTemplates();
  }, [toast]);

  // Carregar informações do template selecionado
  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplateInfo(null);
      return;
    }
    
    const fetchTemplateInfo = async () => {
      try {
        setLoadingTemplateInfo(true);
        const response = await axios.get(`/api/admin/mtf-diamante/template-info?template=${selectedTemplateId}`);
        if (response.data.success) {
          setTemplateInfo(response.data.template);
          
          // Configurar variáveis com valores vazios (ou padrão)
          const bodyComponent = response.data.template.componentes.find((c: any) => c.tipo === "BODY");
          if (bodyComponent && bodyComponent.variaveis) {
            setTemplateVariables(bodyComponent.variaveis.map((v: any) => v.exemplo || ""));
          } else {
            setTemplateVariables([]);
          }
        }
      } catch (error) {
        console.error("Erro ao buscar informações do template:", error);
        toast.error("Erro ao carregar detalhes do template", { description: "Não foi possível obter informações detalhadas do template selecionado."
         });
      } finally {
        setLoadingTemplateInfo(false);
      }
    };

    fetchTemplateInfo();
  }, [selectedTemplateId, toast]);

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

  // Atualizar uma variável do template
  const updateVariable = (index: number, value: string) => {
    const newVariables = [...templateVariables];
    newVariables[index] = value;
    setTemplateVariables(newVariables);
  };

  // Função para enviar mensagens
  const enviarMensagens = async () => {
    if (!csvData) {
      toast.error("Arquivo CSV não carregado", { description: "Por favor, faça upload de um arquivo CSV com os contatos."
       });
      return;
    }
    
    if (!templateInfo) {
      toast.error("Template não selecionado", { description: "Por favor, selecione um template para envio."
       });
      return;
    }

    try {
      setEnviando(true);
      setProgresso(10);

      const payload = {
        csvData,
        templateName: templateInfo.nome,
        configuracoes: {
          variaveis: templateVariables
        }
      };

      setProgresso(30);
      
      const response = await axios.post('/api/admin/mtf-diamante/disparo', payload);
      
      setProgresso(100);
      setResultado(response.data);
      
      toast("Disparo concluído", {
        description: `${response.data.results.enviados} mensagens enviadas de ${response.data.results.total}.`
      });
    } catch (error: any) {
      toast.error("Erro no disparo", { description: error.response?.data?.error || "Ocorreu um erro ao enviar as mensagens."
       });
    } finally {
      setEnviando(false);
    }
  };

  // Obter cor da categoria
  const getCategoryColor = (category: string) => {
    switch (category?.toUpperCase()) {
      case 'UTILITY':
        return 'bg-blue-100 text-blue-800';
      case 'MARKETING':
        return 'bg-amber-100 text-amber-800';
      case 'AUTHENTICATION':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-2">Disparo em Massa</h1>
      <p className="text-muted-foreground mb-8">
        Envie mensagens para múltiplos contatos utilizando templates aprovados do WhatsApp.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Seleção de Template */}
          <Card>
            <CardHeader>
              <CardTitle>Selecione o Template</CardTitle>
              <CardDescription>
                Escolha um dos templates aprovados para usar no disparo em massa
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Select 
                  value={selectedTemplateId} 
                  onValueChange={setSelectedTemplateId}
                  disabled={loadingTemplates}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.length === 0 ? (
                      <SelectItem value="loading" disabled>
                        {loadingTemplates ? "Carregando..." : "Nenhum template disponível"}
                      </SelectItem>
                    ) : (
                      templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} - {template.category}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                
                {loadingTemplateInfo ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span>Carregando informações do template...</span>
                  </div>
                ) : templateInfo ? (
                  <div className="border rounded-md p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-medium">{templateInfo.nome}</h3>
                        <div className="text-xs text-muted-foreground">
                          {templateInfo.idioma || "pt_BR"}
                        </div>
                      </div>
                      <Badge variant="outline" className={getCategoryColor(templateInfo.categoria)}>
                        {templateInfo.categoria}
                      </Badge>
                    </div>
                    
                    <Separator className="my-3" />
                    
                    <div className="space-y-3">
                      {templateInfo.componentes.map((componente, idx) => (
                        <div key={idx} className="text-sm">
                          <div className="font-medium mb-1">{componente.tipo}</div>
                          {componente.texto && (
                            <div className="bg-slate-100 p-2 rounded-md whitespace-pre-line">
                              {componente.texto}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    {/* Variáveis */}
                    {templateVariables.length > 0 && (
                      <div className="mt-4 space-y-3">
                        <h4 className="text-sm font-medium">Variáveis</h4>
                        <p className="text-xs text-muted-foreground">
                          Defina valores para as variáveis do template. Estes valores serão utilizados para todos os contatos.
                        </p>
                        
                        <div className="space-y-2">
                          {templateInfo.componentes.map((componente) => 
                            componente.variaveis && componente.variaveis.length > 0 ? (
                              componente.variaveis.map((variavel, idx) => (
                                <div key={idx} className="grid grid-cols-4 gap-2 items-center">
                                  <Label className="col-span-1" htmlFor={`var-${idx}`}>
                                    {`{{${variavel.nome}}}`}
                                  </Label>
                                  <Input
                                    id={`var-${idx}`}
                                    className="col-span-3"
                                    placeholder={variavel.exemplo}
                                    value={templateVariables[idx] || ""}
                                    onChange={(e) => updateVariable(idx, e.target.value)}
                                  />
                                </div>
                              ))
                            ) : null
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Nenhum template selecionado</AlertTitle>
                    <AlertDescription>
                      Selecione um template para continuar com o disparo em massa.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* Upload de CSV */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Contatos</CardTitle>
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
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-medium">Contatos Carregados ({contacts.length})</h3>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setShowAllContacts(!showAllContacts)}
                    >
                      {showAllContacts ? "Mostrar menos" : "Ver todos"}
                    </Button>
                  </div>
                  <div className="border rounded-md overflow-hidden">
                    <div className="grid grid-cols-2 font-medium bg-accent p-2">
                      <div>Nome</div>
                      <div>Número</div>
                    </div>
                    <div className={cn("overflow-y-auto", showAllContacts ? "max-h-96" : "max-h-40")}>
                      {contacts.slice(0, showAllContacts ? contacts.length : 10).map((contact, index) => (
                        <div key={index} className="grid grid-cols-2 p-2 border-t">
                          <div>{contact.nome}</div>
                          <div>{contact.numero}</div>
                        </div>
                      ))}
                      {!showAllContacts && contacts.length > 10 && (
                        <div className="p-2 border-t text-center text-muted-foreground">
                          + {contacts.length - 10} contatos adicionais
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={enviarMensagens} 
                disabled={!csvData || !templateInfo || enviando}
                className="w-full"
              >
                {enviando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando mensagens...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Iniciar Disparo em Massa
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
          
          {/* Progresso e Resultado */}
          {enviando && (
            <Card>
              <CardHeader>
                <CardTitle>Progresso do Envio</CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={progresso} className="h-2" />
                <p className="text-center mt-2 text-sm text-muted-foreground">
                  Enviando mensagens... ({progresso}%)
                </p>
              </CardContent>
            </Card>
          )}
          
          {resultado && (
            <Card>
              <CardHeader>
                <CardTitle>Resultado do Envio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="bg-green-50 border border-green-200 rounded-md p-4">
                    <CheckCircle className="h-5 w-5 mx-auto text-green-500 mb-2" />
                    <p className="text-lg font-medium">{resultado.results.enviados}</p>
                    <p className="text-sm text-muted-foreground">Mensagens enviadas</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-4">
                    <AlertCircle className="h-5 w-5 mx-auto text-orange-500 mb-2" />
                    <p className="text-lg font-medium">{resultado.results.falhas}</p>
                    <p className="text-sm text-muted-foreground">Envios com falha</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Instruções de Uso</CardTitle>
              <CardDescription>
                Como utilizar o sistema de disparo em massa
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold flex items-center">
                  <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 inline-flex items-center justify-center text-xs mr-2">1</span>
                  Selecione um template
                </h3>
                <p className="text-sm text-muted-foreground mt-1 ml-7">
                  Escolha um dos templates aprovados disponíveis na sua conta.
                </p>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold flex items-center">
                  <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 inline-flex items-center justify-center text-xs mr-2">2</span>
                  Configure as variáveis
                </h3>
                <p className="text-sm text-muted-foreground mt-1 ml-7">
                  Se o template possuir variáveis, preencha-as com os valores desejados.
                </p>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold flex items-center">
                  <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 inline-flex items-center justify-center text-xs mr-2">3</span>
                  Prepare o arquivo CSV
                </h3>
                <p className="text-sm text-muted-foreground mt-1 ml-7">
                  Crie um arquivo CSV com as colunas "Nome" e "Numero", um contato por linha.
                </p>
                <div className="bg-slate-100 p-2 rounded-md mt-2 ml-7 text-xs">
                  <code>Nome,Numero</code><br />
                  <code>João Silva,11999999999</code><br />
                  <code>Maria Oliveira,21888888888</code>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold flex items-center">
                  <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 inline-flex items-center justify-center text-xs mr-2">4</span>
                  Envie as mensagens
                </h3>
                <p className="text-sm text-muted-foreground mt-1 ml-7">
                  Clique em "Iniciar Disparo em Massa" para começar o envio para todos os contatos.
                </p>
              </div>
              
              <Separator className="my-4" />
              
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Importante</AlertTitle>
                <AlertDescription className="text-xs">
                  <ul className="list-disc pl-4 mt-2 space-y-1">
                    <li>Use apenas templates aprovados pelo WhatsApp.</li>
                    <li>Todos os números receberão a mesma mensagem com as mesmas variáveis.</li>
                    <li>Certifique-se de que os números estão no formato correto (DDD + número).</li>
                    <li>O código do país (55) será adicionado automaticamente se necessário.</li>
                    <li>Evite enviar para grandes volumes em um curto período para não violar as políticas do WhatsApp.</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 